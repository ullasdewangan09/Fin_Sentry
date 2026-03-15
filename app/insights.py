from __future__ import annotations

from collections import Counter, defaultdict

from app.cases import list_cases
from app.explainability import explain_case


def build_systemic_insights() -> dict:
    cases = list_cases()
    actor_counts: Counter[str] = Counter()
    vendor_counts: Counter[str] = Counter()
    risk_counts: Counter[str] = Counter()
    governance_counts: Counter[str] = Counter()
    control_counts: Counter[str] = Counter()
    co_occurrence: defaultdict[tuple[str, str], int] = defaultdict(int)

    for case in cases:
        explain_data = explain_case(case["case_id"])
        if not explain_data:
            continue

        vendor = case.get("vendor") or "Unknown Vendor"
        risk_type = case.get("risk_type") or "unknown"
        governance_area = case.get("governance_area") or "Governance"
        vendor_counts[vendor] += 1
        risk_counts[risk_type] += 1
        governance_counts[governance_area] += 1

        for control_id in case.get("control_ids") or []:
            control_counts[control_id] += 1

        actors = explain_data.get("why_flagged", {}).get("actors_involved", [])
        for actor in actors:
            actor_counts[actor] += 1
        for index, source in enumerate(actors):
            for target in actors[index + 1 :]:
                pair = tuple(sorted((source, target)))
                co_occurrence[pair] += 1

    top_pairs = [
        {"actors": list(pair), "count": count}
        for pair, count in sorted(co_occurrence.items(), key=lambda item: item[1], reverse=True)[:5]
    ]

    return {
        "total_cases": len(cases),
        "recurring_actors": [{"actor": actor, "count": count} for actor, count in actor_counts.most_common(5)],
        "recurring_vendors": [{"vendor": vendor, "count": count} for vendor, count in vendor_counts.most_common(5)],
        "risk_hotspots": [{"risk_type": risk_type, "count": count} for risk_type, count in risk_counts.most_common(8)],
        "governance_hotspots": [{"governance_area": area, "count": count} for area, count in governance_counts.most_common(6)],
        "control_hotspots": [{"control_id": control_id, "count": count} for control_id, count in control_counts.most_common(8)],
        "actor_pairs": top_pairs,
    }