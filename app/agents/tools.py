"""
LangChain tool definitions wrapping the existing pipeline functions.

Agent 1 tools  — load_and_clean_data, build_financial_graph, detect_fraud_risks
Agent 2 tools  — test_all_transactions, generate_audit_report
"""

from langchain_core.tools import tool

from app.state import state


# ---------------------------------------------------------------------------
# Agent 1 — Data & Detection tools
# ---------------------------------------------------------------------------

@tool
def load_and_clean_data() -> str:
    """
    Load all four CSV datasets (vendors, invoices, approvals, transactions)
    from the data/ directory, apply the full data-cleaning pipeline
    (whitespace stripping, ID normalisation, deduplication, referential-integrity
    checks, amount validation), and store the cleaned DataFrames in shared state.
    Returns a row-count summary per dataset and any cleaning issues found.
    """
    from app.loader import load_all_datasets

    try:
        results = load_all_datasets()
    except (FileNotFoundError, ValueError) as exc:
        return f"ERROR: {exc}"

    total_issues = sum(len(log["issues"]) for log in (state.cleaning_report or []))
    lines = ["Data loaded and cleaned successfully."]
    for name, df in results.items():
        lines.append(f"  {name}: {len(df)} rows")
    lines.append(f"Data quality: {total_issues} issue(s) detected.")
    if total_issues:
        for log in state.cleaning_report:
            for issue in log["issues"]:
                lines.append(f"  [{log['dataset']}] {issue}")
    return "\n".join(lines)


@tool
def build_financial_graph() -> str:
    """
    Construct the typed financial digital twin graph from the cleaned datasets
    held in state. Builds nodes for employees, vendors, invoices, approval
    decisions, and transactions connected by typed directed edges.
    Returns node and edge counts broken down by node type.
    """
    if state.vendors is None:
        return "ERROR: Data not loaded. Run load_and_clean_data first."

    from app.graph import build_graph

    G = build_graph()
    node_types: dict = {}
    for _, d in G.nodes(data=True):
        nt = d.get("node_type", "unknown")
        node_types[nt] = node_types.get(nt, 0) + 1

    lines = [f"Financial digital twin built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges."]
    for nt, count in node_types.items():
        lines.append(f"  {nt}: {count}")
    return "\n".join(lines)


@tool
def detect_fraud_risks() -> str:
    """
    Execute all 8 graph-traversal fraud-detection rules against the digital
    twin: segregation of duties, invoice splitting, rapid vendor-to-payment,
    large payment without senior approval, missing approval, duplicate invoice,
    amount mismatch, and dormant vendor reactivation.
    Returns the number of findings with a brief summary of each.
    """
    if state.graph is None:
        return "ERROR: Graph not built. Run build_financial_graph first."

    from app.risk import run_all_detections

    findings = run_all_detections()
    if not findings:
        return "No risk findings detected. All controls passed."

    lines = [f"{len(findings)} risk finding(s) detected:"]
    for f in findings:
        evidence = f["evidence"][0] if f["evidence"] else "no evidence"
        lines.append(f"  [{f['risk_type']}] Vendor: {f['vendor']} — {evidence}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Agent 2 — Investigation & Reporting tools
# ---------------------------------------------------------------------------

@tool
def test_all_transactions() -> str:
    """
    Run 5 internal controls against every transaction in the dataset:
    CTRL-1 invoice exists, CTRL-2 approval exists, CTRL-3 approver authority
    for large payments, CTRL-4 amount matches invoice, CTRL-5 segregation of
    duties (creator != approver). Returns per-transaction pass/fail results
    with reasons for any failures.
    """
    if state.graph is None:
        return "ERROR: Graph not built. Run build_financial_graph first."

    from app.transaction_tester import run_transaction_tests

    report = run_transaction_tests()
    s = report["summary"]
    lines = [
        f"Transaction testing complete: {s['total_transactions']} tested.",
        f"  Passed all controls: {s['fully_passed']}",
        f"  Has control failures: {s['has_failures']}",
        f"  Pass rate: {s['pass_rate']}",
        "",
        "Per-transaction results:",
    ]
    for r in report["results"]:
        line = f"  {r['transaction_id']} ({r['amount']}): {r['overall_status']}"
        fails = [c["detail"] for c in r["controls"] if c["status"] == "FAIL"]
        if fails:
            line += " — " + "; ".join(fails)
        lines.append(line)
    return "\n".join(lines)


@tool
def generate_audit_report() -> str:
    """
    Generate the full structured investigation report. Stamps the audit
    session timestamp, calls the Groq LLM (llama-3.1-8b-instant) to produce
    an executive audit narrative based on the detected risk findings, and
    stores the complete report in state. Returns a confirmation with a
    preview of the generated narrative.
    """
    if not state.risk_findings:
        return "ERROR: No risk findings in state. Run detect_fraud_risks first."

    from datetime import datetime, timezone
    from app.investigator import generate_report

    if state.audit_session is None:
        state.audit_session = {
            "run_at": datetime.now(timezone.utc).isoformat(),
            "records_analyzed": {
                "employees": len(state.employees) if state.employees is not None else 0,
                "vendors": len(state.vendors) if state.vendors is not None else 0,
                "invoices": len(state.invoices) if state.invoices is not None else 0,
                "approvals": len(state.approvals) if state.approvals is not None else 0,
                "transactions": len(state.transactions) if state.transactions is not None else 0,
            },
            "findings_count": len(state.risk_findings),
        }

    report = generate_report()
    preview = report["narrative"][:300].replace("\n", " ")
    return (
        f"Audit report generated.\n"
        f"  Total risks: {report['total_risks']}\n"
        f"  Audit session: {report['audit_session']['run_at']}\n"
        f"  Narrative preview: {preview}..."
    )
