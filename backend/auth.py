from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import AppConfig
from backend.models.user import User


def verify_admin_credentials(username: str, password: str, config: AppConfig) -> bool:
    user_ok = hmac.compare_digest(username.strip().lower(), config.admin_username.lower())
    pass_ok = hmac.compare_digest(password, config.admin_password)
    return user_ok and pass_ok


def create_auth_token(user_id: int, role: str, config: AppConfig) -> str:
    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(hours=config.auth_token_ttl_hours)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": issued_at.isoformat(),
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


def decode_token_if_valid(token: str, config: AppConfig) -> dict | None:
    try:
        return _decode_token(token, config)
    except HTTPException:
        return None


async def ensure_account_active(session: AsyncSession, payload: dict) -> None:
    """Reject tokens issued before the account was disabled or its password changed."""
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        return
    user = await session.get(User, user_id)
    if user is None or user.is_disabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable, please sign in again.")
    if user.credentials_updated_at is not None:
        updated_at = user.credentials_updated_at
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=UTC)
        issued_at_raw = payload.get("iat")
        if issued_at_raw is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please sign in again.")
        issued_at = datetime.fromisoformat(issued_at_raw)
        if issued_at.tzinfo is None:
            issued_at = issued_at.replace(tzinfo=UTC)
        if issued_at < updated_at:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please sign in again.")
