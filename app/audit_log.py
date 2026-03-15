from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AUDIT_LOG_PATH = Path("data/audit_events.log")
AUDIT_LOG_PATH.parent.mkdir(exist_ok=True)


def _hash_payload(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _last_hash() -> str:
    if not AUDIT_LOG_PATH.exists():
        return "GENESIS"
    try:
        lines = AUDIT_LOG_PATH.read_text(encoding="utf-8").splitlines()
        if not lines:
            return "GENESIS"
        last = json.loads(lines[-1])
        return str(last.get("hash") or "GENESIS")
    except Exception:
        return "GENESIS"


def record_audit_event(
    *,
    actor: str,
    role: str,
    action: str,
    outcome: str,
    resource: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Append an auditable event with hash-chain linkage for tamper evidence."""
    prev_hash = _last_hash()
    event = {
        "at": datetime.now(timezone.utc).isoformat(),
        "actor": actor,
        "role": role,
        "action": action,
        "outcome": outcome,
        "resource": resource,
        "details": details or {},
        "prev_hash": prev_hash,
    }
    event["hash"] = _hash_payload(event)

    with AUDIT_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=True) + "\n")
