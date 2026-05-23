import re
import secrets

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from backend.auth import create_auth_token, get_current_user, require_auth, verify_admin_credentials
from backend.config import AppConfig
from backend.passwords import hash_password, verify_password
from backend.services import mail_service, user_service

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    verification_code: str


class SendVerificationRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    password: str
    verification_code: str


class CreateUserRequest(BaseModel):
    email: str
    password: str


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    config: AppConfig = request.app.state.config
    limiter = request.app.state.login_rate_limiter
    session_maker = request.app.state.session_maker

    limiter.check(request, body.username)

    if verify_admin_credentials(body.username, body.password, config):
        limiter.reset(request, body.username)
        async with session_maker() as db:
            admin = await user_service.get_user_by_email(db, body.username)
            if admin is None:
                admin = await user_service.ensure_admin_user(
                    db, config.admin_username, hash_password(config.admin_password)
                )
                await db.commit()
            token = create_auth_token(admin.id, "admin", config)
        return {"token": token, "username": admin.email, "role": "admin"}

    async with session_maker() as db:
        user = await user_service.get_user_by_email(db, body.username.strip().lower())
        if user is None or not verify_password(body.password, user.password_hash):
            limiter.record_failure(request, body.username)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        limiter.reset(request, body.username)
        token = create_auth_token(user.id, user.role, config)
        return {"token": token, "username": user.email, "role": user.role}


@router.post("/register")
async def register(body: RegisterRequest, request: Request):
    config: AppConfig = request.app.state.config
    registration = config.registration
    session_maker = request.app.state.session_maker

    email = body.email.strip().lower()

    if not registration.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not enabled on this server.",
        )
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email address.")
    if len(body.password) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 10 characters.",
        )

    async with session_maker() as db:
        existing = await user_service.get_user_by_email(db, email)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

        if registration.max_users > 0:
            user_count = await user_service.count_regular_users(db)
            if user_count >= registration.max_users:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Beta registration is full.")

        verified = await user_service.verify_email_code(db, email, body.verification_code, config.auth_secret, "register")
        if not verified:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired verification code.")

        pw_hash = hash_password(body.password)
        user = await user_service.create_user(db, email, pw_hash, role="user")
        await db.commit()

    return {"accepted": True, "message": "Account created. You can now sign in."}


@router.post("/register/send-code")
async def send_registration_code(body: SendVerificationRequest, request: Request):
    config: AppConfig = request.app.state.config
    registration = config.registration
    session_maker = request.app.state.session_maker
    email = body.email.strip().lower()

    if not registration.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not enabled on this server.",
        )
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email address.")

    async with session_maker() as db:
        existing = await user_service.get_user_by_email(db, email)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
        if registration.max_users > 0:
            user_count = await user_service.count_regular_users(db)
            if user_count >= registration.max_users:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Beta registration is full.")

        code = f"{secrets.randbelow(1_000_000):06d}"
        await user_service.create_email_verification(
            db,
            email,
            code,
            config.auth_secret,
            registration.verification_ttl_minutes,
            "register",
        )
        await db.commit()

    try:
        mail_service.send_verification_email(registration, email, code, "register")
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send verification email.")

    return {"sent": True, "message": "Verification code sent."}


@router.post("/password-reset/send-code")
async def send_password_reset_code(body: SendVerificationRequest, request: Request):
    config: AppConfig = request.app.state.config
    registration = config.registration
    session_maker = request.app.state.session_maker
    email = body.email.strip().lower()

    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email address.")

    should_send = False
    code = f"{secrets.randbelow(1_000_000):06d}"
    async with session_maker() as db:
        existing = await user_service.get_user_by_email(db, email)
        if existing is not None:
            await user_service.create_email_verification(
                db,
                email,
                code,
                config.auth_secret,
                registration.verification_ttl_minutes,
                "reset_password",
            )
            await db.commit()
            should_send = True

    if should_send:
        try:
            mail_service.send_verification_email(registration, email, code, "reset_password")
        except Exception:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send verification email.")

    return {"sent": True, "message": "If the account exists, a verification code has been sent."}


@router.post("/password-reset")
async def reset_password(body: ResetPasswordRequest, request: Request):
    config: AppConfig = request.app.state.config
    session_maker = request.app.state.session_maker
    email = body.email.strip().lower()

    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email address.")
    if len(body.password) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 10 characters.",
        )

    async with session_maker() as db:
        user = await user_service.get_user_by_email(db, email)
        verified = await user_service.verify_email_code(db, email, body.verification_code, config.auth_secret, "reset_password")
        if user is None or not verified:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired verification code.")

        await user_service.update_user_password(db, user, hash_password(body.password))
        await db.commit()

    return {"accepted": True, "message": "Password reset. You can now sign in."}


@router.get("/config")
async def get_public_config(request: Request):
    config: AppConfig = request.app.state.config
    llm = config.llm
    payload = None
    try:
        payload = require_auth(request)
    except HTTPException:
        pass

    is_admin = payload is not None and payload.get("role") == "admin"

    return {
        "llm": {
            "provider": llm.provider,
            "model": llm.model if is_admin else "",
            "base_url": llm.base_url if is_admin and llm.base_url else "",
            "provider_options": [
                {"value": "ollama", "label": "Ollama (Local)"},
                {"value": "openai", "label": "OpenAI"},
                {"value": "anthropic", "label": "Anthropic"},
                {"value": "doubao", "label": "Doubao (Volcengine)"},
            ],
        }
    }


@router.get("/status")
async def get_auth_status(request: Request):
    try:
        payload = require_auth(request)
    except HTTPException:
        payload = None

    return {
        "authenticated": payload is not None,
        "username": payload.get("sub") if payload else None,
        "role": payload.get("role") if payload else None,
    }


# ── Invite code management (admin only) ──


@router.post("/invite-codes")
async def generate_invite_code(request: Request):
    user_id, role = get_current_user(request)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")

    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        code = await user_service.create_invite_code(db, user_id)
        await db.commit()
        return {"id": code.id, "code": code.code, "created_at": code.created_at.isoformat()}


@router.get("/invite-codes")
async def list_invite_codes_endpoint(request: Request):
    user_id, role = get_current_user(request)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")

    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        codes = await user_service.list_invite_codes(db)
        return [
            {
                "id": c.id,
                "code": c.code,
                "created_by": c.created_by,
                "used_by": c.used_by,
                "used_at": c.used_at.isoformat() if c.used_at else None,
                "created_at": c.created_at.isoformat(),
                "revoked": c.revoked,
            }
            for c in codes
        ]


@router.delete("/invite-codes/{code_id}")
async def revoke_invite_code_endpoint(code_id: int, request: Request):
    _, role = get_current_user(request)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")

    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        ok = await user_service.revoke_invite_code(db, code_id)
        if not ok:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite code not found.")
        await db.commit()
        return {"ok": True}


# ── User management (admin only, for internal beta) ──


@router.get("/users")
async def list_users_endpoint(request: Request):
    _, role = get_current_user(request)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")

    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        users = await user_service.list_users(db)
        return [
            {
                "id": u.id,
                "email": u.email,
                "role": u.role,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ]


@router.post("/users")
async def create_user_endpoint(body: CreateUserRequest, request: Request):
    _, role = get_current_user(request)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")

    email = body.email.strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters.",
        )

    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        existing = await user_service.get_user_by_email(db, email)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
        pw_hash = hash_password(body.password)
        user = await user_service.create_user(db, email, pw_hash, role="user")
        await db.commit()
        return {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at.isoformat(),
        }


@router.delete("/users/{user_id}")
async def delete_user_endpoint(user_id: int, request: Request):
    current_user_id, role = get_current_user(request)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    if user_id == current_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account.")

    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        ok = await user_service.delete_user(db, user_id)
        if not ok:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found or cannot be deleted.")
        await db.commit()
        return {"ok": True}
