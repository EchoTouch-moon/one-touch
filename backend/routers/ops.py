from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from backend.auth import get_current_user
from backend.config import AppConfig
from backend.models.definition import Definition
from backend.models.review import ReviewLog
from backend.models.user import User
from backend.models.word import Word
from backend.services.backup_service import sqlite_path_from_url
from backend.services.ops_service import append_jsonl, read_jsonl_tail, summarize_enrich_events

router = APIRouter(prefix="/ops", tags=["ops"])


class ClientErrorCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    stack: str = Field(default="", max_length=12000)
    source: str = Field(default="frontend", max_length=80)
    url: str = Field(default="", max_length=2000)
    user_agent: str = Field(default="", max_length=500)
    build_version: str = Field(default="", max_length=120)
    build_date: str = Field(default="", max_length=120)


class FeedbackCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    page_url: str = Field(default="", max_length=2000)
    user_agent: str = Field(default="", max_length=500)
    build_version: str = Field(default="", max_length=120)
    build_date: str = Field(default="", max_length=120)


class OpsStatusResponse(BaseModel):
    version: str
    build_date: str
    database_engine: str
    database_path: str = ""
    database_exists: bool = False
    backup_enabled: bool
    backup_dir: str
    backup_retention_days: int
    llm_provider: str
    llm_model: str
    llm_configured: bool
    enrich_daily_limit: int
    enrich_recent_total: int = 0
    enrich_by_status: dict[str, int] = {}
    enrich_avg_duration_ms: float | None = None
    regular_user_count: int = 0
    disabled_user_count: int = 0
    registration_enabled: bool = False
    registration_max_users: int = 0
    active_users_7d: int = 0
    reviews_7d: int = 0
    latest_backup_at: str | None = None
    latest_backup_path: str = ""
    handwriting_ink_count: int = 0
    handwriting_image_count: int = 0
    handwriting_ink_bytes: int = 0
    handwriting_image_bytes: int = 0
    recent_feedback: list[dict] = Field(default_factory=list)
    recent_client_errors: list[dict] = Field(default_factory=list)


def _latest_backup(config: AppConfig) -> tuple[str | None, str]:
    backup_dir = Path(config.ops.backup_dir)
    if not backup_dir.exists():
        return None, ""
    candidates = sorted(backup_dir.glob("words-*.db"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not candidates:
        return None, ""
    latest = candidates[0]
    latest_at = datetime.fromtimestamp(latest.stat().st_mtime, tz=UTC).isoformat()
    return latest_at, str(latest)


@router.get("/version")
async def get_version(request: Request):
    config = request.app.state.config
    return {
        "version": config.ops.app_version,
        "build_date": config.ops.build_date,
        "backup_enabled": config.ops.backup_enabled,
        "backup_retention_days": config.ops.backup_retention_days,
    }


@router.get("/status", response_model=OpsStatusResponse)
async def get_status(request: Request):
    user_id, role = get_current_user(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    config: AppConfig = request.app.state.config
    session_maker = request.app.state.session_maker
    sqlite_path = sqlite_path_from_url(config.database.url)
    llm = config.llm
    enrich_summary = summarize_enrich_events(config)
    latest_backup_at, latest_backup_path = _latest_backup(config)
    async with session_maker() as db:
        regular_user_count = (await db.execute(select(func.count()).select_from(User).where(User.role == "user"))).scalar() or 0
        disabled_user_count = (
            await db.execute(select(func.count()).select_from(User).where(User.role == "user", User.is_disabled.is_(True)))
        ).scalar() or 0
        seven_days_ago = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=7)
        active_users_7d = (
            await db.execute(
                select(func.count(func.distinct(Word.user_id)))
                .select_from(ReviewLog)
                .join(Word, Word.id == ReviewLog.word_id)
                .where(ReviewLog.reviewed_at >= seven_days_ago)
            )
        ).scalar() or 0
        reviews_7d = (
            await db.execute(select(func.count()).select_from(ReviewLog).where(ReviewLog.reviewed_at >= seven_days_ago))
        ).scalar() or 0
        handwriting_ink = await db.execute(
            select(func.count(), func.coalesce(func.sum(func.length(Definition.ink_data)), 0)).where(Definition.ink_data.is_not(None))
        )
        handwriting_image = await db.execute(
            select(func.count(), func.coalesce(func.sum(func.length(Definition.canvas_image)), 0)).where(Definition.canvas_image.is_not(None))
        )
        handwriting_ink_count, handwriting_ink_bytes = handwriting_ink.one()
        handwriting_image_count, handwriting_image_bytes = handwriting_image.one()
    return OpsStatusResponse(
        version=config.ops.app_version,
        build_date=config.ops.build_date,
        database_engine="sqlite" if sqlite_path else "other",
        database_path=str(sqlite_path) if sqlite_path else "",
        database_exists=sqlite_path.exists() if sqlite_path else False,
        backup_enabled=config.ops.backup_enabled,
        backup_dir=config.ops.backup_dir,
        backup_retention_days=config.ops.backup_retention_days,
        llm_provider=llm.provider,
        llm_model=llm.model,
        llm_configured=bool(llm.api_key or llm.openai_api_key or llm.anthropic_api_key or llm.doubao_api_key),
        enrich_daily_limit=config.enrich.daily_limit,
        enrich_recent_total=enrich_summary["total"],
        enrich_by_status=enrich_summary["by_status"],
        enrich_avg_duration_ms=enrich_summary["avg_duration_ms"],
        regular_user_count=regular_user_count,
        disabled_user_count=disabled_user_count,
        registration_enabled=config.registration.enabled,
        registration_max_users=config.registration.max_users,
        active_users_7d=active_users_7d,
        reviews_7d=reviews_7d,
        latest_backup_at=latest_backup_at,
        latest_backup_path=latest_backup_path,
        handwriting_ink_count=handwriting_ink_count,
        handwriting_image_count=handwriting_image_count,
        handwriting_ink_bytes=handwriting_ink_bytes,
        handwriting_image_bytes=handwriting_image_bytes,
        recent_feedback=read_jsonl_tail(config, "feedback.jsonl", 5),
        recent_client_errors=read_jsonl_tail(config, "client-errors.jsonl", 5),
    )


@router.post("/client-errors", status_code=202)
async def create_client_error(body: ClientErrorCreate, request: Request):
    user_id, role = get_current_user(request)
    append_jsonl(
        request.app.state.config,
        "client-errors.jsonl",
        {
            **body.model_dump(),
            "user_id": user_id,
            "role": role,
            "client_host": request.client.host if request.client else "",
        },
    )
    return {"accepted": True}


@router.post("/feedback", status_code=201)
async def create_feedback(body: FeedbackCreate, request: Request):
    user_id, role = get_current_user(request)
    append_jsonl(
        request.app.state.config,
        "feedback.jsonl",
        {
            **body.model_dump(),
            "user_id": user_id,
            "role": role,
            "client_host": request.client.host if request.client else "",
        },
    )
    return {"accepted": True}
