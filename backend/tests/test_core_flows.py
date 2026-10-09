from __future__ import annotations

from types import SimpleNamespace
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.auth import create_auth_token, ensure_account_active
from backend.passwords import PasswordTooLongError, verify_password
from backend.config import AppConfig, DatabaseConfig, EnrichConfig, LLMProviderConfig, OpsConfig, ReviewConfig
from backend.database import Base
from backend.llm import LLMConfig, LLMFactory
from backend.llm.base import EnrichResult
from backend.llm.doubao_provider import DoubaoProvider, _strip_json_markdown
from backend.models import ReviewLog, ReviewRecord, User
from backend.routers import auth as auth_router
from backend.routers import ops as ops_router
from backend.schemas.word import WordCreate
from backend.security import IpRateLimiter, LoginRateLimiter
from backend.services import enrich_quota_service, enrich_service, review_service, sync_service, user_service, word_service
from backend.passwords import hash_password


@pytest_asyncio.fixture
async def test_env():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    config = AppConfig(
        database=DatabaseConfig(url="sqlite+aiosqlite:///:memory:"),
        llm=LLMProviderConfig(provider="ollama", model="llama3"),
        review=ReviewConfig(),
        enrich=EnrichConfig(daily_limit=5),
        ops=OpsConfig(backup_enabled=False),
        admin_username="local-admin",
        admin_password="local-review-pass",
        auth_secret="test-secret",
        auth_token_ttl_hours=24,
    )

    async with session_maker() as db:
        user = User(
            email="local-admin",
            password_hash=hash_password("local-review-pass"),
            role="admin",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    app = SimpleNamespace(state=SimpleNamespace(
        session_maker=session_maker,
        config=config,
        login_rate_limiter=LoginRateLimiter(),
        send_code_limiter=IpRateLimiter(max_attempts=5, window_seconds=3600),
        code_verify_limiter=IpRateLimiter(max_attempts=10, window_seconds=600),
    ))
    token = create_auth_token(1, "admin", config)

    try:
        yield {
            "engine": engine,
            "session_maker": session_maker,
            "config": config,
            "app": app,
            "token": token,
        }
    finally:
        await engine.dispose()


def make_request(app, token: str):
    return SimpleNamespace(app=app, headers={"Authorization": f"Bearer {token}"})


@pytest.mark.asyncio
async def test_word_capture_and_review_ready(test_env):
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "alpha", user_id=1)
        await word_service.add_definition(
            db,
            word.id,
            "n.",
            "alpha note",
            "首字母",
        )
        await db.commit()

    async with test_env["session_maker"]() as db:
        words, total = await word_service.list_words(db, user_id=1, role="admin")
        assert total == 1
        assert words[0].review_ready is True
        assert words[0].definition_count == 1

        detail = await word_service.get_word(db, word.id, user_id=1, role="admin")
        assert detail is not None
        assert len(detail.definitions) == 1


@pytest.mark.asyncio
async def test_word_text_uniqueness_is_scoped_per_user(test_env):
    async with test_env["session_maker"]() as db:
        other = User(email="other", password_hash=hash_password("password123"), role="user")
        db.add(other)
        await db.commit()
        await db.refresh(other)

        own_word = await word_service.create_word(db, "shared", user_id=1)
        other_word = await word_service.create_word(db, "shared", user_id=other.id)
        await db.commit()

        assert own_word.id != other_word.id
        assert own_word.text == other_word.text == "shared"

        with pytest.raises(word_service.WordAlreadyExistsError):
            await word_service.create_word(db, "shared", user_id=1)


@pytest.mark.asyncio
async def test_word_write_paths_reject_other_user(test_env):
    async with test_env["session_maker"]() as db:
        owner = User(email="owner", password_hash=hash_password("password123"), role="user")
        attacker = User(email="attacker", password_hash=hash_password("password123"), role="user")
        db.add_all([owner, attacker])
        await db.commit()
        await db.refresh(owner)
        await db.refresh(attacker)

        word = await word_service.create_word(db, "delta", user_id=owner.id)
        defn = await word_service.add_definition(db, word.id, "n.", "delta note", "三角洲")
        await db.commit()

    async with test_env["session_maker"]() as db:
        with pytest.raises(ValueError):
            await word_service.update_word(db, word.id, "ˈdel.tə", user_id=attacker.id, role="user")
        assert await word_service.delete_definition(db, word.id, defn.id, user_id=attacker.id, role="user") is False
        assert await word_service.delete_word(db, word.id, user_id=attacker.id, role="user") is False
        await db.commit()

    async with test_env["session_maker"]() as db:
        untouched = await word_service.get_word(db, word.id, user_id=owner.id, role="user")
        assert untouched is not None
        assert untouched.phonetic is None
        assert len(untouched.definitions) == 1

    async with test_env["session_maker"]() as db:
        updated = await word_service.update_word(db, word.id, "ˈdel.tə", user_id=owner.id, role="user")
        assert updated.phonetic == "ˈdel.tə"
        assert await word_service.delete_definition(db, word.id, defn.id, user_id=owner.id, role="user") is True
        assert await word_service.delete_word(db, word.id, user_id=owner.id, role="user") is True
        await db.commit()

    async with test_env["session_maker"]() as db:
        assert await word_service.get_word(db, word.id, user_id=owner.id, role="user") is None

    async with test_env["session_maker"]() as db:
        admin_word = await word_service.create_word(db, "epsilon", user_id=owner.id)
        await db.commit()
        assert await word_service.delete_word(db, admin_word.id, user_id=1, role="admin") is True
        await db.commit()


@pytest.mark.asyncio
async def test_review_session_and_submit(test_env):
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "beta", user_id=1)
        await word_service.add_definition(db, word.id, "n.", "beta note", "测试词")
        await db.commit()

    session_maker = test_env["app"].state.session_maker
    async with session_maker() as db:
        words = await review_service.get_due_words(db, user_id=1, role="admin")
        stats = await review_service.get_review_stats(db, user_id=1, role="admin")
        assert len(words) == 1
        assert stats["due_count"] == 1
        assert words[0].id == word.id

    async with session_maker() as db:
        record = await review_service.submit_review(db, word.id, 4, user_id=1, role="admin")
        await db.commit()
        assert record.word_id == word.id
        assert record.phase == "learning"
        assert record.learning_due_at is not None

    async with session_maker() as db:
        stats = await review_service.get_review_stats(db, user_id=1, role="admin")
        assert stats["due_count"] == 0


@pytest.mark.asyncio
async def test_review_learning_and_relearning_steps(test_env):
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "steps", user_id=1)
        await word_service.add_definition(db, word.id, "n.", "steps note", "步骤")
        await db.commit()

    reviewed_at = datetime(2026, 5, 26, 8, 0, tzinfo=UTC)
    async with test_env["session_maker"]() as db:
        record = await review_service.submit_review(
            db,
            word.id,
            1,
            user_id=1,
            role="admin",
            reviewed_at=reviewed_at,
        )
        await db.commit()
        assert record.phase == "learning"
        assert record.learning_due_at == (reviewed_at + timedelta(minutes=1)).replace(tzinfo=None)

    async with test_env["session_maker"]() as db:
        record = await db.scalar(select(ReviewRecord).where(ReviewRecord.word_id == word.id))
        assert record is not None
        record.learning_step = 3
        record.learning_due_at = reviewed_at
        await db.commit()

    async with test_env["session_maker"]() as db:
        record = await review_service.submit_review(
            db,
            word.id,
            4,
            user_id=1,
            role="admin",
            reviewed_at=reviewed_at + timedelta(minutes=20),
        )
        await db.commit()
        assert record.phase == "review"
        assert record.learning_due_at is None
        assert record.next_review.hour == 20
        assert record.repetitions >= 1


@pytest.mark.asyncio
async def test_fsrs_review_state_is_persisted(test_env):
    fsrs_config = ReviewConfig(algorithm="fsrs")
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "fsrs-state", user_id=1)
        await word_service.add_definition(db, word.id, "n.", "fsrs note", "记忆状态")
        await db.commit()

    reviewed_at = datetime(2026, 5, 26, 8, 0, tzinfo=UTC)
    async with test_env["session_maker"]() as db:
        record = await review_service.submit_review(
            db,
            word.id,
            4,
            user_id=1,
            role="admin",
            reviewed_at=reviewed_at,
            config=fsrs_config,
        )
        record.learning_step = 3
        record.learning_due_at = reviewed_at
        await db.commit()

    async with test_env["session_maker"]() as db:
        record = await review_service.submit_review(
            db,
            word.id,
            4,
            user_id=1,
            role="admin",
            reviewed_at=reviewed_at + timedelta(minutes=20),
            config=fsrs_config,
        )
        await db.commit()
        assert record.algorithm == "fsrs"
        assert record.phase == "review"
        assert record.difficulty is not None
        assert record.stability is not None
        assert record.scheduled_days is not None

    async with test_env["session_maker"]() as db:
        stats = await review_service.get_review_stats(db, user_id=1, role="admin", config=fsrs_config)
        assert "estimated_due_tomorrow" in stats


@pytest.mark.asyncio
async def test_due_words_prioritize_review_over_new(test_env):
    now = datetime(2026, 5, 26, 8, 0, tzinfo=UTC)
    async with test_env["session_maker"]() as db:
        overdue = await word_service.create_word(db, "overdue", user_id=1)
        await word_service.add_definition(db, overdue.id, "n.", "overdue note", "过期")
        fresh = await word_service.create_word(db, "fresh", user_id=1)
        await word_service.add_definition(db, fresh.id, "n.", "fresh note", "新词")
        db.add(
            ReviewRecord(
                word_id=overdue.id,
                phase="review",
                next_review=now - timedelta(days=3),
                last_review=now - timedelta(days=10),
            )
        )
        await db.commit()

    async with test_env["session_maker"]() as db:
        words = await review_service.get_due_words(db, user_id=1, role="admin")
        assert [word.text for word in words][:2] == ["overdue", "fresh"]


@pytest.mark.asyncio
async def test_review_day_cutoff_uses_4am_local_boundary(test_env):
    reviewed_at = datetime(2026, 5, 25, 15, 0, tzinfo=UTC)
    cutoff_probe = datetime(2026, 5, 26, 4, 0, tzinfo=UTC)
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "boundary", user_id=1)
        await word_service.add_definition(db, word.id, "n.", "boundary note", "边界")
        db.add(
            ReviewRecord(
                word_id=word.id,
                phase="review",
                interval_days=1,
                next_review=review_service._next_review_at(
                    reviewed_at,
                    1,
                    test_env["config"].review,
                ),
            )
        )
        await db.commit()

    assert review_service.review_day_cutoff(cutoff_probe, test_env["config"].review) >= datetime(
        2026, 5, 26, 20, 0, tzinfo=UTC
    )
    async with test_env["session_maker"]() as db:
        words = await review_service.get_due_words(
            db,
            user_id=1,
            role="admin",
            config=test_env["config"].review,
        )
        assert [word.text for word in words] == ["boundary"]


@pytest.mark.asyncio
async def test_sync_round_trips_new_review_fields(test_env):
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "fsrs", user_id=1)
        await word_service.add_definition(db, word.id, "n.", "fsrs note", "调度")
        db.add(
            ReviewRecord(
                word_id=word.id,
                algorithm="fsrs",
                phase="review",
                difficulty=4.5,
                stability=2.0,
                retrievability=0.91,
                scheduled_days=3,
                learning_step=0,
                next_review=datetime(2026, 5, 29, 20, 0, tzinfo=UTC),
            )
        )
        await db.commit()

    async with test_env["session_maker"]() as db:
        data = await sync_service.export_all(db, user_id=1, role="admin")
        rr = data["words"][0]["review_record"]
        assert rr["algorithm"] == "fsrs"
        assert rr["difficulty"] == 4.5

    async with test_env["session_maker"]() as db:
        logs = list((await db.execute(select(ReviewLog))).scalars().all())
        assert logs == []


@pytest.mark.asyncio
async def test_review_submit_rejects_other_user_word(test_env):
    async with test_env["session_maker"]() as db:
        owner = User(email="other", password_hash=hash_password("password123"), role="user")
        db.add(owner)
        await db.commit()
        await db.refresh(owner)
        word = await word_service.create_word(db, "gamma", user_id=owner.id)
        await word_service.add_definition(db, word.id, "n.", "gamma note", "测试")
        await db.commit()

    async with test_env["session_maker"]() as db:
        with pytest.raises(ValueError):
            await review_service.submit_review(db, word.id, 4, user_id=1, role="user")


@pytest.mark.asyncio
async def test_sync_replace_is_scoped_to_current_user(test_env):
    async with test_env["session_maker"]() as db:
        other = User(email="other", password_hash=hash_password("password123"), role="user")
        db.add(other)
        await db.commit()
        await db.refresh(other)

        own_word = await word_service.create_word(db, "owned", user_id=1)
        await word_service.add_definition(db, own_word.id, "n.", "owned note", "自己的词")
        other_word = await word_service.create_word(db, "external", user_id=other.id)
        await word_service.add_definition(db, other_word.id, "n.", "external note", "别人的词")
        await db.commit()

    payload = {
        "version": "1.0",
        "words": [
            {
                "text": "replacement",
                "definitions": [{"pos": "n.", "meaning_en": "replacement note", "meaning_zh": "替换词"}],
            }
        ],
    }

    async with test_env["session_maker"]() as db:
        result = await sync_service.import_data(db, payload, mode="replace", user_id=1, role="user")
        await db.commit()
        assert result["imported"] == 1
        assert result["skipped"] == 0
        assert result["delete_count"] == 1

    async with test_env["session_maker"]() as db:
        user_words, _ = await word_service.list_words(db, user_id=1, role="user")
        other_words, _ = await word_service.list_words(db, user_id=other.id, role="user")
        assert [word.text for word in user_words] == ["replacement"]
        assert [word.text for word in other_words] == ["external"]


@pytest.mark.asyncio
async def test_sync_merge_imports_word_owned_by_another_user(test_env):
    async with test_env["session_maker"]() as db:
        other = User(email="other", password_hash=hash_password("password123"), role="user")
        db.add(other)
        await db.commit()
        await db.refresh(other)
        await word_service.create_word(db, "shared", user_id=other.id)
        await db.commit()

    payload = {
        "version": "1.0",
        "words": [
            {
                "text": "shared",
                "definitions": [{"pos": "n.", "meaning_en": "shared note", "meaning_zh": "重复词"}],
            }
        ],
    }

    async with test_env["session_maker"]() as db:
        result = await sync_service.import_data(db, payload, mode="merge", user_id=1, role="user")
        await db.commit()
        assert result["imported"] == 1
        assert result["skipped"] == 0

    async with test_env["session_maker"]() as db:
        user_words, _ = await word_service.list_words(db, user_id=1, role="user")
        other_words, _ = await word_service.list_words(db, user_id=other.id, role="user")
        assert [word.text for word in user_words] == ["shared"]
        assert [word.text for word in other_words] == ["shared"]


@pytest.mark.asyncio
async def test_enrich_quota_limits_regular_users(test_env):
    async with test_env["session_maker"]() as db:
        for _ in range(5):
            quota = await enrich_quota_service.reserve_enrich(db, user_id=1, role="user", daily_limit=5)
        await db.commit()

        assert quota.limit == 5
        assert quota.used == 5
        assert quota.remaining == 0

        with pytest.raises(enrich_quota_service.EnrichQuotaExceeded) as exc:
            await enrich_quota_service.reserve_enrich(db, user_id=1, role="user", daily_limit=5)
        assert exc.value.quota.remaining == 0


@pytest.mark.asyncio
async def test_enrich_quota_admin_is_unlimited(test_env):
    async with test_env["session_maker"]() as db:
        for _ in range(8):
            quota = await enrich_quota_service.reserve_enrich(db, user_id=1, role="admin", daily_limit=5)
        await db.commit()

        assert quota.limit is None
        assert quota.remaining is None


@pytest.mark.asyncio
async def test_enrich_quota_release_restores_failed_attempt(test_env):
    async with test_env["session_maker"]() as db:
        quota = await enrich_quota_service.reserve_enrich(db, user_id=1, role="user", daily_limit=5)
        assert quota.used == 1
        await enrich_quota_service.release_enrich(db, user_id=1, role="user")
        quota = await enrich_quota_service.get_quota(db, user_id=1, role="user", daily_limit=5)
        await db.commit()

        assert quota.used == 0
        assert quota.remaining == 5


def test_doubao_provider_uses_responses_provider():
    provider = LLMFactory(
        LLMConfig(
            provider="doubao",
            model="doubao-seed-2-0-pro-260215",
            api_key="test-key",
        )
    )
    assert isinstance(provider, DoubaoProvider)
    assert provider.config.base_url is None


def test_strip_json_markdown_for_llm_responses():
    assert _strip_json_markdown("```json\n{\"phonetic\":\"/x/\",\"definitions\":[]}\n```") == "{\"phonetic\":\"/x/\",\"definitions\":[]}"


@pytest.mark.asyncio
async def test_enrich_preserves_handwriting_and_adds_examples(test_env, monkeypatch):
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "delta", user_id=1)
        handwritten = await word_service.add_definition(
            db,
            word.id,
            "n.",
            "",
            "Handwritten definition",
            canvas_image="data:image/png;base64,abc",
            ink_data='{"strokes":[]}',
        )
        await db.commit()

    class FakeProvider:
        def __init__(self, config):
            self.config = config

        async def enrich_word(self, word_text: str):
            assert word_text == "delta"
            return EnrichResult(
                phonetic="/ˈdel.tə/",
                definitions=[
                    {
                        "pos": "n.",
                        "meaning_en": "",
                        "meaning_zh": "三角洲；希腊字母表第四个字母",
                        "example": {
                            "sentence_en": "The river forms a wide delta.",
                            "sentence_zh": "这条河形成了宽阔的三角洲。",
                        },
                    }
                ],
                examples=[],
                collocations=[],
            )

    monkeypatch.setattr(enrich_service, "LLMFactory", lambda config: FakeProvider(config))

    async with test_env["session_maker"]() as db:
        enriched = await enrich_service.enrich_word(db, word.id, LLMConfig(provider="openai", model="test"), user_id=1, role="user")
        await db.commit()
        assert enriched.phonetic == "/ˈdel.tə/"

    async with test_env["session_maker"]() as db:
        detail = await word_service.get_word(db, word.id, user_id=1, role="user")
        assert detail is not None
        assert len(detail.definitions) == 2
        kept = next(defn for defn in detail.definitions if defn.id == handwritten.id)
        ai_def = next(defn for defn in detail.definitions if defn.id != handwritten.id)
        assert kept.canvas_image == "data:image/png;base64,abc"
        assert kept.is_primary is True
        assert ai_def.is_primary is False
        assert ai_def.meaning_zh.startswith("三角洲")
        assert ai_def.examples[0].sentence_en == "The river forms a wide delta."


@pytest.mark.asyncio
async def test_primary_definition_can_be_changed_and_is_unique(test_env):
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "primary", user_id=1)
        first = await word_service.add_definition(db, word.id, "n.", "first", "第一")
        second = await word_service.add_definition(db, word.id, "v.", "second", "第二")
        await db.commit()

    async with test_env["session_maker"]() as db:
        assert first.is_primary is True
        assert second.is_primary is False
        updated = await word_service.update_definition(db, word.id, second.id, {"is_primary": True})
        await db.commit()
        assert updated is not None

    async with test_env["session_maker"]() as db:
        detail = await word_service.get_word(db, word.id, user_id=1, role="user")
        assert detail is not None
        primary_ids = [defn.id for defn in detail.definitions if defn.is_primary]
        assert primary_ids == [second.id]


@pytest.mark.asyncio
async def test_sync_export_metadata_and_dry_run(test_env):
    async with test_env["session_maker"]() as db:
        word = await word_service.create_word(db, "exported", user_id=1)
        await word_service.add_definition(db, word.id, "n.", "exported note", "导出", ink_data='{"strokes":[]}')
        await db.commit()

    async with test_env["session_maker"]() as db:
        exported = await sync_service.export_all(
            db,
            user_id=1,
            role="user",
            app_version="test-version",
            review_algorithm="fsrs",
        )
        assert exported["export_version"] == "2.0"
        assert exported["app_version"] == "test-version"
        assert exported["review_algorithm"] == "fsrs"
        assert exported["words"][0]["definitions"][0]["is_primary"] is True
        assert exported["words"][0]["definitions"][0]["ink_data"] == '{"strokes":[]}'

    payload = {
        "version": "1.0",
        "words": [
            {"text": "exported", "definitions": [{"pos": "n.", "meaning_zh": "重复"}]},
            {"text": "new-dry-run", "definitions": [{"pos": "n.", "meaning_zh": "新的"}]},
        ],
    }
    async with test_env["session_maker"]() as db:
        preview = await sync_service.import_data(db, payload, mode="merge", user_id=1, role="user", dry_run=True)
        await db.commit()
        assert preview["dry_run"] is True
        assert preview["imported"] == 1
        assert preview["skipped"] == 1

    async with test_env["session_maker"]() as db:
        words, total = await word_service.list_words(db, user_id=1, role="user")
        assert total == 1
        assert [word.text for word in words] == ["exported"]


@pytest.mark.asyncio
async def test_ops_status_admin_only(test_env):
    admin_request = make_request(test_env["app"], test_env["token"])
    status = await ops_router.get_status(admin_request)
    assert status.enrich_daily_limit == 5
    assert status.backup_enabled is False
    assert status.llm_provider == "ollama"

    async with test_env["session_maker"]() as db:
        user = User(email="reader", password_hash=hash_password("password123"), role="user")
        db.add(user)
        await db.commit()
        await db.refresh(user)
    user_token = create_auth_token(2, "user", test_env["config"])
    user_request = make_request(test_env["app"], user_token)
    with pytest.raises(Exception):
        await ops_router.get_status(user_request)


@pytest.mark.asyncio
async def test_email_verification_registers_user(test_env):
    config = AppConfig(
        database=test_env["config"].database,
        llm=test_env["config"].llm,
        review=test_env["config"].review,
        enrich=test_env["config"].enrich,
        ops=test_env["config"].ops,
        admin_username="local-admin",
        admin_password="local-review-pass",
        auth_secret="test-secret",
        registration_enabled=True,
    )
    object.__setattr__(config.registration, "enabled", True)
    object.__setattr__(config.registration, "max_users", 3)
    test_env["app"].state.config = config

    async with test_env["session_maker"]() as db:
        await user_service.create_email_verification(db, "new@example.com", "123456", config.auth_secret, 10)
        await db.commit()

    request = SimpleNamespace(app=test_env["app"], client=None)
    response = await auth_router.register(
        auth_router.RegisterRequest(email="new@example.com", password="longpassword", verification_code="123456"),
        request,
    )
    assert response["accepted"] is True

    async with test_env["session_maker"]() as db:
        created = await user_service.get_user_by_email(db, "new@example.com")
        assert created is not None
        assert created.role == "user"


@pytest.mark.asyncio
async def test_email_registration_rejects_bad_code(test_env):
    config = AppConfig(
        database=test_env["config"].database,
        llm=test_env["config"].llm,
        review=test_env["config"].review,
        enrich=test_env["config"].enrich,
        ops=test_env["config"].ops,
        admin_username="local-admin",
        admin_password="local-review-pass",
        auth_secret="test-secret",
        registration_enabled=True,
    )
    object.__setattr__(config.registration, "enabled", True)
    test_env["app"].state.config = config

    async with test_env["session_maker"]() as db:
        await user_service.create_email_verification(db, "bad@example.com", "123456", config.auth_secret, 10)
        await db.commit()

    request = SimpleNamespace(app=test_env["app"], client=None)
    with pytest.raises(Exception):
        await auth_router.register(
            auth_router.RegisterRequest(email="bad@example.com", password="longpassword", verification_code="000000"),
            request,
        )


@pytest.mark.asyncio
async def test_email_registration_respects_user_limit(test_env):
    config = AppConfig(
        database=test_env["config"].database,
        llm=test_env["config"].llm,
        review=test_env["config"].review,
        enrich=test_env["config"].enrich,
        ops=test_env["config"].ops,
        admin_username="local-admin",
        admin_password="local-review-pass",
        auth_secret="test-secret",
        registration_enabled=True,
    )
    object.__setattr__(config.registration, "enabled", True)
    object.__setattr__(config.registration, "max_users", 1)
    test_env["app"].state.config = config

    async with test_env["session_maker"]() as db:
        db.add(User(email="existing@example.com", password_hash=hash_password("password123"), role="user"))
        await user_service.create_email_verification(db, "full@example.com", "123456", config.auth_secret, 10)
        await db.commit()

    request = SimpleNamespace(app=test_env["app"], client=None)
    with pytest.raises(Exception):
        await auth_router.register(
            auth_router.RegisterRequest(email="full@example.com", password="longpassword", verification_code="123456"),
            request,
        )


@pytest.mark.asyncio
async def test_password_reset_preserves_user_words(test_env):
    config = AppConfig(
        database=test_env["config"].database,
        llm=test_env["config"].llm,
        review=test_env["config"].review,
        enrich=test_env["config"].enrich,
        ops=test_env["config"].ops,
        admin_username="local-admin",
        admin_password="local-review-pass",
        auth_secret="test-secret",
    )
    test_env["app"].state.config = config

    async with test_env["session_maker"]() as db:
        user = User(email="reset@example.com", password_hash=hash_password("oldpassword"), role="user")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        word = await word_service.create_word(db, "kept", user_id=user.id)
        await word_service.add_definition(db, word.id, "adj.", "kept note", "保留的")
        await user_service.create_email_verification(db, "reset@example.com", "123456", config.auth_secret, 10, "reset_password")
        await db.commit()

    request = SimpleNamespace(app=test_env["app"], client=None)
    response = await auth_router.reset_password(
        auth_router.ResetPasswordRequest(email="reset@example.com", password="newpassword1", verification_code="123456"),
        request,
    )
    assert response["accepted"] is True

    async with test_env["session_maker"]() as db:
        user = await user_service.get_user_by_email(db, "reset@example.com")
        assert user is not None
        assert verify_password("newpassword1", user.password_hash)
        words, total = await word_service.list_words(db, user_id=user.id, role="user")
        assert total == 1
        assert words[0].text == "kept"
        assert words[0].review_ready is True


@pytest.mark.asyncio
async def test_disabled_user_cannot_login(test_env):
    async with test_env["session_maker"]() as db:
        user = User(email="disabled@example.com", password_hash=hash_password("password123"), role="user", is_disabled=True)
        db.add(user)
        await db.commit()

    request = SimpleNamespace(app=test_env["app"], headers={}, client=None)
    with pytest.raises(Exception) as exc:
        await auth_router.login(
            auth_router.LoginRequest(username="disabled@example.com", password="password123"),
            request,
        )
    assert getattr(exc.value, "status_code", None) == 403


@pytest.mark.asyncio
async def test_admin_can_login_with_plain_username(test_env):
    request = SimpleNamespace(app=test_env["app"], headers={}, client=None)
    response = await auth_router.login(
        auth_router.LoginRequest(username="local-admin", password="local-review-pass"),
        request,
    )
    assert response["role"] == "admin"
    assert response["token"]


@pytest.mark.asyncio
async def test_password_change_and_disable_revokes_tokens(test_env):
    async with test_env["session_maker"]() as db:
        member = User(email="member", password_hash=hash_password("password123"), role="user")
        db.add(member)
        await db.commit()
        await db.refresh(member)

    stale = {
        "sub": str(member.id),
        "role": "user",
        "iat": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
        "exp": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    fresh = {
        "sub": str(member.id),
        "role": "user",
        "iat": (datetime.now(UTC) + timedelta(minutes=1)).isoformat(),
        "exp": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }

    async with test_env["session_maker"]() as db:
        await ensure_account_active(db, stale)

    async with test_env["session_maker"]() as db:
        member_db = await user_service.get_user_by_id(db, member.id)
        await user_service.update_user_password(db, member_db, hash_password("new-password-123"))
        await db.commit()

    async with test_env["session_maker"]() as db:
        with pytest.raises(HTTPException) as exc_info:
            await ensure_account_active(db, stale)
        assert exc_info.value.status_code == 401
        await ensure_account_active(db, fresh)

    async with test_env["session_maker"]() as db:
        await user_service.set_user_disabled(db, member.id, True)
        await db.commit()

    async with test_env["session_maker"]() as db:
        with pytest.raises(HTTPException):
            await ensure_account_active(db, fresh)
        with pytest.raises(HTTPException):
            await ensure_account_active(db, {"sub": "99999", "role": "user"})


def test_password_byte_limit_enforced():
    with pytest.raises(PasswordTooLongError):
        hash_password("x" * 73)
    with pytest.raises(PasswordTooLongError):
        hash_password("密" * 25)

    hashed = hash_password("correct horse battery")
    assert verify_password("correct horse battery", hashed)
    assert not verify_password("y" * 73, hashed)


def test_ip_rate_limiter_blocks_after_max_attempts():
    limiter = IpRateLimiter(max_attempts=3, window_seconds=300)
    request = SimpleNamespace(client=SimpleNamespace(host="203.0.113.9"))
    for _ in range(3):
        limiter.check(request)
        limiter.record(request)

    with pytest.raises(HTTPException) as exc_info:
        limiter.check(request)
    assert exc_info.value.status_code == 429

    other = SimpleNamespace(client=SimpleNamespace(host="198.51.100.4"))
    limiter.check(other)


def test_word_create_rejects_non_word_text():
    assert WordCreate(text="hello-world").text == "hello-world"
    assert WordCreate(text="don't stop").text == "don't stop"

    for bad in ["你好", "abc; drop table", "a\nb", "word:", "123start", ""]:
        with pytest.raises(ValidationError):
            WordCreate(text=bad)


@pytest.mark.asyncio
async def test_new_verification_code_invalidates_previous(test_env):
    config = test_env["config"]
    email = "stale-code@example.com"

    async with test_env["session_maker"]() as db:
        await user_service.create_email_verification(db, email, "111111", config.auth_secret, 10, "register")
        await db.commit()

    async with test_env["session_maker"]() as db:
        await user_service.create_email_verification(db, email, "222222", config.auth_secret, 10, "register")
        await db.commit()

    async with test_env["session_maker"]() as db:
        assert not await user_service.verify_email_code(db, email, "111111", config.auth_secret, "register")
        assert await user_service.verify_email_code(db, email, "222222", config.auth_secret, "register")
        await db.commit()


@pytest.mark.asyncio
async def test_kaoyan_lexicon_seed_and_capture(test_env):
    from pathlib import Path

    from backend.models.kaoyan import ExamSentence
    from backend.routers import kaoyan as kaoyan_router
    from backend.services import kaoyan_service

    data_dir = Path(__file__).resolve().parents[2] / "data" / "kaoyan"

    # The fixture creates tables before this module's models are imported.
    from backend.models.kaoyan import KaoyanWord  # noqa: F401

    async with test_env["engine"].begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with test_env["session_maker"]() as db:
        word_count, sentence_count = await kaoyan_service.seed_if_empty(db, data_dir)
        await db.commit()
        assert word_count > 4000
        assert sentence_count > 800

        sentences = list((await db.execute(select(ExamSentence))).scalars().all())
        index = kaoyan_service.build_inverted_index(sentences)
        assert "abandon" in index

    test_env["app"].state.kaoyan_index = index
    request = make_request(test_env["app"], test_env["token"])

    result = await kaoyan_router.capture_kaoyan_word(
        kaoyan_router.CaptureRequest(word="abandon"), request
    )
    assert result["created"] is True

    async with test_env["session_maker"]() as db:
        word = await word_service.get_word_by_text(db, "abandon", user_id=1)
        assert word is not None
        detail = await word_service.get_word(db, word.id, user_id=1, role="admin")
        assert detail is not None
        assert "放弃" in detail.definitions[0].meaning_zh
        assert len(detail.definitions[0].examples) == min(3, len(index["abandon"]))

        stats = await kaoyan_service.get_stats(db, user_id=1)
        assert stats["total"] == word_count
        assert stats["captured"] >= 1

    repeat = await kaoyan_router.capture_kaoyan_word(
        kaoyan_router.CaptureRequest(word="abandon"), request
    )
    assert repeat["created"] is False


@pytest.mark.asyncio
async def test_kaoyan_filtered_totals_and_user_isolation(test_env):
    from backend.models.kaoyan import KaoyanWord
    from backend.services import kaoyan_service
    async with test_env['engine'].begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with test_env['session_maker']() as db:
        db.add_all([KaoyanWord(word='apple', translation='苹果'), KaoyanWord(word='apply', translation='申请'), KaoyanWord(word='book', translation='书')])
        await word_service.create_word(db, 'apple', user_id=1)
        await db.flush()
        for status, expected in [('captured', 1), ('uncaptured', 2), (None, 3)]:
            rows, total = await kaoyan_service.list_words(db, status=status, user_id=1)
            assert len(rows) == total == expected
        rows, total = await kaoyan_service.list_words(db, q='app', status='uncaptured', user_id=1)
        assert total == 1 and rows[0]['word'] == 'apply'
        rows, total = await kaoyan_service.list_words(db, status='captured', user_id=2)
        assert rows == [] and total == 0
        rows, total = await kaoyan_service.list_words(db, page=2, page_size=1, status='captured', user_id=1)
        assert rows == [] and total == 1


@pytest.mark.asyncio
async def test_kaoyan_missing_or_invalid_data_does_not_delete_existing(test_env, tmp_path):
    import json
    from sqlalchemy import func
    from backend.models.kaoyan import ExamSentence
    from backend.services import kaoyan_service
    async with test_env['engine'].begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with test_env['session_maker']() as db:
        db.add(ExamSentence(year=2024, text='An existing sentence.', words_json='["existing"]'))
        await db.flush()
        with pytest.raises(RuntimeError, match='missing'):
            await kaoyan_service.seed_if_empty(db, tmp_path)
        (tmp_path / 'kaoyan_words.json').write_text(json.dumps([{'word': 'test', 'translation': '测试'}]))
        (tmp_path / 'exam_sentences.json').write_text(json.dumps([{'year': 2024, 'text': 'Invalid', 'words': 1}]))
        with pytest.raises(ValueError, match='Invalid sentence'):
            await kaoyan_service.seed_if_empty(db, tmp_path)
        assert (await db.execute(select(func.count()).select_from(ExamSentence))).scalar() == 1


@pytest.mark.asyncio
async def test_auth_identity_is_consistent_across_login_and_status(test_env):
    request = make_request(test_env['app'], test_env['token'])
    request.client = SimpleNamespace(host='127.0.0.1')
    result = await auth_router.login(auth_router.LoginRequest(username='local-admin', password='local-review-pass'), request)
    status = await auth_router.get_auth_status(make_request(test_env['app'], result['token']))
    assert result['user_id'] == status['user_id'] == 1
    assert result['username'] == status['username'] == 'local-admin'
