"""
Transaction Testing Module — per-transaction pass/fail control checks.

Each transaction is tested against five internal controls derived from the
financial digital twin graph. Results are returned as a structured list so
they can be surfaced via the /test-transactions API endpoint.
"""

from __future__ import annotations

import networkx as nx

from app.policy import POLICY
from app.state import state


def _fmt(amount: float) -> str:
    return f"₹{amount:,.0f}"


# ---------------------------------------------------------------------------
# Individual control checks
# ---------------------------------------------------------------------------

def _ctrl_invoice_exists(G: nx.DiGraph, t: dict) -> dict:
    """CONTROL-1: Transaction must reference a known invoice node."""
    inv_node = t["invoice_id"]
    if G.has_node(inv_node) and G.nodes[inv_node].get("node_type") == "invoice":
        return {"control": "CTRL-1: Invoice Exists", "status": "PASS",
                "detail": f"Invoice {t['invoice_id']} found in graph"}
    return {"control": "CTRL-1: Invoice Exists", "status": "FAIL",
            "detail": f"No invoice node for {t['invoice_id']} — orphan transaction"}


def _ctrl_approval_exists(G: nx.DiGraph, t: dict) -> dict:
    """CONTROL-2: Invoice behind this transaction must have an approval decision node."""
    inv_node = t["invoice_id"]
    if not (G.has_node(inv_node) and G.nodes[inv_node].get("node_type") == "invoice"):
        return {"control": "CTRL-2: Approval Exists", "status": "FAIL",
                "detail": "Cannot check — referenced invoice does not exist in graph"}

    approval_nodes = [
        nbr for nbr in G.successors(inv_node)
        if G.nodes[nbr].get("node_type") == "approval_decision"
    ]
    if approval_nodes:
        approver = G.nodes[approval_nodes[0]].get("approved_by", "unknown")
        return {"control": "CTRL-2: Approval Exists", "status": "PASS",
                "detail": f"Approval found (approved by {approver})"}
    return {"control": "CTRL-2: Approval Exists", "status": "FAIL",
            "detail": f"Invoice {t['invoice_id']} has no approval record"}


def _ctrl_approver_authority(G: nx.DiGraph, t: dict) -> dict:
    """CONTROL-3: Large payments must be approved by a senior approver."""
    amount = float(t["amount"])
    if amount < POLICY.large_payment_threshold:
        return {"control": "CTRL-3: Approver Authority", "status": "PASS",
                "detail": f"{_fmt(amount)} is below large-payment threshold — standard approval sufficient"}

    inv_node = t["invoice_id"]
    if not (G.has_node(inv_node) and G.nodes[inv_node].get("node_type") == "invoice"):
        return {"control": "CTRL-3: Approver Authority", "status": "FAIL",
                "detail": "Cannot check — referenced invoice does not exist in graph"}

    approval_nodes = [
        nbr for nbr in G.successors(inv_node)
        if G.nodes[nbr].get("node_type") == "approval_decision"
    ]
    if not approval_nodes:
        return {"control": "CTRL-3: Approver Authority", "status": "FAIL",
                "detail": f"No approval node; {_fmt(amount)} requires senior sign-off"}

    approver = G.nodes[approval_nodes[0]].get("approved_by", "")
    if approver in POLICY.senior_approvers:
        return {"control": "CTRL-3: Approver Authority", "status": "PASS",
                "detail": f"Senior approver {approver} authorised {_fmt(amount)}"}

    return {"control": "CTRL-3: Approver Authority", "status": "FAIL",
            "detail": (f"{_fmt(amount)} exceeds large-payment threshold {_fmt(POLICY.large_payment_threshold)} "
                       f"but approver '{approver}' is not a designated senior approver")}


def _ctrl_amount_matches_invoice(G: nx.DiGraph, t: dict) -> dict:
    """CONTROL-4: Transaction amount must match the invoice amount (within tolerance)."""
    inv_node = t["invoice_id"]
    if not (G.has_node(inv_node) and G.nodes[inv_node].get("node_type") == "invoice"):
        return {"control": "CTRL-4: Amount Matches Invoice", "status": "FAIL",
                "detail": "Cannot check — referenced invoice does not exist in graph"}

    invoice_amount = G.nodes[inv_node].get("amount")
    if invoice_amount is None:
        return {"control": "CTRL-4: Amount Matches Invoice", "status": "FAIL",
                "detail": "Invoice node has no amount attribute"}

    tx_amount = float(t["amount"])
    tolerance = POLICY.amount_mismatch_tolerance
    diff = abs(tx_amount - invoice_amount)

    if diff <= tolerance:
        return {"control": "CTRL-4: Amount Matches Invoice", "status": "PASS",
                "detail": f"Transaction {_fmt(tx_amount)} matches invoice {_fmt(invoice_amount)}"}

    return {"control": "CTRL-4: Amount Matches Invoice", "status": "FAIL",
            "detail": (f"Transaction {_fmt(tx_amount)} differs from invoice {_fmt(invoice_amount)} "
                       f"by {_fmt(diff)}")}


def _ctrl_segregation_of_duties(G: nx.DiGraph, t: dict) -> dict:
    """CONTROL-5: The person who approves must not be the same as the invoice creator."""
    inv_node = t["invoice_id"]
    if not (G.has_node(inv_node) and G.nodes[inv_node].get("node_type") == "invoice"):
        return {"control": "CTRL-5: Segregation of Duties", "status": "FAIL",
                "detail": "Cannot check — referenced invoice does not exist in graph"}

    creator = G.nodes[inv_node].get("created_by")
    approval_nodes = [
        nbr for nbr in G.successors(inv_node)
        if G.nodes[nbr].get("node_type") == "approval_decision"
    ]
    if not approval_nodes:
        return {"control": "CTRL-5: Segregation of Duties", "status": "FAIL",
                "detail": "No approval found — SoD cannot be verified"}

    approver = G.nodes[approval_nodes[0]].get("approved_by")
    if creator and approver and creator == approver:
        return {"control": "CTRL-5: Segregation of Duties", "status": "FAIL",
                "detail": f"Creator and approver are both '{creator}' — SoD violation"}

    return {"control": "CTRL-5: Segregation of Duties", "status": "PASS",
            "detail": f"Creator '{creator}' ≠ approver '{approver}'"}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_CONTROLS = [
    _ctrl_invoice_exists,
    _ctrl_approval_exists,
    _ctrl_approver_authority,
    _ctrl_amount_matches_invoice,
    _ctrl_segregation_of_duties,
]


def run_transaction_tests() -> dict:
    """
    Run all 5 controls against every transaction in the loaded dataset.
    Returns a summary dict with per-transaction results and aggregate counts.
    """
    if state.graph is None:
        raise RuntimeError("Graph not built. Call /build-graph first.")
    if state.transactions is None:
        raise RuntimeError("Data not loaded. Call /upload-data first.")

    G = state.graph
    results = []

    for _, row in state.transactions.iterrows():
        t = row.to_dict()
        controls = [ctrl(G, t) for ctrl in _CONTROLS]
        passed = sum(1 for c in controls if c["status"] == "PASS")
        failed = sum(1 for c in controls if c["status"] == "FAIL")
        overall = "PASS" if failed == 0 else "FAIL"

        # Resolve vendor for display: find vendor predecessor of invoice node
        inv_node = t["invoice_id"]
        vendor_id = "unknown"
        if G.has_node(inv_node):
            vendor_preds = [
                u for u, v, d in G.in_edges(inv_node, data=True)
                if d.get("edge_type") == "issued"
            ]
            if vendor_preds:
                vendor_id = vendor_preds[0]

        results.append({
            "transaction_id": t["transaction_id"],
            "invoice_id": t["invoice_id"],
            "vendor_id": vendor_id,
            "amount": _fmt(float(t["amount"])),
            "date": str(t.get("date", "")),
            "overall_status": overall,
            "controls_passed": passed,
            "controls_failed": failed,
            "controls": controls,
        })

    total = len(results)
    total_pass = sum(1 for r in results if r["overall_status"] == "PASS")
    total_fail = total - total_pass

    return {
        "summary": {
            "total_transactions": total,
            "fully_passed": total_pass,
            "has_failures": total_fail,
            "pass_rate": f"{(total_pass / total * 100):.1f}%" if total else "N/A",
        },
        "results": results,
    }
