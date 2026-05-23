import asyncio
import logging
import time
from contextlib import asynccontextmanager, suppress
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.auth import require_auth
from backend.config import AppConfig
from backend.database import Base, create_engine_and_session
from backend.security import LoginRateLimiter, validate_production_secrets

logger = logging.getLogger(__name__)


def configure_file_logging(config: AppConfig) -> None:
    log_dir = Path(config.ops.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    for handler in root_logger.handlers:
        if isinstance(handler, logging.FileHandler) and Path(handler.baseFilename).parent == log_dir:
            return

    formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    app_handler = logging.FileHandler(log_dir / "app.log", encoding="utf-8")
    app_handler.setFormatter(formatter)
    root_logger.addHandler(app_handler)

    access_handler = logging.FileHandler(log_dir / "access.log", encoding="utf-8")
    access_handler.setFormatter(formatter)
    logging.getLogger("glm_words.access").addHandler(access_handler)


def create_app(config: AppConfig | None = None) -> FastAPI:
    if config is None:
        config = AppConfig()
    configure_file_logging(config)
    validate_production_secrets(config)

    engine, session_maker = create_engine_and_session(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        from backend.models import Word, Definition, ExampleSentence, Collocation, ReviewRecord, User, InviteCode, EmailVerification  # noqa: F401
        from backend.services import user_service
        from backend.services.backup_service import backup_loop, prune_old_backups, run_sqlite_backup
        from backend.passwords import hash_password
        from backend.models import AiEnrichUsage  # noqa: F401

        db_path = Path.home() / ".glm-words"
        db_path.mkdir(parents=True, exist_ok=True)

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

            # Migration: add user_id column to existing words table
            columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(words)"))]
            )
            if "user_id" not in columns:
                await conn.execute(
                    text("ALTER TABLE words ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
                )
                logger.info("Migrated: added user_id column to words table")

            definition_columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(definitions)"))]
            )
            if "canvas_image" not in definition_columns:
                await conn.execute(text("ALTER TABLE definitions ADD COLUMN canvas_image TEXT"))
                logger.info("Migrated: added canvas_image column to definitions table")
            if "ink_data" not in definition_columns:
                await conn.execute(text("ALTER TABLE definitions ADD COLUMN ink_data TEXT"))
                logger.info("Migrated: added ink_data column to definitions table")

            # Production performance indexes for the hot review and word-list paths.
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_words_user_created ON words(user_id, created_at)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_words_user_status ON words(user_id, status)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_definitions_word_id ON definitions(word_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_records_next_review ON review_records(next_review)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_records_last_review ON review_records(last_review)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ai_enrich_usage_user_date ON ai_enrich_usage(user_id, usage_date)"))

            verification_columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(email_verifications)"))]
            )
            if verification_columns and "purpose" not in verification_columns:
                await conn.execute(text("ALTER TABLE email_verifications ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'register'"))
                logger.info("Migrated: added purpose column to email_verifications table")
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_email_verifications_email ON email_verifications(email)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_email_verifications_email_purpose ON email_verifications(email, purpose)"))

        # Seed admin user and assign orphan words
        async with session_maker() as db:
            admin = await user_service.ensure_admin_user(
                db, config.admin_username, hash_password(config.admin_password)
            )
            orphan_count = await user_service.assign_orphan_words(db, admin.id)
            if orphan_count > 0:
                logger.info("Assigned %d orphan words to admin user", orphan_count)
            await db.commit()

        backup_task = None
        if config.ops.backup_enabled:
            try:
                backup_target = await asyncio.to_thread(run_sqlite_backup, config)
                removed = await asyncio.to_thread(prune_old_backups, config)
                if backup_target:
                    logger.info("Startup database backup created at %s; pruned %d old backups", backup_target, removed)
            except Exception:
                logger.exception("Startup database backup failed")
            backup_task = asyncio.create_task(backup_loop(config, logger))

        try:
            yield
        finally:
            if backup_task:
                backup_task.cancel()
                with suppress(asyncio.CancelledError):
                    await backup_task

    app = FastAPI(title="一触", version="0.1.0", lifespan=lifespan)
    app.state.session_maker = session_maker
    app.state.config = config
    app.state.login_rate_limiter = LoginRateLimiter()

    if config.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(config.allowed_origins),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    access_logger = logging.getLogger("glm_words.access")

    @app.middleware("http")
    async def access_log_middleware(request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            access_logger.exception(
                "%s %s failed %.1fms",
                request.method,
                request.url.path,
                duration_ms,
            )
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        access_logger.info(
            "%s %s %s %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    from backend.routers import auth, words, review, enrich, sync, profile, ops

    app.include_router(auth.router, prefix="/api")
    app.include_router(ops.router, prefix="/api")
    app.include_router(words.router, prefix="/api", dependencies=[Depends(require_auth)])
    app.include_router(review.router, prefix="/api", dependencies=[Depends(require_auth)])
    app.include_router(enrich.router, prefix="/api", dependencies=[Depends(require_auth)])
    app.include_router(sync.router, prefix="/api", dependencies=[Depends(require_auth)])
    app.include_router(profile.router, prefix="/api", dependencies=[Depends(require_auth)])

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
