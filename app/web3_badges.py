from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path("data/cases.db")
ABI_PATH = Path("web3/abi/AuditBadgeRegistry.abi.json")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_unix_timestamp(value: Optional[str]) -> int:
    if not value:
        return int(datetime.now(timezone.utc).timestamp())
    normalised = value.replace("Z", "+00:00")
    return int(datetime.fromisoformat(normalised).timestamp())


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS web3_badges (
                badge_id            TEXT PRIMARY KEY,
                token_id            INTEGER NOT NULL,
                case_id             TEXT NOT NULL,
                anchor_id           TEXT NOT NULL,
                badge_type          TEXT NOT NULL,
                recipient_wallet    TEXT,
                metadata_uri        TEXT,
                metadata_json       TEXT NOT NULL,
                fingerprint         TEXT NOT NULL,
                status              TEXT NOT NULL,
                issued_at           TEXT NOT NULL,
                issued_at_unix      INTEGER NOT NULL,
                minted_at           TEXT,
                tx_hash             TEXT,
                block_number        INTEGER,
                chain_id            INTEGER,
                network             TEXT,
                contract_address    TEXT,
                submitter           TEXT,
                error_message       TEXT,
                created_by          TEXT NOT NULL,
                created_role        TEXT NOT NULL,
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_web3_badges_case_id ON web3_badges(case_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_web3_badges_fingerprint ON web3_badges(fingerprint)"
        )
        conn.commit()


_init_db()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    raw_metadata = item.get("metadata_json")
    if isinstance(raw_metadata, str):
        try:
            item["metadata"] = json.loads(raw_metadata)
        except Exception:
            item["metadata"] = {}
    else:
        item["metadata"] = {}
    item.pop("metadata_json", None)
    return item


def _load_abi() -> list[dict[str, Any]]:
    if not ABI_PATH.exists():
        raise RuntimeError(
            f"ABI file not found at '{ABI_PATH}'. Generate or copy ABI before minting on-chain."
        )
    with ABI_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _is_valid_eth_address(value: str) -> bool:
    if not isinstance(value, str):
        return False
    return value.startswith("0x") and len(value) == 42


def _get_latest_by_fingerprint(case_id: str, fingerprint: str) -> Optional[dict[str, Any]]:
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT * FROM web3_badges
            WHERE case_id = ? AND fingerprint = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (case_id, fingerprint),
        ).fetchone()
    if not row:
        return None
    return _row_to_dict(row)


def _next_local_token_id() -> int:
    with _get_conn() as conn:
        row = conn.execute("SELECT MAX(token_id) AS max_token_id FROM web3_badges").fetchone()
    current = int(row["max_token_id"] or 0)
    return current + 1


def _build_metadata(
    *,
    case: dict[str, Any],
    proof: dict[str, Any],
    badge_type: str,
    recipient_wallet: Optional[str],
    metadata_uri: Optional[str],
) -> dict[str, Any]:
    return {
        "name": f"{badge_type} - {case.get('case_id')}",
        "description": "NFT-style audit compliance badge linked to a tamper-evident case proof.",
        "badge_type": badge_type,
        "case_id": case.get("case_id"),
        "risk_label": case.get("risk_label"),
        "risk_type": case.get("risk_type"),
        "status": case.get("status"),
        "recipient_wallet": recipient_wallet,
        "proof": {
            "anchor_id": proof.get("anchor_id"),
            "event_hash": proof.get("event_hash"),
            "network": proof.get("network"),
            "tx_hash": proof.get("tx_hash"),
        },
        "metadata_uri": metadata_uri,
        "issued_at": _utc_now_iso(),
    }


def _try_issue_on_chain(record: dict[str, Any], commit_on_chain: bool) -> dict[str, Any]:
    if not commit_on_chain:
        return {
            "status": "simulated",
            "error_message": "On-chain mint skipped (commit_on_chain=false).",
            "token_id": record["token_id"],
        }

    rpc_url = os.getenv("WEB3_RPC_URL")
    private_key = os.getenv("WEB3_RELAYER_PRIVATE_KEY")
    contract_address = os.getenv("WEB3_BADGE_CONTRACT_ADDRESS")
    chain_id_env = os.getenv("WEB3_BADGE_CHAIN_ID") or os.getenv("WEB3_CHAIN_ID")
    network_name = os.getenv("WEB3_BADGE_NETWORK_NAME") or os.getenv("WEB3_NETWORK_NAME")

    if not rpc_url or not private_key or not contract_address:
        return {
            "status": "simulated",
            "error_message": (
                "Badge mint not configured. Set WEB3_RPC_URL, WEB3_RELAYER_PRIVATE_KEY, "
                "WEB3_BADGE_CONTRACT_ADDRESS to enable real minting."
            ),
            "token_id": record["token_id"],
        }

    try:
        from eth_account import Account
        from app.web3_rpc import (
            block_timestamp_iso,
            decode_uint256_hex,
            encode_function_call,
            read_contract_call,
            send_contract_tx,
            wait_for_receipt,
        )

        _load_abi()  # presence check for deployed-contract compatibility
        chain_id = int(chain_id_env) if chain_id_env else None

        account = Account.from_key(private_key)
        recipient_wallet = str(record.get("recipient_wallet") or "")
        recipient = account.address if not _is_valid_eth_address(recipient_wallet) else recipient_wallet

        next_token_call = encode_function_call("nextTokenId()", [], [])
        next_token_hex = read_contract_call(
            rpc_url=rpc_url, contract_address=contract_address, call_data=next_token_call
        )
        predicted_token_id = decode_uint256_hex(next_token_hex)
        if predicted_token_id <= 0:
            predicted_token_id = int(record["token_id"])

        issue_call = encode_function_call(
            "issueBadge(address,string,string,string,string,uint256)",
            ["address", "string", "string", "string", "string", "uint256"],
            [
                recipient,
                str(record["badge_type"]),
                str(record["case_id"]),
                str(record["anchor_id"]),
                str(record.get("metadata_uri") or ""),
                int(record["issued_at_unix"]),
            ],
        )
        sent = send_contract_tx(
            rpc_url=rpc_url,
            private_key=private_key,
            contract_address=contract_address,
            call_data=issue_call,
            chain_id=chain_id,
        )
        receipt = wait_for_receipt(rpc_url=rpc_url, tx_hash=str(sent["tx_hash"]), timeout_seconds=120)
        status_int = int(receipt.get("status", "0x0"), 16)
        block_number_hex = str(receipt.get("blockNumber"))

        return {
            "status": "submitted" if status_int == 1 else "queued",
            "error_message": None,
            "token_id": predicted_token_id,
            "tx_hash": str(sent["tx_hash"]),
            "block_number": int(block_number_hex, 16),
            "chain_id": int(sent["chain_id"]),
            "network": network_name or f"chain-{int(sent['chain_id'])}",
            "contract_address": contract_address,
            "submitter": sent["submitter"],
            "minted_at": block_timestamp_iso(rpc_url, block_number_hex),
            "recipient_wallet": recipient,
        }
    except Exception as exc:
        return {
            "status": "queued",
            "error_message": f"On-chain badge mint failed: {exc}",
            "token_id": record["token_id"],
        }


def issue_badge(
    *,
    case_id: str,
    badge_type: str,
    actor: str,
    role: str,
    recipient_wallet: Optional[str] = None,
    anchor_id: Optional[str] = None,
    metadata_uri: Optional[str] = None,
    commit_on_chain: bool = True,
    force_new: bool = False,
) -> dict[str, Any]:
    from app.cases import get_case
    from app.web3_anchor import get_proof, list_case_proofs

    case = get_case(case_id)
    if not case:
        raise ValueError(f"Case '{case_id}' not found.")

    proof: Optional[dict[str, Any]] = None
    if anchor_id:
        proof = get_proof(anchor_id)
        if proof and proof.get("case_id") != case_id:
            raise ValueError("anchor_id does not belong to the provided case_id.")
    if proof is None:
        proofs = list_case_proofs(case_id)
        proof = proofs[0] if proofs else None
    if proof is None:
        raise ValueError(
            "No anchor proof found for this case. Anchor the case first (Feature 1) before issuing a badge."
        )

    now = _utc_now_iso()
    issued_at = str(case.get("updated_at") or case.get("created_at") or now)
    issued_at_unix = _to_unix_timestamp(issued_at)

    metadata_payload = _build_metadata(
        case=case,
        proof=proof,
        badge_type=badge_type,
        recipient_wallet=recipient_wallet,
        metadata_uri=metadata_uri,
    )
    metadata_json = json.dumps(metadata_payload, sort_keys=True, separators=(",", ":"))

    fingerprint_material = (
        f"{case_id}:{proof.get('anchor_id')}:{badge_type}:{recipient_wallet or ''}:{metadata_json}"
    )
    fingerprint = _sha256_hex(fingerprint_material)

    existing = _get_latest_by_fingerprint(case_id=case_id, fingerprint=fingerprint)
    if existing and not force_new:
        existing["already_exists"] = True
        return existing

    token_id = _next_local_token_id()
    base_material = f"{fingerprint}:{token_id}"
    if force_new:
        base_material = f"{base_material}:{now}"
    badge_id = f"BADGE-{_sha256_hex(base_material)[:10].upper()}"

    metadata_uri_value = metadata_uri or f"local://badges/{case_id}/{badge_id.lower()}"
    status = "pending"

    draft = {
        "badge_id": badge_id,
        "token_id": token_id,
        "case_id": case_id,
        "anchor_id": str(proof.get("anchor_id")),
        "badge_type": badge_type,
        "recipient_wallet": recipient_wallet,
        "metadata_uri": metadata_uri_value,
        "metadata_json": metadata_json,
        "fingerprint": fingerprint,
        "status": status,
        "issued_at": issued_at,
        "issued_at_unix": issued_at_unix,
        "minted_at": None,
        "tx_hash": None,
        "block_number": None,
        "chain_id": None,
        "network": None,
        "contract_address": os.getenv("WEB3_BADGE_CONTRACT_ADDRESS"),
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
            INSERT INTO web3_badges (
                badge_id, token_id, case_id, anchor_id, badge_type, recipient_wallet,
                metadata_uri, metadata_json, fingerprint, status, issued_at, issued_at_unix,
                minted_at, tx_hash, block_number, chain_id, network, contract_address,
                submitter, error_message, created_by, created_role, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                draft["badge_id"],
                draft["token_id"],
                draft["case_id"],
                draft["anchor_id"],
                draft["badge_type"],
                draft["recipient_wallet"],
                draft["metadata_uri"],
                draft["metadata_json"],
                draft["fingerprint"],
                draft["status"],
                draft["issued_at"],
                draft["issued_at_unix"],
                draft["minted_at"],
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

    chain_result = _try_issue_on_chain(draft, commit_on_chain=commit_on_chain)
    updated_at = _utc_now_iso()

    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE web3_badges
            SET token_id = ?,
                status = ?,
                minted_at = ?,
                tx_hash = ?,
                block_number = ?,
                chain_id = ?,
                network = ?,
                contract_address = COALESCE(?, contract_address),
                submitter = ?,
                recipient_wallet = COALESCE(?, recipient_wallet),
                error_message = ?,
                updated_at = ?
            WHERE badge_id = ?
            """,
            (
                int(chain_result.get("token_id", token_id)),
                chain_result.get("status", "queued"),
                chain_result.get("minted_at"),
                chain_result.get("tx_hash"),
                chain_result.get("block_number"),
                chain_result.get("chain_id"),
                chain_result.get("network"),
                chain_result.get("contract_address"),
                chain_result.get("submitter"),
                chain_result.get("recipient_wallet"),
                chain_result.get("error_message"),
                updated_at,
                badge_id,
            ),
        )
        conn.commit()

    badge = get_badge(badge_id)
    if not badge:
        raise RuntimeError("Failed to load created badge record.")
    return badge


def list_case_badges(case_id: str) -> list[dict[str, Any]]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM web3_badges WHERE case_id = ? ORDER BY created_at DESC",
            (case_id,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def list_all_badges(limit: int = 200) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 1000))
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM web3_badges ORDER BY created_at DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_badge(badge_id: str) -> Optional[dict[str, Any]]:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM web3_badges WHERE badge_id = ?",
            (badge_id,),
        ).fetchone()
    if not row:
        return None
    return _row_to_dict(row)
