"""
JWT Authentication module — ported and simplified from the accepted team project.

Provides:
  - PBKDF2-HMAC-SHA256 password hashing
  - Password strength validation
  - JWT access token creation / verification (python-jose)
  - Per-user login lockout (5 failed attempts → 15 min lockout)
  - Bootstrap admin + auditor accounts on first run
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Dict, Optional
from uuid import uuid4

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CHANGE_ME_IN_PROD_use_a_long_random_string_here!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
ISSUER = "fintwin-audit"
AUDIENCE = "fintwin-audit"
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes

# —— Password hashing ————————————————————————————————————————————————————————————————

def _pbkdf2_hash(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 390_000)
    return base64.b64encode(digest).decode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    salt_b64 = base64.b64encode(salt).decode()
    digest = _pbkdf2_hash(password, salt)
    return f"{salt_b64}${digest}"


def verify_password(plain: str, stored_hash: str) -> bool:
    try:
        salt_b64, digest = stored_hash.split("$", 1)
        salt = base64.b64decode(salt_b64.encode())
    except ValueError:
        return False
    candidate = _pbkdf2_hash(plain, salt)
    return hmac.compare_digest(candidate, digest)


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must include an uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must include a lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must include a digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError("Password must include a special character")


# —— In-memory user store ———————————————————————————————————————————————————————————

class UserStore:
    """Thread-safe in-memory user store with lockout tracking."""

    def __init__(self) -> None:
        self._users: Dict[str, Dict] = {}
        self._attempts: Dict[str, list] = {}  # username → list of failure timestamps
        self._lock = Lock()

    def add_user(self, username: str, password: str, role: str = "auditor") -> None:
        with self._lock:
            self._users[username] = {
                "username": username,
                "password_hash": hash_password(password),
                "role": role,
                "is_active": True,
            }

    def get_user(self, username: str) -> Optional[Dict]:
        with self._lock:
            return self._users.get(username)

    def _is_locked_out(self, username: str) -> bool:
        now = time.time()
        attempts = self._attempts.get(username, [])
        recent = [t for t in attempts if now - t < LOCKOUT_SECONDS]
        self._attempts[username] = recent
        return len(recent) >= MAX_LOGIN_ATTEMPTS

    def _record_failure(self, username: str) -> None:
        self._attempts.setdefault(username, []).append(time.time())

    def _clear_failures(self, username: str) -> None:
        self._attempts.pop(username, None)

    def authenticate(self, username: str, password: str) -> Optional[Dict]:
        with self._lock:
            if self._is_locked_out(username):
                raise PermissionError(
                    f"Account locked after {MAX_LOGIN_ATTEMPTS} failed attempts. "
                    f"Try again in {LOCKOUT_SECONDS // 60} minutes."
                )
            user = self._users.get(username)
            if not user or not user["is_active"]:
                self._record_failure(username)
                return None
            if not verify_password(password, user["password_hash"]):
                self._record_failure(username)
                return None
            self._clear_failures(username)
            return {"username": username, "role": user["role"]}


# —— JWT ————————————————————————————————————————————————————————————————————————————————

def create_access_token(username: str, role: str) -> str:
    try:
        from jose import jwt as jose_jwt  # type: ignore
    except ImportError:
        raise RuntimeError("python-jose not installed. Run: pip install 'python-jose[cryptography]'")

    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": username,
        "role": role,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": expire,
        "iat": now,
        "nbf": now,
        "jti": str(uuid4()),
    }
    return jose_jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Dict[str, str]:
    try:
        from jose import jwt as jose_jwt, JWTError  # type: ignore
    except ImportError:
        raise RuntimeError("python-jose not installed. Run: pip install 'python-jose[cryptography]'")

    try:
        payload = jose_jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM], issuer=ISSUER, audience=AUDIENCE
        )
        return {"username": payload["sub"], "role": payload.get("role", "auditor")}
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc

# —— Bootstrap users ————————————————————————————————————————————————————————————————

# Default credentials for demo / hackathon use.
# In production, set accounts via environment:
#   BOOTSTRAP_USERS_JSON='[{"username":"alice","password":"SecureP@ss1","role":"admin"}]'

_DEFAULT_USERS = [
    {"username": "admin", "password": "Admin@12345", "role": "admin"},
    {"username": "auditor", "password": "Audit@12345", "role": "auditor"},
    {"username": "analyst", "password": "Analyst@12345", "role": "risk_analyst"},
]

user_store = UserStore()


def bootstrap_users() -> None:
    """Create default users; overrideable via BOOTSTRAP_USERS_JSON env var."""
    raw = os.getenv("BOOTSTRAP_USERS_JSON")
    accounts = json.loads(raw) if raw else _DEFAULT_USERS
    for account in accounts:
        user_store.add_user(
            username=account["username"],
            password=account["password"],
            role=account.get("role", "auditor"),
        )
    print(f"[AUTH] {len(accounts)} user account(s) bootstrapped.")
