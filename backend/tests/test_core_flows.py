from __future__ import annotations

from types import SimpleNamespace
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.auth import create_auth_token
from backend.passwords import verify_password
from backend.config import AppConfig, DatabaseConfig, EnrichConfig, LLMProviderConfig, OpsConfig, ReviewConfig
from backend.database import Base
from backend.llm import LLMConfig, LLMFactory
from backend.llm.base import EnrichResult
from backend.llm.doubao_provider import DoubaoProvider, _strip_json_markdown
from backend.models import ReviewLog, ReviewRecord, User
from backend.routers import auth as auth_router
from backend.routers import ops as ops_router
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

    app = SimpleNamespace(state=SimpleNamespace(session_maker=session_maker, config=config))
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
async def test_review_session_and_submit(test_env):
    request = make_request(test_env["app"], test_env["token"])
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
        assert result == {"imported": 1, "skipped": 0}

    async with test_env["session_maker"]() as db:
        user_words, _ = await word_service.list_words(db, user_id=1, role="user")
        other_words, _ = await word_service.list_words(db, user_id=other.id, role="user")
        assert [word.text for word in user_words] == ["replacement"]
        assert [word.text for word in other_words] == ["external"]


@pytest.mark.asyncio
async def test_sync_merge_skips_word_owned_by_another_user(test_env):
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
        assert result == {"imported": 0, "skipped": 1}


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
        assert ai_def.meaning_zh.startswith("三角洲")
        assert ai_def.examples[0].sentence_en == "The river forms a wide delta."


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

    request = SimpleNamespace(app=test_env["app"])
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

    request = SimpleNamespace(app=test_env["app"])
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

    request = SimpleNamespace(app=test_env["app"])
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

    request = SimpleNamespace(app=test_env["app"])
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
