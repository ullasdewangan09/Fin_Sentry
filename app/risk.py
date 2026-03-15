from collections import defaultdict

import pandas as pd

from app.policy import POLICY, get_control_metadata
from app.state import state

RISK_METADATA = get_control_metadata()


def inr(amount: float) -> str:
    """Format a number as Indian Rupees with comma separator."""
    return f"\u20b9{amount:,.0f}"


def detect_segregation_of_duties(G) -> list:
    """
    Graph traversal: the employee who created a vendor cannot also be the
    approver on any ApprovalDecision node for that vendor's invoices.
    Path examined: employee → [created] → vendor → [issued] → invoice
                   → [has_approval] → ApprovalDecision (approved_by == creator)
    """
    findings = []

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "vendor":
            continue

        # Traverse: vendor ← [onboarded] ← VendorCreation — get the creator from there
        vc_nodes = [
            u for u, v, d in G.in_edges(node, data=True)
            if d.get("edge_type") == "onboarded"
        ]
        if not vc_nodes:
            continue
        vc_id = vc_nodes[0]
        creator = G.nodes[vc_id].get("created_by")
        if not creator:
            continue

        invoice_nodes = [
            v for u, v, d in G.out_edges(node, data=True)
            if d.get("edge_type") == "issued"
        ]

        self_approved = []
        for inv_id in invoice_nodes:
            for u, ad_id, d in G.out_edges(inv_id, data=True):
                if d.get("edge_type") != "has_approval":
                    continue
                if G.nodes[ad_id].get("approved_by") == creator:
                    self_approved.append((inv_id, ad_id, G.nodes[inv_id].get("amount", 0)))

        if not self_approved:
            continue

        total_exposure = sum(amt for _, _, amt in self_approved)
        findings.append({
            "risk_type": "segregation_of_duties",
            "vendor": data.get("name"),
            "vendor_id": node,
            "pathway": ["Vendor Creation", "Self Approval", "Invoice Approved by Creator"],
            "evidence": [
                f"Vendor {node} created by {creator}",
            ] + [
                f"Invoice {inv_id} (amount {inr(amt)}) approved by {creator} — same user as vendor creator"
                for inv_id, _, amt in self_approved
            ],
            "policy_violation": (
                "Segregation of Duties — the employee who created a vendor "
                "cannot approve invoices issued by that vendor"
            ),
            "effect": (
                f"Total financial exposure: {inr(total_exposure)} across "
                f"{len(self_approved)} self-approved invoice(s)"
            ),
            "recommendation": (
                "Immediately revoke vendor approval rights from the employee who "
                "created the vendor. Require a second approver for all historical "
                "invoices. Conduct a full review of all transactions associated "
                "with this vendor."
            ),
            "graph_path": [creator, vc_id, node] + [inv_id for inv_id, _, _ in self_approved],
        })

    return findings


def detect_invoice_splitting(G) -> list:
    """
    Graph traversal: multiple invoices from the same vendor node, all below
    the approval threshold, issued within a short time window — indicates
    deliberate splitting to avoid the approval requirement.
    Path examined: vendor → [issued] → invoice (amount < threshold, date in window)
    """
    findings = []

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "vendor":
            continue

        below_threshold = [
            (v, G.nodes[v]) for u, v, d in G.out_edges(node, data=True)
            if d.get("edge_type") == "issued"
            and G.nodes[v].get("amount", 0) < POLICY.invoice_approval_threshold
        ]

        if len(below_threshold) < POLICY.invoice_splitting_min_count:
            continue

        dates = [pd.Timestamp(inv_data["date"]) for _, inv_data in below_threshold]
        date_range = (max(dates) - min(dates)).days

        if date_range > POLICY.invoice_splitting_window_days:
            continue

        total_exposure = sum(inv_data.get("amount", 0) for _, inv_data in below_threshold)

        # Only flag if the combined total would have required approval — otherwise
        # the invoices are genuinely small regardless of how many there are.
        if total_exposure < POLICY.invoice_approval_threshold:
            continue
        findings.append({
            "risk_type": "invoice_splitting",
            "vendor": data.get("name"),
            "vendor_id": node,
            "pathway": [
                "Vendor Creation",
                "Invoice Splitting",
                "Multiple Payments Below Approval Threshold",
            ],
            "evidence": [
                f"Invoice {inv_id} amount {inr(inv_data.get('amount', 0))} "
                f"(threshold: {inr(POLICY.invoice_approval_threshold)})"
                for inv_id, inv_data in below_threshold
            ] + [
                f"{len(below_threshold)} invoices issued within {date_range} day(s)"
            ],
            "policy_violation": (
                f"Invoice Splitting — {len(below_threshold)} invoices below the "
                f"approval threshold of {inr(POLICY.invoice_approval_threshold)} "
                f"were issued within {date_range} day(s); combined total {inr(total_exposure)} "
                f"exceeds threshold"
            ),
            "effect": (
                f"Total value split across invoices: {inr(total_exposure)} — combined "
                f"total exceeds approval threshold of {inr(POLICY.invoice_approval_threshold)}"
            ),
            "recommendation": (
                "Block all pending payments for this vendor. Perform a consolidated "
                "approval review treating the split invoices as a single transaction "
                "above threshold. Report to Accounts Payable management."
            ),
            "graph_path": [node] + [inv_id for inv_id, _ in below_threshold],
        })

    return findings


def detect_rapid_vendor_to_payment(G) -> list:
    """
    Graph traversal: a newly created vendor that completes the full cycle
    (creation → invoice → payment) in fewer days than the policy allows.
    Path examined: vendor → [issued] → invoice → [paid_by] → transaction
    """
    findings = []

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "vendor":
            continue

        vendor_creation_date = pd.Timestamp(data.get("created_date"))

        invoice_nodes = [
            (v, G.nodes[v]) for u, v, d in G.out_edges(node, data=True)
            if d.get("edge_type") == "issued"
        ]
        if not invoice_nodes:
            continue

        all_transactions = []
        for inv_id, _ in invoice_nodes:
            for u, txn_id, d in G.out_edges(inv_id, data=True):
                if d.get("edge_type") == "paid_by":
                    all_transactions.append((txn_id, G.nodes[txn_id]))

        if not all_transactions:
            continue

        first_payment_date = min(
            pd.Timestamp(txn_data["date"]) for _, txn_data in all_transactions
        )
        delta_days = (first_payment_date - vendor_creation_date).days

        if delta_days > POLICY.rapid_payment_max_days:
            continue

        first_invoice_date = min(
            pd.Timestamp(inv_data["date"]) for _, inv_data in invoice_nodes
        )
        total_exposure = sum(txn_data.get("amount", 0) for _, txn_data in all_transactions)

        findings.append({
            "risk_type": "rapid_vendor_to_payment",
            "vendor": data.get("name"),
            "vendor_id": node,
            "pathway": [
                "Vendor Creation",
                "Rapid Invoice Issuance",
                "Rapid Payment Processing",
            ],
            "evidence": [
                f"Vendor created on {vendor_creation_date.date()}",
                f"First invoice issued on {first_invoice_date.date()}",
                f"First payment processed on {first_payment_date.date()}",
                f"Full cycle completed in {delta_days} day(s)",
                f"Total payments: {len(all_transactions)}",
            ],
            "policy_violation": (
                f"Rapid Vendor-to-Payment — full procurement cycle completed in "
                f"{delta_days} day(s), maximum allowed is {POLICY.rapid_payment_max_days} day(s)"
            ),
            "effect": (
                f"Total payment exposure: {inr(total_exposure)} processed without "
                "adequate vendor vetting time"
            ),
            "recommendation": (
                "Freeze further payments to this vendor. Conduct enhanced due "
                "diligence on vendor legitimacy. Verify that proper procurement "
                "channels were followed."
            ),
            "graph_path": (
                [node]
                + [inv_id for inv_id, _ in invoice_nodes]
                + [txn_id for txn_id, _ in all_transactions]
            ),
        })

    return findings


def detect_large_payment_no_senior_approver(G) -> list:
    """
    Graph traversal: any ApprovalDecision node whose linked invoice exceeds
    the large-payment threshold must have a senior approver. Flag violations.
    Path examined: invoice → [has_approval] → ApprovalDecision (approved_by ∉ senior_approvers)
    """
    findings = []

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "approval_decision":
            continue

        invoice_id = data.get("invoice_id")
        approved_by = data.get("approved_by")
        inv_data = G.nodes.get(invoice_id, {})
        amount = inv_data.get("amount", 0)

        if amount < POLICY.large_payment_threshold:
            continue
        if approved_by in POLICY.senior_approvers:
            continue

        vendor_nodes = [
            u for u, v, d in G.in_edges(invoice_id, data=True)
            if d.get("edge_type") == "issued"
        ]
        vendor_id = vendor_nodes[0] if vendor_nodes else "unknown"
        vendor_name = G.nodes.get(vendor_id, {}).get("name", "unknown")

        findings.append({
            "risk_type": "large_payment_no_senior_approver",
            "vendor": vendor_name,
            "vendor_id": vendor_id,
            "pathway": [
                "Invoice Above Large Payment Threshold",
                "Non-Senior Approver",
                "Payment Processed Without Senior Sign-off",
            ],
            "evidence": [
                f"Invoice {invoice_id} amount {inr(amount)} exceeds large payment "
                f"threshold of {inr(POLICY.large_payment_threshold)}",
                f"Approved by {approved_by}, who is not a designated senior approver",
                f"Designated senior approvers: {', '.join(sorted(POLICY.senior_approvers))}",
            ],
            "policy_violation": (
                f"Large Payment Control — invoices above {inr(POLICY.large_payment_threshold)} "
                "must be approved by a designated senior approver"
            ),
            "effect": (
                f"Financial exposure: {inr(amount)} authorized without required "
                "senior oversight"
            ),
            "recommendation": (
                "Obtain retrospective approval from a designated senior approver. "
                "Implement automated threshold enforcement in the ERP system to "
                "block non-senior approvals above this threshold."
            ),
            "graph_path": [vendor_id, invoice_id, node, approved_by],
        })

    return findings


def detect_missing_approval(G) -> list:
    """
    Graph traversal: an invoice node that has a paid_by edge to a transaction
    but no has_approval edge to any ApprovalDecision node — payment was made
    with zero approval on record.
    Path examined: vendor → invoice (no has_approval successor) → transaction
    """
    findings = []

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "invoice":
            continue

        approval_nodes = [
            v for u, v, d in G.out_edges(node, data=True)
            if d.get("edge_type") == "has_approval"
        ]
        transaction_nodes = [
            (v, G.nodes[v]) for u, v, d in G.out_edges(node, data=True)
            if d.get("edge_type") == "paid_by"
        ]

        if approval_nodes or not transaction_nodes:
            continue

        vendor_nodes = [
            u for u, v, d in G.in_edges(node, data=True)
            if d.get("edge_type") == "issued"
        ]
        vendor_id = vendor_nodes[0] if vendor_nodes else "unknown"
        vendor_name = G.nodes.get(vendor_id, {}).get("name", "unknown")

        amount = data.get("amount", 0)
        total_paid = sum(txn_data.get("amount", 0) for _, txn_data in transaction_nodes)

        findings.append({
            "risk_type": "missing_approval",
            "vendor": vendor_name,
            "vendor_id": vendor_id,
            "pathway": [
                "Invoice Issued",
                "No Approval Record",
                "Payment Processed",
            ],
            "evidence": [
                f"Invoice {node} for amount {inr(amount)} has no approval record in the system",
                f"Payment of {inr(total_paid)} was processed without any approval",
                f"Vendor: {vendor_name} ({vendor_id})",
            ],
            "policy_violation": (
                "Missing Approval — a payment was processed for an invoice with "
                "no approval record, entirely bypassing the approval control"
            ),
            "effect": (
                f"Unapproved payment of {inr(total_paid)} made without any authorization on record"
            ),
            "recommendation": (
                "Immediately halt any further payments to this vendor. Investigate "
                "who authorized the payment bypass and escalate to Internal Audit."
            ),
            "graph_path": [vendor_id, node] + [txn_id for txn_id, _ in transaction_nodes],
        })

    return findings


def detect_duplicate_invoice(G) -> list:
    """
    Graph traversal: multiple invoice nodes from the same vendor node with
    identical amounts — indicates potential duplicate payment fraud.
    Path examined: vendor → [issued] → invoice (grouped by vendor + amount)
    """
    findings = []
    vendor_amount_groups = defaultdict(list)

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "invoice":
            continue
        vendor_nodes = [
            u for u, v, d in G.in_edges(node, data=True)
            if d.get("edge_type") == "issued"
        ]
        if not vendor_nodes:
            continue
        vendor_id = vendor_nodes[0]
        amount = data.get("amount", 0)
        vendor_amount_groups[(vendor_id, amount)].append((node, data))

    reported_vendors = set()
    for (vendor_id, amount), invoice_list in vendor_amount_groups.items():
        if len(invoice_list) < 2:
            continue
        if vendor_id in reported_vendors:
            continue
        reported_vendors.add(vendor_id)

        vendor_name = G.nodes.get(vendor_id, {}).get("name", "unknown")
        total_paid = 0
        for inv_id, _ in invoice_list:
            for u, txn_id, d in G.out_edges(inv_id, data=True):
                if d.get("edge_type") == "paid_by":
                    total_paid += G.nodes[txn_id].get("amount", 0)

        findings.append({
            "risk_type": "duplicate_invoice",
            "vendor": vendor_name,
            "vendor_id": vendor_id,
            "pathway": [
                "Original Invoice Issued",
                "Duplicate Invoice Submitted",
                "Duplicate Payment Processed",
            ],
            "evidence": [
                f"Invoice {inv_id} for amount {inr(amount)} issued on {inv_data.get('date')}"
                for inv_id, inv_data in invoice_list
            ] + [
                f"{len(invoice_list)} invoices of identical amount ({inr(amount)}) "
                "detected from the same vendor"
            ],
            "policy_violation": (
                "Duplicate Invoice — multiple invoices of identical amount from "
                "the same vendor indicate potential duplicate payment fraud"
            ),
            "effect": (
                f"Potential duplicate payment of {inr(amount)} — "
                f"total paid: {inr(total_paid)} for what may be a single delivery"
            ),
            "recommendation": (
                "Request full documentation from vendor for each invoice. Initiate "
                "payment clawback procedures for the duplicate transaction. Review "
                "payment controls for duplicate detection."
            ),
            "graph_path": [vendor_id] + [inv_id for inv_id, _ in invoice_list],
        })

    return findings


def detect_amount_mismatch(G) -> list:
    """
    Graph traversal: for each invoice → paid_by → transaction edge, compare
    the amount property on both nodes. A discrepancy indicates the payment
    amount was altered after invoice approval.
    Path examined: invoice → [paid_by] → transaction (invoice.amount ≠ transaction.amount)
    """
    findings = []

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "invoice":
            continue

        invoice_amount = data.get("amount", 0)

        for u, txn_id, d in G.out_edges(node, data=True):
            if d.get("edge_type") != "paid_by":
                continue

            txn_data = G.nodes[txn_id]
            txn_amount = txn_data.get("amount", 0)

            if abs(txn_amount - invoice_amount) <= POLICY.amount_mismatch_tolerance:
                continue

            vendor_nodes = [
                u2 for u2, v2, d2 in G.in_edges(node, data=True)
                if d2.get("edge_type") == "issued"
            ]
            vendor_id = vendor_nodes[0] if vendor_nodes else "unknown"
            vendor_name = G.nodes.get(vendor_id, {}).get("name", "unknown")

            difference = txn_amount - invoice_amount
            pct = (difference / invoice_amount) * 100 if invoice_amount else 0

            findings.append({
                "risk_type": "amount_mismatch",
                "vendor": vendor_name,
                "vendor_id": vendor_id,
                "pathway": [
                    "Invoice Issued",
                    "Invoice Approved",
                    "Payment Amount Altered",
                    "Overpayment Processed",
                ],
                "evidence": [
                    f"Invoice {node} raised for {inr(invoice_amount)}",
                    f"Transaction {txn_id} paid {inr(txn_amount)}",
                    f"Discrepancy: {'+' if difference > 0 else ''}{inr(difference)} ({pct:+.1f}%)",
                ],
                "policy_violation": (
                    "Amount Mismatch — the transaction payment amount does not "
                    "match the approved invoice amount"
                ),
                "effect": (
                    f"Financial discrepancy of {inr(abs(difference))} — "
                    f"{'overpayment' if difference > 0 else 'underpayment'} detected"
                ),
                "recommendation": (
                    "Investigate the payment authorization chain. Recover the "
                    "overpaid amount from the vendor. Review bank payment system "
                    "integration for tampering."
                ),
                "graph_path": [vendor_id, node, txn_id],
            })

    return findings


def detect_dormant_vendor_reactivation(G) -> list:
    """
    Graph traversal: a vendor node whose first invoice neighbour appears many
    days after the vendor was created — indicates a long-dormant vendor
    suddenly reactivated, which warrants legitimacy verification.
    Path examined: vendor (created_date) → [issued] → invoice (date gap > threshold)
    """
    findings = []

    for node, data in G.nodes(data=True):
        if data.get("node_type") != "vendor":
            continue

        vendor_creation_date = pd.Timestamp(data.get("created_date"))

        invoice_nodes = [
            (v, G.nodes[v]) for u, v, d in G.out_edges(node, data=True)
            if d.get("edge_type") == "issued"
        ]
        if not invoice_nodes:
            continue

        first_invoice_date = min(
            pd.Timestamp(inv_data["date"]) for _, inv_data in invoice_nodes
        )
        dormancy_days = (first_invoice_date - vendor_creation_date).days

        if dormancy_days <= POLICY.dormancy_threshold_days:
            continue

        total_exposure = sum(inv_data.get("amount", 0) for _, inv_data in invoice_nodes)

        findings.append({
            "risk_type": "dormant_vendor_reactivation",
            "vendor": data.get("name"),
            "vendor_id": node,
            "pathway": [
                "Vendor Created",
                f"{dormancy_days} Days Dormant",
                "Sudden Invoice Activity",
            ],
            "evidence": [
                f"Vendor created on {vendor_creation_date.date()}",
                f"First invoice issued on {first_invoice_date.date()} "
                f"— {dormancy_days} day(s) after creation",
                f"No activity for {dormancy_days} day(s) before sudden reactivation",
            ],
            "policy_violation": (
                f"Dormant Vendor Reactivation — vendor was inactive for {dormancy_days} "
                f"day(s) before receiving invoices, exceeding the dormancy threshold "
                f"of {POLICY.dormancy_threshold_days} day(s)"
            ),
            "effect": (
                f"Total invoice value following reactivation: {inr(total_exposure)} "
                "— activity following long dormancy warrants vendor legitimacy verification"
            ),
            "recommendation": (
                "Verify vendor legitimacy and reactivation authorization. Confirm "
                "that dormant vendor review policies were followed. Escalate to "
                "vendor management team."
            ),
            "graph_path": [node] + [inv_id for inv_id, _ in invoice_nodes],
        })

    return findings


def run_all_detections() -> list:
    G = state.graph
    findings = []
    findings.extend(detect_segregation_of_duties(G))
    findings.extend(detect_invoice_splitting(G))
    findings.extend(detect_rapid_vendor_to_payment(G))
    findings.extend(detect_large_payment_no_senior_approver(G))
    findings.extend(detect_missing_approval(G))
    findings.extend(detect_duplicate_invoice(G))
    findings.extend(detect_amount_mismatch(G))
    findings.extend(detect_dormant_vendor_reactivation(G))
    for finding in findings:
        meta = RISK_METADATA.get(finding.get("risk_type"), {})
        finding.setdefault("control_ids", meta.get("control_ids", []))
        finding.setdefault("governance_area", meta.get("governance_area", "Governance"))
        finding.setdefault(
            "root_cause",
            meta.get("root_cause", "Control weakness detected across the financial pathway."),
        )
    state.risk_findings = findings

    # Persist findings as formal trackable investigation cases
    try:
        from app.cases import upsert_cases_from_findings
        upsert_cases_from_findings(findings)
    except Exception as exc:
        print(f"[CASES] Failed to persist cases: {exc}")

    return findings
