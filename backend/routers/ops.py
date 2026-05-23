from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from backend.auth import get_current_user
from backend.config import AppConfig
from backend.services.backup_service import sqlite_path_from_url
from backend.services.ops_service import append_jsonl, summarize_enrich_events

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
    sqlite_path = sqlite_path_from_url(config.database.url)
    llm = config.llm
    enrich_summary = summarize_enrich_events(config)
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
