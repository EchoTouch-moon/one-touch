from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.definition import Definition
from backend.models.review import ReviewRecord
from backend.models.word import Word


def _to_date(value: datetime | None) -> date | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.date()
    return value.astimezone(UTC).date()


def _scope(query, user_id: Optional[int], role: Optional[str]):
    if role != "admin" and user_id is not None:
        return query.where(Word.user_id == user_id)
    return query


async def get_activity(
    session: AsyncSession,
    days: int = 365,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> dict:
    days = max(1, min(days, 366))
    today = datetime.now(UTC).date()
    start_day = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_day, datetime.min.time(), tzinfo=UTC)

    captured_query = select(Word.created_at).where(Word.created_at >= start_dt)
    captured_query = _scope(captured_query, user_id, role)
    captured_result = await session.execute(captured_query)

    reviewed_result = await session.execute(
        select(ReviewRecord.last_review).where(ReviewRecord.last_review >= start_dt)
    )

    activity = {
        (start_day + timedelta(days=i)).isoformat(): {"captured": 0, "reviewed": 0}
        for i in range(days)
    }

    for created_at in captured_result.scalars().all():
        day = _to_date(created_at)
        if day and day >= start_day:
            activity[day.isoformat()]["captured"] += 1

    for last_review in reviewed_result.scalars().all():
        day = _to_date(last_review)
        if day and day >= start_day:
            activity[day.isoformat()]["reviewed"] += 1

    due_now = datetime.now(UTC)
    due_query = (
        select(func.count())
        .select_from(Word)
        .join(ReviewRecord, Word.id == ReviewRecord.word_id, isouter=True)
        .where(
            select(Definition.id).where(Definition.word_id == Word.id).exists(),
            (ReviewRecord.id.is_(None)) | (ReviewRecord.next_review <= due_now),
        )
    )
    due_query = _scope(due_query, user_id, role)
    due_result = await session.execute(due_query)

    total_query = select(func.count()).select_from(Word)
    total_query = _scope(total_query, user_id, role)
    total_result = await session.execute(total_query)

    enriched_query = select(func.count()).select_from(Word).where(Word.status == "enriched")
    enriched_query = _scope(enriched_query, user_id, role)
    enriched_result = await session.execute(enriched_query)

    active_days = {day for day, counts in activity.items() if counts["captured"] or counts["reviewed"]}
    streak = 0
    cursor = today
    while cursor.isoformat() in active_days:
        streak += 1
        cursor -= timedelta(days=1)

    return {
        "days": [
            {"date": day, **counts}
            for day, counts in activity.items()
        ],
        "summary": {
            "total_words": total_result.scalar() or 0,
            "enriched_words": enriched_result.scalar() or 0,
            "due_count": due_result.scalar() or 0,
            "streak_days": streak,
        },
    }
