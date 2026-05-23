from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.user import EmailVerification, InviteCode, User
from backend.models.word import Word


async def get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: int) -> Optional[User]:
    return await session.get(User, user_id)


async def create_user(session: AsyncSession, email: str, password_hash: str, role: str = "user") -> User:
    user = User(email=email, password_hash=password_hash, role=role)
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user


async def count_regular_users(session: AsyncSession) -> int:
    result = await session.execute(select(func.count()).select_from(User).where(User.role == "user"))
    return result.scalar() or 0


async def ensure_admin_user(session: AsyncSession, admin_email: str, admin_password_hash: str) -> User:
    result = await session.execute(select(User).where(User.role == "admin"))
    admin = result.scalar_one_or_none()
    if admin is not None:
        return admin
    admin = User(email=admin_email, password_hash=admin_password_hash, role="admin")
    session.add(admin)
    await session.flush()
    await session.refresh(admin)
    return admin


async def assign_orphan_words(session: AsyncSession, admin_user_id: int) -> int:
    result = await session.execute(
        update(Word).where(Word.user_id.is_(None)).values(user_id=admin_user_id)
    )
    await session.flush()
    return result.rowcount or 0


async def validate_invite_code(session: AsyncSession, code: str) -> Optional[InviteCode]:
    result = await session.execute(
        select(InviteCode).where(
            InviteCode.code == code,
            InviteCode.used_by.is_(None),
            InviteCode.revoked.is_(False),
        )
    )
    return result.scalar_one_or_none()


async def consume_invite_code(session: AsyncSession, invite_code_id: int, user_id: int) -> None:
    code = await session.get(InviteCode, invite_code_id)
    if code is None:
        return
    code.used_by = user_id
    code.used_at = datetime.now(UTC)
    await session.flush()


async def create_invite_code(session: AsyncSession, created_by: int) -> InviteCode:
    code_str = f"glm-{secrets.token_urlsafe(24)}"
    code = InviteCode(code=code_str, created_by=created_by)
    session.add(code)
    await session.flush()
    await session.refresh(code)
    return code


def hash_verification_code(email: str, code: str, secret: str) -> str:
    payload = f"{email.lower()}:{code}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


async def create_email_verification(
    session: AsyncSession,
    email: str,
    code: str,
    secret: str,
    ttl_minutes: int,
    purpose: str = "register",
) -> EmailVerification:
    normalized_email = email.strip().lower()
    verification = EmailVerification(
        email=normalized_email,
        purpose=purpose,
        code_hash=hash_verification_code(normalized_email, code, secret),
        expires_at=datetime.now(UTC) + timedelta(minutes=ttl_minutes),
    )
    session.add(verification)
    await session.flush()
    await session.refresh(verification)
    return verification


async def verify_email_code(
    session: AsyncSession,
    email: str,
    code: str,
    secret: str,
    purpose: str = "register",
) -> bool:
    normalized_email = email.strip().lower()
    result = await session.execute(
        select(EmailVerification)
        .where(
            EmailVerification.email == normalized_email,
            EmailVerification.purpose == purpose,
            EmailVerification.consumed_at.is_(None),
        )
        .order_by(EmailVerification.created_at.desc())
        .limit(1)
    )
    verification = result.scalar_one_or_none()
    if verification is None:
        return False

    now = datetime.now(UTC)
    expires_at = verification.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= now:
        return False
    if verification.attempts >= 5:
        return False

    verification.attempts += 1
    expected_hash = hash_verification_code(normalized_email, code.strip(), secret)
    if not hmac.compare_digest(verification.code_hash, expected_hash):
        await session.flush()
        return False

    verification.consumed_at = now
    await session.flush()
    return True


async def update_user_password(session: AsyncSession, user: User, password_hash: str) -> User:
    user.password_hash = password_hash
    await session.flush()
    await session.refresh(user)
    return user


async def list_invite_codes(session: AsyncSession) -> list[InviteCode]:
    result = await session.execute(
        select(InviteCode).order_by(InviteCode.created_at.desc())
    )
    return list(result.scalars().all())


async def list_users(session: AsyncSession) -> list[User]:
    result = await session.execute(select(User).order_by(User.id.asc()))
    return list(result.scalars().all())


async def delete_user(session: AsyncSession, user_id: int) -> bool:
    user = await session.get(User, user_id)
    if user is None:
        return False
    if user.role == "admin":
        return False
    await session.delete(user)
    await session.flush()
    return True


async def revoke_invite_code(session: AsyncSession, code_id: int) -> bool:
    code = await session.get(InviteCode, code_id)
    if code is None:
        return False
    code.revoked = True
    await session.flush()
    return True
