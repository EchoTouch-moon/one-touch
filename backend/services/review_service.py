from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Optional

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.definition import Definition
from backend.models.review import ReviewRecord
from backend.models.word import Word
from backend.srs import SRSConfig, SRSFactory, SRSState


def _scope(query, user_id: Optional[int], role: Optional[str]):
    if role != "admin" and user_id is not None:
        return query.where(Word.user_id == user_id)
    return query


async def get_due_words(
    session: AsyncSession,
    limit: int = 50,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> list[Word]:
    now = datetime.now(UTC)
    has_defs = exists(select(Definition.id).where(Definition.word_id == Word.id))
    query = (
        select(Word)
        .join(ReviewRecord, Word.id == ReviewRecord.word_id, isouter=True)
        .where(
            has_defs,
            (ReviewRecord.id.is_(None)) | (ReviewRecord.next_review <= now),
        )
        .options(selectinload(Word.definitions), selectinload(Word.review_record))
        .order_by(ReviewRecord.id.is_(None).desc(), Word.created_at.asc())
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
) -> ReviewRecord:
    now = datetime.now(UTC)

    word_query = select(Word.id).where(Word.id == word_id)
    word_query = _scope(word_query, user_id, role)
    word_result = await session.execute(word_query)
    if word_result.scalar_one_or_none() is None:
        raise ValueError(f"Word {word_id} not found")

    result = await session.execute(
        select(ReviewRecord).where(ReviewRecord.word_id == word_id)
    )
    record = result.scalar_one_or_none()

    srs = SRSFactory("sm2")
    config = SRSConfig()

    if record is None:
        state = SRSState(ease_factor=2.5, interval_days=0, repetitions=0)
        srs_result = srs.calculate(state, quality, config)
        record = ReviewRecord(
            word_id=word_id,
            ease_factor=srs_result.new_state.ease_factor,
            interval_days=srs_result.new_state.interval_days,
            repetitions=srs_result.new_state.repetitions,
            next_review=now + timedelta(days=srs_result.next_interval_days),
            last_review=now,
            last_quality=quality,
        )
        session.add(record)
    else:
        state = SRSState(
            ease_factor=record.ease_factor,
            interval_days=record.interval_days,
            repetitions=record.repetitions,
        )
        srs_result = srs.calculate(state, quality, config)
        record.ease_factor = srs_result.new_state.ease_factor
        record.interval_days = srs_result.new_state.interval_days
        record.repetitions = srs_result.new_state.repetitions
        record.next_review = now + timedelta(days=srs_result.next_interval_days)
        record.last_review = now
        record.last_quality = quality

    await session.flush()
    await session.refresh(record)
    return record


async def get_review_stats(
    session: AsyncSession,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> dict:
    now = datetime.now(UTC)
    has_defs = exists(select(Definition.id).where(Definition.word_id == Word.id))

    due_query = (
        select(func.count())
        .select_from(Word)
        .join(ReviewRecord, Word.id == ReviewRecord.word_id, isouter=True)
        .where(
            has_defs,
            (ReviewRecord.id.is_(None)) | (ReviewRecord.next_review <= now)
        )
    )
    due_query = _scope(due_query, user_id, role)
    due_result = await session.execute(due_query)
    due_count = due_result.scalar() or 0

    total_query = select(func.count()).select_from(Word).where(has_defs)
    total_query = _scope(total_query, user_id, role)
    total_result = await session.execute(total_query)
    total_words = total_result.scalar() or 0

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
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
