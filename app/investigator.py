import json
import os

from openai import OpenAI

from app.state import state


def _compress_findings(findings: list) -> str:
    """
    Reduce findings to the fields the LLM needs for an actor-aware narrative.
    Includes the first two evidence strings (which name the specific employees
    involved) so the narrative can identify who performed each action.
    Strips graph paths, full evidence arrays, and recommendations.
    """
    compact = []
    for f in findings:
        evidence = f.get("evidence", [])
        compact.append({
            "risk": f.get("risk_type"),
            "vendor": f.get("vendor"),
            "violation": f.get("policy_violation"),
            "effect": f.get("effect"),
            # First two evidence strings name the actors (creator, approver, etc.)
            "actors": evidence[:2],
        })
    return json.dumps(compact, indent=2)


def _call_llm(findings: list) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return "LLM narrative unavailable — GROQ_API_KEY environment variable not set."

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
    )

    compact_findings = _compress_findings(findings)
    prompt = (
        "You are a senior financial auditor. "
        "Write a concise 4-sentence executive audit narrative based on the findings below. "
        "Name the specific actors (employee IDs) involved in the highest-risk finding. "
        "Cover: the highest-risk finding and which actors performed it, the pattern across all findings, and one immediate action. "
        "Be direct. No bullet points. No preamble.\n\n"
        f"Findings:\n{compact_findings}"
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=250,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        return f"LLM narrative unavailable — {exc}"


def generate_report() -> dict:
    findings = state.risk_findings
    narrative = _call_llm(findings)

    report = {
        "total_risks": len(findings),
        "audit_session": state.audit_session,
        "findings": findings,
        "narrative": narrative,
    }

    state.investigation_report = report
    return report
