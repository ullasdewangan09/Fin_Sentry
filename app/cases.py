"""
Formal Case Management — converts raw risk findings into trackable investigation cases.

Uses SQLite for persistence so cases survive server restarts.
Each finding is fingerprinted so re-running detection never creates duplicate cases.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path("data/cases.db")
DB_PATH.parent.mkdir(exist_ok=True)

RISK_SCORES: dict[str, float] = {
    "segregation_of_duties": 0.90,
    "missing_approval": 0.85,
    "invoice_splitting": 0.80,
    "rapid_vendor_to_payment": 0.70,
    "duplicate_invoice": 0.70,
    "large_payment_no_senior_approver": 0.65,
    "amount_mismatch": 0.60,
    "dormant_vendor_reactivation": 0.45,
}

RISK_LABELS: dict[str, str] = {
    "segregation_of_duties": "CRITICAL",
    "missing_approval": "CRITICAL",
    "invoice_splitting": "HIGH",
    "rapid_vendor_to_payment": "MEDIUM",
    "duplicate_invoice": "MEDIUM",
    "large_payment_no_senior_approver": "MEDIUM",
    "amount_mismatch": "LOW",
    "dormant_vendor_reactivation": "LOW",
}

VALID_STATUSES = {"open", "under_review", "escalated", "closed", "false_positive"}


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cases (
                case_id          TEXT PRIMARY KEY,
                trace_id         TEXT NOT NULL,
                vendor           TEXT,
                vendor_id        TEXT,
                risk_type        TEXT NOT NULL,
                risk_score       REAL NOT NULL,
                risk_label       TEXT NOT NULL,
                pathway          TEXT NOT NULL,
                evidence         TEXT NOT NULL,
                policy_violation TEXT,
                effect           TEXT,
                recommendation   TEXT,
                graph_path       TEXT,
                governance_area  TEXT,
                control_ids      TEXT,
                root_cause       TEXT,
                owner            TEXT,
                remediation_action TEXT,
                remediation_due_at TEXT,
                resolution_notes TEXT,
                escalated_to     TEXT,
                status           TEXT NOT NULL DEFAULT 'open',
                created_at       TEXT NOT NULL,
                updated_at       TEXT NOT NULL,
                timeline         TEXT NOT NULL
            )
        """)
        existing_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(cases)").fetchall()
        }
        wanted_columns = {
            "governance_area": "TEXT",
            "control_ids": "TEXT",
            "root_cause": "TEXT",
            "owner": "TEXT",
            "remediation_action": "TEXT",
            "remediation_due_at": "TEXT",
            "resolution_notes": "TEXT",
            "escalated_to": "TEXT",
        }
        for column, column_type in wanted_columns.items():
            if column not in existing_columns:
                conn.execute(f"ALTER TABLE cases ADD COLUMN {column} {column_type}")
        conn.commit()


_init_db()


def _finding_fingerprint(finding: dict) -> str:
    """Stable hash so the same finding always maps to the same case."""
    key = f"{finding.get('risk_type')}:{finding.get('vendor_id')}:{finding.get('policy_violation', '')}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def upsert_cases_from_findings(findings: list[dict]) -> list[dict]:
    """
    Convert risk findings into persisted cases.
    If a case for the same finding already exists it is updated in place;
    a new case is created otherwise. Returns the full list of current cases.
    """
    now = datetime.now(timezone.utc).isoformat()
    with _get_conn() as conn:
        for finding in findings:
            fingerprint = _finding_fingerprint(finding)
            existing = conn.execute(
                "SELECT case_id FROM cases WHERE trace_id = ?", (fingerprint,)
            ).fetchone()

            if existing:
                conn.execute(
                    """UPDATE cases SET evidence = ?, effect = ?, governance_area = ?,
                       control_ids = ?, root_cause = ?, recommendation = ?, updated_at = ?
                       WHERE trace_id = ?""",
                    (
                        json.dumps(finding.get("evidence", [])),
                        finding.get("effect", ""),
                        finding.get("governance_area"),
                        json.dumps(finding.get("control_ids", [])),
                        finding.get("root_cause"),
                        finding.get("recommendation"),
                        now,
                        fingerprint,
                    ),
                )
            else:
                case_id = f"CASE-{str(uuid.uuid4()).upper()[:8]}"
                timeline = json.dumps([{"event": "Case opened", "at": now, "by": "system"}])
                conn.execute(
                    """INSERT INTO cases
                       (case_id, trace_id, vendor, vendor_id, risk_type, risk_score,
                        risk_label, pathway, evidence, policy_violation, effect,
                        recommendation, graph_path, governance_area, control_ids,
                        root_cause, owner, remediation_action, remediation_due_at,
                        resolution_notes, escalated_to, status, created_at, updated_at, timeline)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        case_id,
                        fingerprint,
                        finding.get("vendor"),
                        finding.get("vendor_id"),
                        finding.get("risk_type"),
                        RISK_SCORES.get(finding.get("risk_type", ""), 0.5),
                        RISK_LABELS.get(finding.get("risk_type", ""), "MEDIUM"),
                        json.dumps(finding.get("pathway", [])),
                        json.dumps(finding.get("evidence", [])),
                        finding.get("policy_violation"),
                        finding.get("effect"),
                        finding.get("recommendation"),
                        json.dumps(finding.get("graph_path", [])),
                        finding.get("governance_area"),
                        json.dumps(finding.get("control_ids", [])),
                        finding.get("root_cause"),
                        None,
                        finding.get("recommendation"),
                        None,
                        None,
                        None,
                        "open",
                        now,
                        now,
                        timeline,
                    ),
                )
        conn.commit()

    return list_cases()


def list_cases() -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM cases ORDER BY risk_score DESC, created_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_case(case_id: str) -> Optional[dict]:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM cases WHERE case_id = ?", (case_id,)
        ).fetchone()
    return _row_to_dict(row) if row else None


def update_case_status(case_id: str, new_status: str, by: str = "user") -> Optional[dict]:
    if new_status not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{new_status}'. Allowed: {VALID_STATUSES}")
    now = datetime.now(timezone.utc).isoformat()
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT timeline FROM cases WHERE case_id = ?", (case_id,)
        ).fetchone()
        if not row:
            return None
        timeline = json.loads(row["timeline"])
        timeline.append({"event": f"Status changed to '{new_status}'", "at": now, "by": by})
        conn.execute(
            "UPDATE cases SET status = ?, updated_at = ?, timeline = ? WHERE case_id = ?",
            (new_status, now, json.dumps(timeline), case_id),
        )
        conn.commit()
    return get_case(case_id)


def update_case_governance(case_id: str, updates: dict, by: str = "user") -> Optional[dict]:
    allowed = {
        "owner",
        "remediation_action",
        "remediation_due_at",
        "resolution_notes",
        "escalated_to",
    }
    payload = {k: v for k, v in updates.items() if k in allowed}
    if not payload:
        return get_case(case_id)

    now = datetime.now(timezone.utc).isoformat()
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT timeline FROM cases WHERE case_id = ?", (case_id,)
        ).fetchone()
        if not row:
            return None
        timeline = json.loads(row["timeline"])
        timeline.append({
            "event": "Governance metadata updated",
            "at": now,
            "by": by,
        })
        assignments = ", ".join(f"{key} = ?" for key in payload)
        conn.execute(
            f"UPDATE cases SET {assignments}, updated_at = ?, timeline = ? WHERE case_id = ?",
            (*payload.values(), now, json.dumps(timeline), case_id),
        )
        conn.commit()
    return get_case(case_id)


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    for field in ("pathway", "evidence", "graph_path", "timeline", "control_ids"):
        if isinstance(d.get(field), str):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                d[field] = []
    return d
