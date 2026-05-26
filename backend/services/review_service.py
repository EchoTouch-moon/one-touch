from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import case, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.config import ReviewConfig
from backend.models.definition import Definition
from backend.models.review import ReviewLog, ReviewRecord
from backend.models.word import Word
from backend.srs import SRSConfig, SRSFactory, SRSState


NEW_LEARNING_STEPS = [timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=15)]
RELEARNING_STEPS = [timedelta(minutes=5), timedelta(minutes=15)]
DEFAULT_REVIEW_CONFIG = ReviewConfig()


def _scope(query, user_id: Optional[int], role: Optional[str]):
    if role != "admin" and user_id is not None:
        return query.where(Word.user_id == user_id)
    return query


def _review_tz(config: ReviewConfig = DEFAULT_REVIEW_CONFIG) -> ZoneInfo:
    try:
        return ZoneInfo(config.timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Asia/Shanghai")


def review_day_cutoff(
    now: datetime | None = None,
    config: ReviewConfig = DEFAULT_REVIEW_CONFIG,
) -> datetime:
    now_utc = now or datetime.now(UTC)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=UTC)
    tz = _review_tz(config)
    local_now = now_utc.astimezone(tz)
    boundary = local_now.replace(
        hour=config.day_boundary_hour,
        minute=0,
        second=0,
        microsecond=0,
    )
    if local_now >= boundary:
        boundary += timedelta(days=1)
    return boundary.astimezone(UTC)


def _next_review_at(
    reviewed_at: datetime,
    interval_days: int,
    config: ReviewConfig,
) -> datetime:
    if interval_days <= 0:
        return reviewed_at
    reviewed_utc = reviewed_at if reviewed_at.tzinfo else reviewed_at.replace(tzinfo=UTC)
    tz = _review_tz(config)
    local_reviewed = reviewed_utc.astimezone(tz)
    target_date = local_reviewed.date() + timedelta(days=interval_days)
    local_due = datetime.combine(
        target_date,
        datetime.min.time(),
        tzinfo=tz,
    ).replace(hour=config.day_boundary_hour)
    return local_due.astimezone(UTC)


def _elapsed_days(record: ReviewRecord | None, reviewed_at: datetime) -> float | None:
    if record is None or record.last_review is None:
        return None
    last_review = record.last_review
    if last_review.tzinfo is None:
        last_review = last_review.replace(tzinfo=UTC)
    reviewed = reviewed_at if reviewed_at.tzinfo else reviewed_at.replace(tzinfo=UTC)
    return max((reviewed - last_review).total_seconds() / 86400, 0.0)


def _algorithm_name(config: ReviewConfig) -> str:
    return config.algorithm if config.algorithm in {"sm2", "fsrs"} else "sm2"


def _srs_config(config: ReviewConfig) -> SRSConfig:
    return SRSConfig(target_retrievability=config.target_retrievability)


def _state_from_record(record: ReviewRecord | None, elapsed_days: float | None) -> SRSState:
    if record is None:
        return SRSState(ease_factor=2.5, interval_days=0, repetitions=0, elapsed_days=elapsed_days)
    return SRSState(
        ease_factor=record.ease_factor,
        interval_days=record.interval_days,
        repetitions=record.repetitions,
        difficulty=record.difficulty,
        stability=record.stability,
        retrievability=record.retrievability,
        scheduled_days=record.scheduled_days,
        elapsed_days=elapsed_days,
    )


async def get_due_words(
    session: AsyncSession,
    limit: int = 50,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
    config: ReviewConfig = DEFAULT_REVIEW_CONFIG,
) -> list[Word]:
    now = datetime.now(UTC)
    due_cutoff = review_day_cutoff(now, config)
    has_defs = exists(select(Definition.id).where(Definition.word_id == Word.id))
    learning_due = (
        ReviewRecord.id.is_not(None)
        & ReviewRecord.phase.in_(("learning", "relearning"))
        & ReviewRecord.learning_due_at.is_not(None)
        & (ReviewRecord.learning_due_at <= now)
    )
    review_due = (
        ReviewRecord.id.is_not(None)
        & ~ReviewRecord.phase.in_(("learning", "relearning"))
        & (ReviewRecord.next_review <= due_cutoff)
    )
    new_card = ReviewRecord.id.is_(None)
    priority = case(
        (learning_due, 0),
        (review_due, 1),
        (new_card, 2),
        else_=3,
    )
    query = (
        select(Word)
        .join(ReviewRecord, Word.id == ReviewRecord.word_id, isouter=True)
        .where(
            has_defs,
            new_card | learning_due | review_due,
        )
        .options(selectinload(Word.definitions), selectinload(Word.review_record))
        .order_by(priority, ReviewRecord.learning_due_at.asc(), ReviewRecord.next_review.asc(), Word.created_at.asc())
        .limit(limit)
    )
    query = _scope(query, user_id, role)
    result = await session.execute(query)
    return list(result.scalars().all())


async def submit_review(
    session: AsyncSession,
    word_id: int,
    quality: int,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
    reviewed_at: datetime | None = None,
    config: ReviewConfig = DEFAULT_REVIEW_CONFIG,
) -> ReviewRecord:
    now = reviewed_at or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)

    word_query = select(Word.id).where(Word.id == word_id)
    word_query = _scope(word_query, user_id, role)
    word_result = await session.execute(word_query)
    if word_result.scalar_one_or_none() is None:
        raise ValueError(f"Word {word_id} not found")

    result = await session.execute(
        select(ReviewRecord).where(ReviewRecord.word_id == word_id)
    )
    record = result.scalar_one_or_none()

    algorithm = _algorithm_name(config)
    srs = SRSFactory(algorithm)
    srs_config = _srs_config(config)
    phase_before = record.phase if record else "new"
    elapsed_days = _elapsed_days(record, now)

    if record is None:
        record = ReviewRecord(
            word_id=word_id,
            next_review=now,
            last_review=now,
            last_quality=quality,
            algorithm=algorithm,
            phase="new",
            learning_step=0,
        )
        session.add(record)

    if quality < 3:
        if phase_before == "review":
            steps = RELEARNING_STEPS
            record.phase = "relearning"
        else:
            steps = NEW_LEARNING_STEPS
            record.phase = "learning"
        record.learning_step = 0
        record.learning_due_at = now + steps[0]
        record.last_review = now
        record.last_quality = quality
        record.algorithm = algorithm
    elif phase_before in {"new", "learning"} and (record.learning_step or 0) < len(NEW_LEARNING_STEPS):
        step_index = record.learning_step or 0
        record.phase = "learning"
        record.learning_due_at = now + NEW_LEARNING_STEPS[step_index]
        record.learning_step = step_index + 1
        record.last_review = now
        record.last_quality = quality
        record.algorithm = algorithm
    elif phase_before == "relearning" and (record.learning_step or 0) < len(RELEARNING_STEPS):
        step_index = record.learning_step or 0
        record.phase = "relearning"
        record.learning_due_at = now + RELEARNING_STEPS[step_index]
        record.learning_step = step_index + 1
        record.last_review = now
        record.last_quality = quality
        record.algorithm = algorithm
    else:
        state = _state_from_record(record, elapsed_days)
        srs_result = srs.calculate(state, quality, srs_config)
        record.ease_factor = srs_result.new_state.ease_factor
        record.interval_days = srs_result.new_state.interval_days
        record.repetitions = srs_result.new_state.repetitions
        record.difficulty = srs_result.new_state.difficulty
        record.stability = srs_result.new_state.stability
        record.retrievability = srs_result.new_state.retrievability
        record.scheduled_days = srs_result.scheduled_days or srs_result.next_interval_days
        record.next_review = _next_review_at(now, srs_result.next_interval_days, config)
        record.learning_step = 0
        record.learning_due_at = None
        record.phase = "review"
        record.last_review = now
        record.last_quality = quality
        record.algorithm = algorithm

    session.add(
        ReviewLog(
            word_id=word_id,
            reviewed_at=now,
            quality=quality,
            phase_before=phase_before,
            phase_after=record.phase,
            scheduled_days=record.scheduled_days or record.interval_days,
            elapsed_days=elapsed_days,
            algorithm=algorithm,
        )
    )

    await session.flush()
    await session.refresh(record)
    return record


async def get_review_stats(
    session: AsyncSession,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
    config: ReviewConfig = DEFAULT_REVIEW_CONFIG,
) -> dict:
    now = datetime.now(UTC)
    due_cutoff = review_day_cutoff(now, config)
    has_defs = exists(select(Definition.id).where(Definition.word_id == Word.id))
    learning_due = (
        ReviewRecord.id.is_not(None)
        & ReviewRecord.phase.in_(("learning", "relearning"))
        & ReviewRecord.learning_due_at.is_not(None)
        & (ReviewRecord.learning_due_at <= now)
    )
    review_due = (
        ReviewRecord.id.is_not(None)
        & ~ReviewRecord.phase.in_(("learning", "relearning"))
        & (ReviewRecord.next_review <= due_cutoff)
    )

    due_query = (
        select(func.count())
        .select_from(Word)
        .join(ReviewRecord, Word.id == ReviewRecord.word_id, isouter=True)
        .where(
            has_defs,
            (ReviewRecord.id.is_(None)) | learning_due | review_due,
        )
    )
    due_query = _scope(due_query, user_id, role)
    due_result = await session.execute(due_query)
    due_count = due_result.scalar() or 0

    total_query = select(func.count()).select_from(Word).where(has_defs)
    total_query = _scope(total_query, user_id, role)
    total_result = await session.execute(total_query)
    total_words = total_result.scalar() or 0

    today_start = review_day_cutoff(now - timedelta(days=1), config)
    reviewed_query = (
        select(func.count())
        .select_from(ReviewRecord)
        .join(Word, Word.id == ReviewRecord.word_id)
        .where(ReviewRecord.last_review >= today_start)
    )
    reviewed_query = _scope(reviewed_query, user_id, role)
    reviewed_result = await session.execute(reviewed_query)
    reviewed_today = reviewed_result.scalar() or 0

    return {
        "due_count": due_count,
        "reviewed_today": reviewed_today,
        "total_words": total_words,
    }
