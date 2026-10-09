import asyncio
import logging
import time
from contextlib import asynccontextmanager, suppress
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from backend.auth import decode_token_if_valid, ensure_account_active, require_auth
from backend.config import AppConfig, ensure_data_dir
from backend.database import Base, create_engine_and_session
from backend.security import IpRateLimiter, LoginRateLimiter, validate_production_secrets

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
    logging.getLogger("onetouch.access").addHandler(access_handler)


def create_app(config: AppConfig | None = None) -> FastAPI:
    if config is None:
        config = AppConfig()
    configure_file_logging(config)
    validate_production_secrets(config)

    # Runs before the engine is built so the default SQLite path points at the
    # directory that actually holds existing data (see ensure_data_dir).
    ensure_data_dir()

    engine, session_maker = create_engine_and_session(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        from backend.models import Word, Definition, ExampleSentence, Collocation, ReviewRecord, ReviewLog, User, InviteCode, EmailVerification  # noqa: F401
        from backend.models import AiEnrichUsage  # noqa: F401
        from backend.models.kaoyan import ExamSentence, KaoyanWord  # noqa: F401
        from backend.services import kaoyan_service, user_service
        from backend.services.backup_service import backup_loop, prune_old_backups, run_sqlite_backup
        from backend.passwords import hash_password
        from sqlalchemy import select as sa_select

        # The state directory is prepared in create_app(); nothing to do here
        # beyond making sure it exists for non-default database locations.
        Path(config.ops.backup_dir).mkdir(parents=True, exist_ok=True)

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

            def word_indexes(sync_conn):
                indexes = []
                for row in sync_conn.execute(text("PRAGMA index_list(words)")):
                    index_name = row[1]
                    escaped_name = index_name.replace('"', '""')
                    columns = [
                        info[2]
                        for info in sync_conn.execute(text(f'PRAGMA index_info("{escaped_name}")'))
                    ]
                    indexes.append((index_name, bool(row[2]), columns))
                return indexes

            for index_name, is_unique, index_columns in await conn.run_sync(word_indexes):
                if is_unique and index_columns == ["text"] and not index_name.startswith("sqlite_autoindex"):
                    escaped_name = index_name.replace('"', '""')
                    await conn.execute(text(f'DROP INDEX "{escaped_name}"'))
                    logger.info("Migrated: dropped global unique index %s on words.text", index_name)
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_words_text ON words(text)"))
            await conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS ix_words_user_text_unique ON words(user_id, text)")
            )

            definition_columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(definitions)"))]
            )
            if "canvas_image" not in definition_columns:
                await conn.execute(text("ALTER TABLE definitions ADD COLUMN canvas_image TEXT"))
                logger.info("Migrated: added canvas_image column to definitions table")
            if "ink_data" not in definition_columns:
                await conn.execute(text("ALTER TABLE definitions ADD COLUMN ink_data TEXT"))
                logger.info("Migrated: added ink_data column to definitions table")
            if "is_primary" not in definition_columns:
                await conn.execute(text("ALTER TABLE definitions ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT 0"))
                await conn.execute(
                    text(
                        """
                        UPDATE definitions
                        SET is_primary = 1
                        WHERE id IN (
                            SELECT MIN(id)
                            FROM definitions
                            GROUP BY word_id
                        )
                        """
                    )
                )
                logger.info("Migrated: added is_primary column to definitions table")

            user_columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(users)"))]
            )
            if user_columns and "is_disabled" not in user_columns:
                await conn.execute(text("ALTER TABLE users ADD COLUMN is_disabled BOOLEAN NOT NULL DEFAULT 0"))
                logger.info("Migrated: added is_disabled column to users table")
            if user_columns and "credentials_updated_at" not in user_columns:
                await conn.execute(text("ALTER TABLE users ADD COLUMN credentials_updated_at DATETIME"))
                logger.info("Migrated: added credentials_updated_at column to users table")

            review_columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(review_records)"))]
            )
            review_record_migrations = {
                "algorithm": "ALTER TABLE review_records ADD COLUMN algorithm VARCHAR(32) NOT NULL DEFAULT 'sm2'",
                "phase": "ALTER TABLE review_records ADD COLUMN phase VARCHAR(32) NOT NULL DEFAULT 'review'",
                "difficulty": "ALTER TABLE review_records ADD COLUMN difficulty FLOAT",
                "stability": "ALTER TABLE review_records ADD COLUMN stability FLOAT",
                "retrievability": "ALTER TABLE review_records ADD COLUMN retrievability FLOAT",
                "scheduled_days": "ALTER TABLE review_records ADD COLUMN scheduled_days INTEGER",
                "learning_step": "ALTER TABLE review_records ADD COLUMN learning_step INTEGER NOT NULL DEFAULT 0",
                "learning_due_at": "ALTER TABLE review_records ADD COLUMN learning_due_at DATETIME",
            }
            for column_name, statement in review_record_migrations.items():
                if "id" in review_columns and column_name not in review_columns:
                    await conn.execute(text(statement))
                    logger.info("Migrated: added %s column to review_records table", column_name)

            # Production performance indexes for the hot review and word-list paths.
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_words_user_created ON words(user_id, created_at)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_words_user_status ON words(user_id, status)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_definitions_word_id ON definitions(word_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_records_next_review ON review_records(next_review)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_records_learning_due_at ON review_records(learning_due_at)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_records_last_review ON review_records(last_review)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_logs_word_id ON review_logs(word_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_logs_reviewed_at ON review_logs(reviewed_at)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ai_enrich_usage_user_date ON ai_enrich_usage(user_id, usage_date)"))

            verification_columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(email_verifications)"))]
            )
            if verification_columns and "purpose" not in verification_columns:
                await conn.execute(text("ALTER TABLE email_verifications ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'register'"))
                logger.info("Migrated: added purpose column to email_verifications table")
            exam_sentence_columns = await conn.run_sync(
                lambda sync_conn: [row[1] for row in sync_conn.execute(text("PRAGMA table_info(exam_sentences)"))]
            )
            if exam_sentence_columns and "exam_type" not in exam_sentence_columns:
                await conn.execute(text("ALTER TABLE exam_sentences ADD COLUMN exam_type VARCHAR(8) NOT NULL DEFAULT '英语一'"))
                logger.info("Migrated: added exam_type column to exam_sentences table")
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

            kaoyan_dir = Path(__file__).resolve().parent.parent / "data" / "kaoyan"
            word_count, sentence_count = await kaoyan_service.seed_if_empty(db, kaoyan_dir)
            await db.commit()
            if word_count:
                logger.info("Kaoyan lexicon ready: %d words, %d exam sentences", word_count, sentence_count)

            sentences = list((await db.execute(sa_select(ExamSentence))).scalars().all())
            kaoyan_index = kaoyan_service.build_inverted_index(sentences)
            app.state.kaoyan_index = kaoyan_index
            logger.info("Kaoyan inverted index: %d words mapped to sentences", len(kaoyan_index))

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
    app.state.send_code_limiter = IpRateLimiter(max_attempts=5, window_seconds=3600)
    app.state.code_verify_limiter = IpRateLimiter(max_attempts=10, window_seconds=600)

    @app.middleware("http")
    async def account_state_middleware(request: Request, call_next):
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            payload = decode_token_if_valid(token, config)
            if payload is not None and "sub" in payload:
                async with session_maker() as db:
                    try:
                        await ensure_account_active(db, payload)
                    except HTTPException as exc:
                        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)

    if config.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(config.allowed_origins),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    access_logger = logging.getLogger("onetouch.access")

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

    from backend.routers import auth, words, review, enrich, sync, profile, ops, kaoyan

    app.include_router(auth.router, prefix="/api")
    app.include_router(ops.router, prefix="/api")
    app.include_router(kaoyan.router, prefix="/api", dependencies=[Depends(require_auth)])
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
