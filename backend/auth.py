from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status

from backend.config import AppConfig


def verify_admin_credentials(username: str, password: str, config: AppConfig) -> bool:
    user_ok = hmac.compare_digest(username, config.admin_username)
    pass_ok = hmac.compare_digest(password, config.admin_password)
    return user_ok and pass_ok


def create_auth_token(user_id: int, role: str, config: AppConfig) -> str:
    expires_at = datetime.now(UTC) + timedelta(hours=config.auth_token_ttl_hours)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expires_at.isoformat(),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("ascii").rstrip("=")
    signature = hmac.new(
        config.auth_secret.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload_b64}.{signature}"


def _decode_token(token: str, config: AppConfig) -> dict:
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token") from exc

    expected = hmac.new(
        config.auth_secret.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token")

    padding = "=" * (-len(payload_b64) % 4)
    payload_bytes = base64.urlsafe_b64decode(f"{payload_b64}{padding}".encode("ascii"))
    payload = json.loads(payload_bytes.decode("utf-8"))

    expires_at = datetime.fromisoformat(payload["exp"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth token expired")

    return payload


def get_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return auth_header[7:].strip()


def require_auth(request: Request) -> dict:
    config: AppConfig = request.app.state.config
    token = get_bearer_token(request)
    return _decode_token(token, config)


def get_current_user(request: Request) -> tuple[int, str]:
    payload = require_auth(request)
    if "sub" not in payload or "role" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")
    return int(payload["sub"]), payload["role"]
