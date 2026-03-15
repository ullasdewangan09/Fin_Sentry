from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from eth_abi import encode as abi_encode
from eth_account import Account
from eth_utils import keccak


def _rpc_call(rpc_url: str, method: str, params: list[Any]) -> Any:
    payload = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000) % 1000000000,
        "method": method,
        "params": params,
    }
    resp = requests.post(rpc_url, json=payload, timeout=25)
    resp.raise_for_status()
    body = resp.json()
    if body.get("error"):
        err = body["error"]
        raise RuntimeError(f"RPC {method} error: {err}")
    return body.get("result")


def _hex_to_int(value: str | None) -> int:
    if value is None:
        return 0
    return int(value, 16)


def _int_to_hex(value: int) -> str:
    return hex(max(0, int(value)))


def encode_function_call(signature: str, arg_types: list[str], args: list[Any]) -> str:
    selector = keccak(text=signature)[:4]
    encoded_args = abi_encode(arg_types, args)
    return "0x" + (selector + encoded_args).hex()


def read_contract_call(*, rpc_url: str, contract_address: str, call_data: str) -> str:
    result = _rpc_call(
        rpc_url,
        "eth_call",
        [{"to": contract_address, "data": call_data}, "latest"],
    )
    return str(result or "0x")


def send_contract_tx(
    *,
    rpc_url: str,
    private_key: str,
    contract_address: str,
    call_data: str,
    chain_id: Optional[int] = None,
) -> dict[str, Any]:
    account = Account.from_key(private_key)
    resolved_chain_id = chain_id or _hex_to_int(_rpc_call(rpc_url, "eth_chainId", []))
    nonce = _hex_to_int(
        _rpc_call(rpc_url, "eth_getTransactionCount", [account.address, "pending"])
    )
    gas_price = _hex_to_int(_rpc_call(rpc_url, "eth_gasPrice", []))
    tx_for_estimate = {
        "from": account.address,
        "to": contract_address,
        "value": "0x0",
        "data": call_data,
    }
    try:
        gas_limit = _hex_to_int(_rpc_call(rpc_url, "eth_estimateGas", [tx_for_estimate]))
        gas_limit = int(gas_limit * 1.2)
    except Exception:
        gas_limit = 1_000_000

    tx = {
        "chainId": resolved_chain_id,
        "nonce": nonce,
        "to": contract_address,
        "value": 0,
        "data": call_data,
        "gas": gas_limit,
        "gasPrice": max(gas_price, 1),
    }
    signed = account.sign_transaction(tx)
    tx_hash = _rpc_call(rpc_url, "eth_sendRawTransaction", [signed.raw_transaction.hex()])
    return {
        "tx_hash": str(tx_hash),
        "submitter": account.address,
        "chain_id": resolved_chain_id,
    }


def wait_for_receipt(
    *,
    rpc_url: str,
    tx_hash: str,
    timeout_seconds: int = 120,
    poll_seconds: float = 1.0,
) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        receipt = _rpc_call(rpc_url, "eth_getTransactionReceipt", [tx_hash])
        if receipt:
            return receipt
        time.sleep(poll_seconds)
    raise TimeoutError(f"Timed out waiting for transaction receipt: {tx_hash}")


def block_timestamp_iso(rpc_url: str, block_number_hex: str) -> str:
    block = _rpc_call(rpc_url, "eth_getBlockByNumber", [block_number_hex, False])
    if not block:
        return datetime.now(timezone.utc).isoformat()
    ts = _hex_to_int(block.get("timestamp"))
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def decode_uint256_hex(value_hex: str) -> int:
    cleaned = value_hex[2:] if value_hex.startswith("0x") else value_hex
    if not cleaned:
        return 0
    return int(cleaned, 16)

