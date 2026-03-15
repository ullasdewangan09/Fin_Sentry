from __future__ import annotations

import os

_WEAK_JWT_MARKERS = {
    "",
    "CHANGE_ME_IN_PROD_use_a_long_random_string_here!",
    "change_me",
    "changeme",
}


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def validate_secret_configuration() -> list[str]:
    issues: list[str] = []
    jwt_secret = os.getenv("JWT_SECRET_KEY", "")
    if jwt_secret in _WEAK_JWT_MARKERS or len(jwt_secret) < 32:
        issues.append("JWT_SECRET_KEY is missing/weak (use a random 32+ char secret).")

    # GROQ key is optional for app operation, but required for AI chat/narratives.
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        issues.append("GROQ_API_KEY not set (AI narrative/chat features will be disabled).")

    return issues


def enforce_or_warn_secret_configuration() -> None:
    issues = validate_secret_configuration()
    if not issues:
        return

    strict = _is_truthy(os.getenv("STRICT_SECRET_VALIDATION"))
    if strict:
        joined = " ; ".join(issues)
        raise RuntimeError(f"Secret configuration failed: {joined}")

    for issue in issues:
        print(f"[SECURITY-CONFIG] WARNING: {issue}")
