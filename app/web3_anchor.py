from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path("data/cases.db")
ABI_PATH = Path("web3/abi/AuditEventRegistry.abi.json")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_unix_timestamp(value: Optional[str]) -> int:
    if not value:
        return int(datetime.now(timezone.utc).timestamp())
    normalised = value.replace("Z", "+00:00")
    return int(datetime.fromisoformat(normalised).timestamp())


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _to_bytes32_hex(value: str) -> str:
    v = value.lower()
    if v.startswith("0x"):
        v = v[2:]
    if len(v) != 64:
        raise ValueError("Expected 32-byte hex value.")
    return f"0x{v}"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS web3_proofs (
                anchor_id         TEXT PRIMARY KEY,
                case_id           TEXT NOT NULL,
                event_type        TEXT NOT NULL,
                entity_id         TEXT NOT NULL,
                event_hash        TEXT NOT NULL,
                ipfs_cid          TEXT,
                payload_json      TEXT NOT NULL,
                status            TEXT NOT NULL,
                occurred_at       TEXT NOT NULL,
                occurred_at_unix  INTEGER NOT NULL,
                anchored_at       TEXT,
                tx_hash           TEXT,
                block_number      INTEGER,
                chain_id          INTEGER,
                network           TEXT,
                contract_address  TEXT,
                submitter         TEXT,
                error_message     TEXT,
                created_by        TEXT NOT NULL,
                created_role      TEXT NOT NULL,
                created_at        TEXT NOT NULL,
                updated_at        TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_web3_proofs_case_id ON web3_proofs(case_id)"
        )
        conn.commit()


_init_db()


def _canonical_case_payload(case: dict[str, Any], event_type: str) -> dict[str, Any]:
    return {
        "event_type": event_type,
        "case_id": case.get("case_id"),
        "trace_id": case.get("trace_id"),
        "risk_type": case.get("risk_type"),
        "risk_score": case.get("risk_score"),
        "risk_label": case.get("risk_label"),
        "vendor_id": case.get("vendor_id"),
        "policy_violation": case.get("policy_violation"),
        "evidence": case.get("evidence") or [],
        "graph_path": case.get("graph_path") or [],
        "status": case.get("status"),
        "updated_at": case.get("updated_at"),
    }


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    raw_payload = item.get("payload_json")
    if isinstance(raw_payload, str):
        try:
            item["payload"] = json.loads(raw_payload)
        except Exception:
            item["payload"] = {}
    else:
        item["payload"] = {}
    item.pop("payload_json", None)
    return item


def _load_abi() -> list[dict[str, Any]]:
    if not ABI_PATH.exists():
        raise RuntimeError(
            f"ABI file not found at '{ABI_PATH}'. Generate or copy ABI before anchoring on-chain."
        )
    with ABI_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _try_anchor_on_chain(record: dict[str, Any], commit_on_chain: bool) -> dict[str, Any]:
    if not commit_on_chain:
        return {
            "status": "simulated",
            "error_message": "On-chain submit skipped (commit_on_chain=false).",
        }

    rpc_url = os.getenv("WEB3_RPC_URL")
    private_key = os.getenv("WEB3_RELAYER_PRIVATE_KEY")
    contract_address = os.getenv("WEB3_CONTRACT_ADDRESS")
    chain_id_env = os.getenv("WEB3_CHAIN_ID")
    network_name = os.getenv("WEB3_NETWORK_NAME")

    if not rpc_url or not private_key or not contract_address:
        return {
            "status": "simulated",
            "error_message": (
                "On-chain submit not configured. Set WEB3_RPC_URL, WEB3_RELAYER_PRIVATE_KEY, "
                "WEB3_CONTRACT_ADDRESS to enable real anchoring."
            ),
        }

    try:
        from app.web3_rpc import (
            block_timestamp_iso,
            encode_function_call,
            send_contract_tx,
            wait_for_receipt,
        )

        _load_abi()  # presence check for deployed-contract compatibility
        chain_id = int(chain_id_env) if chain_id_env else None

        anchor_hex = _to_bytes32_hex(str(record["anchor_id"]))
        event_hash_hex = _to_bytes32_hex(str(record["event_hash"]))
        call_data = encode_function_call(
            "anchorEvent(bytes32,bytes32,string,string,string,uint256)",
            ["bytes32", "bytes32", "string", "string", "string", "uint256"],
            [
                bytes.fromhex(anchor_hex[2:]),
                bytes.fromhex(event_hash_hex[2:]),
                str(record["event_type"]),
                str(record["entity_id"]),
                str(record.get("ipfs_cid") or ""),
                int(record["occurred_at_unix"]),
            ],
        )
        sent = send_contract_tx(
            rpc_url=rpc_url,
            private_key=private_key,
            contract_address=contract_address,
            call_data=call_data,
            chain_id=chain_id,
        )
        receipt = wait_for_receipt(rpc_url=rpc_url, tx_hash=str(sent["tx_hash"]), timeout_seconds=120)
        status_int = int(receipt.get("status", "0x0"), 16)
        block_number_hex = str(receipt.get("blockNumber"))

        return {
            "status": "submitted" if status_int == 1 else "queued",
            "error_message": None,
            "tx_hash": str(sent["tx_hash"]),
            "block_number": int(block_number_hex, 16),
            "chain_id": int(sent["chain_id"]),
            "network": network_name or f"chain-{int(sent['chain_id'])}",
            "contract_address": contract_address,
            "submitter": sent["submitter"],
            "anchored_at": block_timestamp_iso(rpc_url, block_number_hex),
        }
    except Exception as exc:
        return {
            "status": "queued",
            "error_message": f"On-chain submit failed: {exc}",
        }


def _get_latest_by_case_hash(case_id: str, event_hash: str) -> Optional[dict[str, Any]]:
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT * FROM web3_proofs
            WHERE case_id = ? AND event_hash = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (case_id, event_hash),
        ).fetchone()
    if not row:
        return None
    return _row_to_dict(row)


def anchor_case(
    *,
    case_id: str,
    event_type: str,
    actor: str,
    role: str,
    ipfs_cid: Optional[str] = None,
    commit_on_chain: bool = True,
    force_new: bool = False,
) -> dict[str, Any]:
    from app.cases import get_case

    case = get_case(case_id)
    if not case:
        raise ValueError(f"Case '{case_id}' not found.")

    payload = _canonical_case_payload(case, event_type=event_type)
    payload_str = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    event_hash = _to_bytes32_hex(_sha256_hex(payload_str))

    existing = _get_latest_by_case_hash(case_id=case_id, event_hash=event_hash)
    if existing and not force_new:
        existing["already_exists"] = True
        return existing

    now = _utc_now_iso()
    occurred_at = str(case.get("updated_at") or case.get("created_at") or now)
    occurred_at_unix = _to_unix_timestamp(occurred_at)

    anchor_material = f"{case_id}:{event_hash}"
    if force_new:
        anchor_material = f"{anchor_material}:{now}"
    anchor_id = _to_bytes32_hex(_sha256_hex(anchor_material))

    ipfs_value = ipfs_cid or f"local://cases/{case_id}/{anchor_id[2:14]}"

    draft = {
        "anchor_id": anchor_id,
        "case_id": case_id,
        "event_type": event_type,
        "entity_id": case_id,
        "event_hash": event_hash,
        "ipfs_cid": ipfs_value,
        "payload_json": payload_str,
        "status": "pending",
        "occurred_at": occurred_at,
        "occurred_at_unix": occurred_at_unix,
        "anchored_at": None,
        "tx_hash": None,
        "block_number": None,
        "chain_id": None,
        "network": None,
        "contract_address": os.getenv("WEB3_CONTRACT_ADDRESS"),
        "submitter": None,
        "error_message": None,
        "created_by": actor,
        "created_role": role,
        "created_at": now,
        "updated_at": now,
    }

    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO web3_proofs (
                anchor_id, case_id, event_type, entity_id, event_hash, ipfs_cid,
                payload_json, status, occurred_at, occurred_at_unix, anchored_at,
                tx_hash, block_number, chain_id, network, contract_address, submitter,
                error_message, created_by, created_role, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                draft["anchor_id"],
                draft["case_id"],
                draft["event_type"],
                draft["entity_id"],
                draft["event_hash"],
                draft["ipfs_cid"],
                draft["payload_json"],
                draft["status"],
                draft["occurred_at"],
                draft["occurred_at_unix"],
                draft["anchored_at"],
                draft["tx_hash"],
                draft["block_number"],
                draft["chain_id"],
                draft["network"],
                draft["contract_address"],
                draft["submitter"],
                draft["error_message"],
                draft["created_by"],
                draft["created_role"],
                draft["created_at"],
                draft["updated_at"],
            ),
        )
        conn.commit()

    chain_result = _try_anchor_on_chain(draft, commit_on_chain=commit_on_chain)
    updated_at = _utc_now_iso()

    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE web3_proofs
            SET status = ?,
                anchored_at = ?,
                tx_hash = ?,
                block_number = ?,
                chain_id = ?,
                network = ?,
                contract_address = COALESCE(?, contract_address),
                submitter = ?,
                error_message = ?,
                updated_at = ?
            WHERE anchor_id = ?
            """,
            (
                chain_result.get("status", "queued"),
                chain_result.get("anchored_at"),
                chain_result.get("tx_hash"),
                chain_result.get("block_number"),
                chain_result.get("chain_id"),
                chain_result.get("network"),
                chain_result.get("contract_address"),
                chain_result.get("submitter"),
                chain_result.get("error_message"),
                updated_at,
                anchor_id,
            ),
        )
        conn.commit()

    proof = get_proof(anchor_id)
    if not proof:
        raise RuntimeError("Failed to load created proof record.")
    return proof


def list_case_proofs(case_id: str) -> list[dict[str, Any]]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM web3_proofs WHERE case_id = ? ORDER BY created_at DESC",
            (case_id,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def list_all_proofs(limit: int = 200) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 1000))
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM web3_proofs ORDER BY created_at DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_proof(anchor_id: str) -> Optional[dict[str, Any]]:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM web3_proofs WHERE anchor_id = ?",
            (anchor_id,),
        ).fetchone()
    if not row:
        return None
    return _row_to_dict(row)
