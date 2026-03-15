import networkx as nx

from app.policy import CONTROL_CATALOG, POLICY
from app.state import state


def build_graph() -> nx.DiGraph:
    G = nx.DiGraph()

    vendors = state.vendors
    invoices = state.invoices
    approvals = state.approvals
    transactions = state.transactions

    # Build employee lookup from HR dataset (optional — gracefully absent)
    _emp_lookup: dict[str, dict] = {}
    if state.employees is not None:
        for _, emp_row in state.employees.iterrows():
            _emp_lookup[emp_row["employee_id"]] = {
                "name": emp_row["name"],
                "department": emp_row["department"],
                "job_title": emp_row["job_title"],
            }

    G.add_node(
        "policy_runtime",
        node_type="policy",
        name="Live Policy Runtime",
        invoice_approval_threshold=POLICY.invoice_approval_threshold,
        large_payment_threshold=POLICY.large_payment_threshold,
        rapid_payment_max_days=POLICY.rapid_payment_max_days,
        dormancy_threshold_days=POLICY.dormancy_threshold_days,
    )

    role_nodes = {
        "role_requestor": "Requester",
        "role_approver": "Approver",
        "role_senior_approver": "Senior Approver",
        "role_finance_ops": "Finance Operations",
    }
    for role_id, role_name in role_nodes.items():
        G.add_node(role_id, node_type="org_role", name=role_name)

    for control in CONTROL_CATALOG:
        G.add_node(
            control.control_id,
            node_type="control",
            name=control.name,
            governance_area=control.governance_area,
            severity=control.severity,
            objective=control.objective,
        )
        G.add_edge("policy_runtime", control.control_id, edge_type="defines_control")

    # Employee → performed → VendorCreation → onboarded → Vendor
    # VendorCreation is a first-class decision node representing the act of
    # registering a vendor in the system — a detectable decision pathway.
    for _, row in vendors.iterrows():
        vc_id = f"vc_{row['vendor_id']}"
        G.add_node(
            row["vendor_id"],
            node_type="vendor",
            name=row["name"],
            created_date=str(row["created_date"].date()),
            created_by=row["created_by"],
        )
        G.add_node(
            vc_id,
            node_type="vendor_creation",
            created_by=row["created_by"],
            created_date=str(row["created_date"].date()),
            vendor_id=row["vendor_id"],
        )
        G.add_node(row["created_by"], node_type="employee")
        G.add_edge(row["created_by"], "role_requestor", edge_type="holds_role")
        G.add_edge(
            row["created_by"],
            vc_id,
            edge_type="performed",
            date=str(row["created_date"].date()),
        )
        G.add_edge(
            vc_id,
            row["vendor_id"],
            edge_type="onboarded",
            date=str(row["created_date"].date()),
        )
        G.add_edge(vc_id, "CTRL-SOD-001", edge_type="governed_by")
        G.add_edge(row["vendor_id"], "CTRL-CYC-003", edge_type="monitored_by")
        G.add_edge(row["vendor_id"], "CTRL-VEN-008", edge_type="monitored_by")

    # Vendor → issued → Invoice
    for _, row in invoices.iterrows():
        G.add_node(row["created_by"], node_type="employee")
        G.add_edge(row["created_by"], "role_requestor", edge_type="holds_role")
        G.add_node(
            row["invoice_id"],
            node_type="invoice",
            amount=row["amount"],
            date=str(row["date"].date()),
            created_by=row["created_by"],
        )
        G.add_edge(
            row["vendor_id"],
            row["invoice_id"],
            edge_type="issued",
            date=str(row["date"].date()),
        )
        G.add_edge(row["invoice_id"], "CTRL-THR-002", edge_type="governed_by")
        G.add_edge(row["invoice_id"], "CTRL-APP-005", edge_type="governed_by")
        G.add_edge(row["invoice_id"], "CTRL-DUP-006", edge_type="governed_by")

    # Invoice → has_approval → ApprovalDecision → approved_by → Employee
    # Invoices with no approval row are intentionally absent — their missing
    # ApprovalDecision node is itself a detectable signal (ghost vendor / bypass).
    for _, row in approvals.iterrows():
        ad_id = f"AD-{row['invoice_id']}"
        G.add_node(
            ad_id,
            node_type="approval_decision",
            approved_by=row["approved_by"],
            invoice_id=row["invoice_id"],
        )
        G.add_node(row["approved_by"], node_type="employee")
        G.add_edge(row["approved_by"], "role_approver", edge_type="holds_role")
        if row["approved_by"] in POLICY.senior_approvers:
            G.add_edge(row["approved_by"], "role_senior_approver", edge_type="holds_role")
        G.add_edge(row["invoice_id"], ad_id, edge_type="has_approval")
        G.add_edge(ad_id, row["approved_by"], edge_type="approved_by")
        G.add_edge(ad_id, "CTRL-SOD-001", edge_type="governed_by")
        G.add_edge(ad_id, "CTRL-APP-004", edge_type="governed_by")

    # Invoice → paid_by → Transaction
    for _, row in transactions.iterrows():
        pd_id = f"PD-{row['transaction_id']}"
        approval_id = f"AD-{row['invoice_id']}"
        approver = G.nodes[approval_id].get("approved_by") if approval_id in G.nodes else None

        G.add_node(
            row["transaction_id"],
            node_type="transaction",
            amount=row["amount"],
            date=str(row["date"].date()),
        )
        G.add_node(
            pd_id,
            node_type="payment_decision",
            invoice_id=row["invoice_id"],
            transaction_id=row["transaction_id"],
            authorized_by=approver or "system_unapproved",
            decision_date=str(row["date"].date()),
        )
        G.add_edge(row["invoice_id"], pd_id, edge_type="ready_for_payment", date=str(row["date"].date()))
        G.add_edge(pd_id, row["transaction_id"], edge_type="authorized_payment", date=str(row["date"].date()))
        G.add_edge(
            row["invoice_id"],
            row["transaction_id"],
            edge_type="paid_by",
            date=str(row["date"].date()),
        )
        G.add_edge(row["transaction_id"], "CTRL-PAY-007", edge_type="governed_by")
        if approver:
            G.add_edge(approver, pd_id, edge_type="authorized_by")
            G.add_edge(approver, "role_finance_ops", edge_type="holds_role")
        else:
            G.add_edge(pd_id, "CTRL-APP-005", edge_type="violates_if_missing")

    # Enrich all employee nodes with HR metadata from employees.csv
    for node, data in G.nodes(data=True):
        if data.get("node_type") == "employee" and node in _emp_lookup:
            G.nodes[node].update(_emp_lookup[node])

    state.graph = G
    return G
