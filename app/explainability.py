"""
Explainability module — answers two PS-critical questions:
  1. WHY was this case flagged? (actors, rule triggered, policy context, counterfactuals)
  2. WHY was this transaction NOT flagged? (per-rule status check)
"""
from __future__ import annotations

import re
from typing import Optional

from app.cases import get_case
import app.policy as _pol
from app.state import state

RULE_DESCRIPTIONS: dict[str, str] = {
    "segregation_of_duties": (
        "This rule fires when the same employee who created a vendor also approved "
        "invoices issued by that vendor — a direct violation of Separation of Duties. "
        "The creator and approver must always be different individuals."
    ),
    "invoice_splitting": (
        "This rule fires when a vendor issues multiple invoices all below the approval "
        "threshold within a short time window, and their combined total exceeds the "
        "threshold. This pattern indicates deliberate splitting to bypass managerial sign-off."
    ),
    "rapid_vendor_to_payment": (
        "This rule fires when the full cycle from vendor creation to first payment "
        "completes faster than the policy minimum. Such speed may indicate a "
        "pre-arranged fraudulent vendor inserted to extract funds quickly."
    ),
    "large_payment_no_senior_approver": (
        "This rule fires when a high-value payment exceeds the large payment threshold "
        "but was not approved by a designated senior approver. Large payments require "
        "heightened scrutiny from authorised senior personnel."
    ),
    "missing_approval": (
        "This rule fires when an invoice has no corresponding approval record in the "
        "system. A payment processed without any approval represents a complete bypass "
        "of the authorization control — a ghost invoice or approval workflow failure."
    ),
    "duplicate_invoice": (
        "This rule fires when the same vendor submits two or more invoices with identical "
        "amounts on the same date. This is a classic signature of duplicate billing fraud."
    ),
    "amount_mismatch": (
        "This rule fires when the payment transaction amount does not match the amount "
        "on the linked invoice. A discrepancy beyond the permitted tolerance indicates "
        "potential post-approval payment manipulation."
    ),
    "dormant_vendor_reactivation": (
        "This rule fires when a vendor that has been inactive for an extended period "
        "suddenly issues a new invoice. Reactivated dormant vendors are a known fraud "
        "vector — they may represent shell companies activated for a single transaction."
    ),
}


def _get_counterfactuals(risk_type: str) -> list[str]:
    p = _pol.POLICY
    scenarios: dict[str, list[str]] = {
        "segregation_of_duties": [
            "If a different employee had approved the invoices, this rule would NOT have fired.",
            "If the vendor had been created by a different employee, this rule would NOT have fired.",
        ],
        "invoice_splitting": [
            f"If the invoices were spread more than {p.invoice_splitting_window_days} days apart, "
            "this rule would NOT have fired.",
            f"If fewer than {p.invoice_splitting_min_count} invoices were below the threshold, "
            "this rule would NOT have fired.",
            f"If the combined total remained below ₹{p.invoice_approval_threshold:,.0f}, "
            "this rule would NOT have fired.",
        ],
        "rapid_vendor_to_payment": [
            f"If the first payment had occurred more than {p.rapid_payment_max_days} days after "
            "vendor creation, this rule would NOT have fired.",
        ],
        "large_payment_no_senior_approver": [
            f"If a designated senior approver ({', '.join(sorted(p.senior_approvers))}) had "
            "approved the invoice, this rule would NOT have fired.",
            f"If the payment were below ₹{p.large_payment_threshold:,.0f}, this rule would NOT "
            "have fired.",
        ],
        "missing_approval": [
            "If an approval record existed for the invoice in the system, this rule would NOT "
            "have fired.",
        ],
        "duplicate_invoice": [
            "If the invoices had different amounts, this rule would NOT have fired.",
            "If the invoices were on different dates, this rule would NOT have fired.",
        ],
        "amount_mismatch": [
            f"If the transaction amount matched the invoice amount within ₹{p.amount_mismatch_tolerance:,.0f}, "
            "this rule would NOT have fired.",
        ],
        "dormant_vendor_reactivation": [
            f"If the vendor had been active within the past {p.dormancy_threshold_days} days, "
            "this rule would NOT have fired.",
        ],
    }
    return scenarios.get(risk_type, ["No specific counterfactual defined for this rule type."])


def explain_case(case_id: str) -> Optional[dict]:
    """Full explainability report for a flagged case."""
    case = get_case(case_id)
    if not case:
        return None

    risk_type = case["risk_type"]
    evidence = case.get("evidence", [])
    graph_path = case.get("graph_path", [])
    p = _pol.POLICY

    # Extract actor IDs (user_XXX pattern) from evidence strings
    actors: list[str] = []
    seen: set[str] = set()
    for ev in evidence:
        for match in re.findall(r"user_\w+", ev):
            if match not in seen:
                actors.append(match)
                seen.add(match)

    # Build traceability chain from graph_path nodes
    traceability: list[dict] = []
    G = state.graph
    if G:
        for i, node_id in enumerate(graph_path):
            node_str = str(node_id)
            if node_str in G.nodes:
                nd = dict(G.nodes[node_str])
                traceability.append({
                    "step": i + 1,
                    "node": node_str,
                    "type": nd.pop("node_type", "unknown"),
                    "details": nd,
                })

    return {
        "case_id": case_id,
        "risk_type": risk_type,
        "vendor": case.get("vendor"),
        "risk_score": case.get("risk_score"),
        "risk_label": case.get("risk_label"),
        "governance_area": case.get("governance_area"),
        "control_ids": case.get("control_ids", []),
        "root_cause": case.get("root_cause"),
        "why_flagged": {
            "summary": case.get("policy_violation", ""),
            "rule_description": RULE_DESCRIPTIONS.get(risk_type, "No description available."),
            "actors_involved": actors,
            "evidence": evidence,
        },
        "control_bypass_narrative": (
            f"This case points to a structural bypass in {case.get('governance_area', 'the control environment')}. "
            f"The pathway linked {len(graph_path)} graph node(s) and implicated control(s) "
            f"{', '.join(case.get('control_ids') or ['unmapped control'])}."
        ),
        "policy_context": {
            "invoice_approval_threshold": p.invoice_approval_threshold,
            "large_payment_threshold": p.large_payment_threshold,
            "rapid_payment_max_days": p.rapid_payment_max_days,
            "invoice_splitting_window_days": p.invoice_splitting_window_days,
            "invoice_splitting_min_count": p.invoice_splitting_min_count,
            "dormancy_threshold_days": p.dormancy_threshold_days,
            "senior_approvers": sorted(p.senior_approvers),
        },
        "counterfactual_analysis": {
            "question": "Under what conditions would this case NOT have been flagged?",
            "scenarios": _get_counterfactuals(risk_type),
        },
        "traceability": traceability,
    }


def explain_transaction_not_flagged(transaction_id: str) -> dict:
    """Explain why a transaction was not raised as a risk finding."""
    G = state.graph
    p = _pol.POLICY

    if not G:
        return {"error": "Graph not built. Run the audit pipeline first."}
    if transaction_id not in G.nodes:
        return {"error": f"Transaction '{transaction_id}' not found in the graph."}

    txn_data = G.nodes[transaction_id]
    amount = txn_data.get("amount", 0)
    txn_date = txn_data.get("date")

    # Find invoice linked to this transaction
    invoice_id: Optional[str] = None
    for src, _, edata in G.in_edges(transaction_id, data=True):
        if edata.get("edge_type") == "paid_by":
            invoice_id = src
            break

    # Find vendor linked to that invoice
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    if invoice_id:
        for src, _, edata in G.in_edges(invoice_id, data=True):
            if edata.get("edge_type") == "issued":
                vendor_id = src
                vendor_name = G.nodes[src].get("name")
                break

    # Determine if this transaction appears in any finding's graph_path
    flagged_paths: set[str] = set()
    for finding in (state.risk_findings or []):
        flagged_paths.update(str(n) for n in finding.get("graph_path", []))
    is_flagged = transaction_id in flagged_paths

    reasons: list[str] = []

    # Check: invoice has approval
    if invoice_id:
        has_approval = any(
            True for _, _, ed in G.out_edges(invoice_id, data=True)
            if ed.get("edge_type") == "has_approval"
        )
        if has_approval:
            reasons.append(
                "✓ Invoice has a valid approval record — missing_approval rule does not apply."
            )

    # Check: amount below large payment threshold
    if amount < p.large_payment_threshold:
        reasons.append(
            f"✓ Amount ₹{amount:,.0f} is below large payment threshold ₹{p.large_payment_threshold:,.0f} "
            "— large_payment rule does not apply."
        )

    # Check: amount matches invoice
    if invoice_id:
        inv_amount = G.nodes[invoice_id].get("amount", 0) or 0
        if abs(amount - inv_amount) <= p.amount_mismatch_tolerance:
            reasons.append(
                f"✓ Amount ₹{amount:,.0f} matches invoice amount ₹{inv_amount:,.0f} "
                f"(tolerance ₹{p.amount_mismatch_tolerance:,.0f}) — amount_mismatch rule does not apply."
            )

    # Check: segregation of duties — vendor not created by approver
    if invoice_id and vendor_id:
        # Get vendor creator
        vc_nodes = [u for u, v, d in G.in_edges(vendor_id, data=True) if d.get("edge_type") == "onboarded"]
        creator = G.nodes[vc_nodes[0]].get("created_by") if vc_nodes else None
        approver = None
        for _, ad_id, ed in G.out_edges(invoice_id, data=True):
            if ed.get("edge_type") == "has_approval":
                approver = G.nodes[ad_id].get("approved_by")
                break
        if creator and approver and creator != approver:
            reasons.append(
                f"✓ Vendor creator ({creator}) ≠ invoice approver ({approver}) "
                "— segregation_of_duties rule does not apply."
            )

    if not reasons:
        reasons.append("Transaction did not trigger any of the 8 active detection rules.")

    return {
        "transaction_id": transaction_id,
        "amount": amount,
        "date": txn_date,
        "invoice_id": invoice_id,
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "is_in_risk_pathway": is_flagged,
        "reasons_not_flagged": reasons,
        "policy_thresholds_checked": {
            "large_payment_threshold": p.large_payment_threshold,
            "amount_mismatch_tolerance": p.amount_mismatch_tolerance,
            "rapid_payment_max_days": p.rapid_payment_max_days,
            "senior_approvers": sorted(p.senior_approvers),
        },
    }
