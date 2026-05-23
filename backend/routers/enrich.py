import logging
import time

from fastapi import APIRouter, HTTPException, Request, status

from backend.auth import get_current_user
from backend.config import AppConfig
from backend.llm.base import LLMConfig
from backend.services import enrich_quota_service, enrich_service
from backend.services.ops_service import append_jsonl

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enrich", tags=["enrich"])


@router.post("/{word_id}")
async def enrich_word(word_id: int, request: Request):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    config: AppConfig = request.app.state.config
    llm = config.llm
    api_key = llm.api_key
    if llm.provider == "openai":
        api_key = llm.openai_api_key or api_key
    elif llm.provider == "anthropic":
        api_key = llm.anthropic_api_key or api_key
    elif llm.provider == "doubao":
        api_key = llm.doubao_api_key or api_key

    llm_config = LLMConfig(
        provider=llm.provider,
        model=llm.model,
        api_key=api_key,
        base_url=llm.base_url,
        max_tokens=llm.max_tokens,
        temperature=llm.temperature,
    )

    async with session_maker() as db:
        quota = None
        start = time.perf_counter()
        try:
            quota = await enrich_quota_service.reserve_enrich(
                db,
                user_id=user_id,
                role=role,
                daily_limit=config.enrich.daily_limit,
            )
            await db.commit()
            word = await enrich_service.enrich_word(db, word_id, llm_config, user_id=user_id, role=role)
            await db.commit()
            logger.info(
                "enrich_request succeeded user_id=%s role=%s word_id=%s provider=%s duration_ms=%.1f",
                user_id,
                role,
                word.id,
                llm.provider,
                (time.perf_counter() - start) * 1000,
            )
            append_jsonl(
                config,
                "ai-enrich.jsonl",
                {
                    "status": "success",
                    "user_id": user_id,
                    "role": role,
                    "word_id": word.id,
                    "provider": llm.provider,
                    "model": llm.model,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                },
            )
            return {
                "status": "enriched",
                "word_id": word.id,
                "text": word.text,
                "quota": quota.__dict__,
            }
        except enrich_quota_service.EnrichQuotaExceeded as e:
            await db.rollback()
            logger.info(
                "enrich_request quota_exceeded user_id=%s role=%s word_id=%s provider=%s",
                user_id,
                role,
                word_id,
                llm.provider,
            )
            append_jsonl(
                config,
                "ai-enrich.jsonl",
                {
                    "status": "quota_exceeded",
                    "user_id": user_id,
                    "role": role,
                    "word_id": word_id,
                    "provider": llm.provider,
                    "model": llm.model,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "Daily AI enrich limit reached",
                    "quota": e.quota.__dict__,
                },
            )
        except ValueError as e:
            await enrich_quota_service.release_enrich(db, user_id=user_id, role=role)
            await db.commit()
            logger.info(
                "enrich_request not_found user_id=%s role=%s word_id=%s provider=%s",
                user_id,
                role,
                word_id,
                llm.provider,
            )
            append_jsonl(
                config,
                "ai-enrich.jsonl",
                {
                    "status": "not_found",
                    "user_id": user_id,
                    "role": role,
                    "word_id": word_id,
                    "provider": llm.provider,
                    "model": llm.model,
                },
            )
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            await db.rollback()
            async with session_maker() as release_db:
                await enrich_quota_service.release_enrich(release_db, user_id=user_id, role=role)
                await release_db.commit()
            logger.exception(
                "enrich_request failed user_id=%s role=%s word_id=%s provider=%s duration_ms=%.1f",
                user_id,
                role,
                word_id,
                llm.provider,
                (time.perf_counter() - start) * 1000,
            )
            append_jsonl(
                config,
                "ai-enrich.jsonl",
                {
                    "status": "failed",
                    "user_id": user_id,
                    "role": role,
                    "word_id": word_id,
                    "provider": llm.provider,
                    "model": llm.model,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                    "error_type": type(e).__name__,
                },
            )
            raise HTTPException(status_code=500, detail="Enrichment failed")


@router.get("/quota")
async def get_enrich_quota(request: Request):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    config: AppConfig = request.app.state.config

    async with session_maker() as db:
        quota = await enrich_quota_service.get_quota(
            db,
            user_id=user_id,
            role=role,
            daily_limit=config.enrich.daily_limit,
        )
        return quota.__dict__
