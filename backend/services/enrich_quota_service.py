from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.enrich_usage import AiEnrichUsage


@dataclass(frozen=True)
class EnrichQuota:
    limit: int | None
    used: int
    remaining: int | None
    reset_at: str


class EnrichQuotaExceeded(Exception):
    def __init__(self, quota: EnrichQuota) -> None:
        super().__init__("Daily AI enrich limit reached")
        self.quota = quota


def today_utc() -> date:
    return datetime.now(UTC).date()


def next_reset_iso(day: date) -> str:
    return datetime(day.year, day.month, day.day, tzinfo=UTC).replace(day=day.day).isoformat()


def quota_from_count(count: int, daily_limit: int, day: date) -> EnrichQuota:
    remaining = max(0, daily_limit - count)
    reset_day = date.fromordinal(day.toordinal() + 1)
    return EnrichQuota(
        limit=daily_limit,
        used=count,
        remaining=remaining,
        reset_at=next_reset_iso(reset_day),
    )


async def get_usage_record(session: AsyncSession, user_id: int, day: date) -> AiEnrichUsage | None:
    result = await session.execute(
        select(AiEnrichUsage).where(
            AiEnrichUsage.user_id == user_id,
            AiEnrichUsage.usage_date == day,
        )
    )
    return result.scalar_one_or_none()


async def get_quota(
    session: AsyncSession,
    *,
    user_id: int,
    role: str,
    daily_limit: int,
    day: date | None = None,
) -> EnrichQuota:
    day = day or today_utc()
    if role == "admin":
        reset_day = date.fromordinal(day.toordinal() + 1)
        return EnrichQuota(limit=None, used=0, remaining=None, reset_at=next_reset_iso(reset_day))

    record = await get_usage_record(session, user_id, day)
    return quota_from_count(record.count if record else 0, daily_limit, day)


async def reserve_enrich(
    session: AsyncSession,
    *,
    user_id: int,
    role: str,
    daily_limit: int,
    day: date | None = None,
) -> EnrichQuota:
    day = day or today_utc()
    if role == "admin":
        return await get_quota(session, user_id=user_id, role=role, daily_limit=daily_limit, day=day)

    record = await get_usage_record(session, user_id, day)
    if record is None:
        record = AiEnrichUsage(user_id=user_id, usage_date=day, count=0)
        session.add(record)
        await session.flush()

    if record.count >= daily_limit:
        raise EnrichQuotaExceeded(quota_from_count(record.count, daily_limit, day))

    record.count += 1
    await session.flush()
    return quota_from_count(record.count, daily_limit, day)


async def release_enrich(
    session: AsyncSession,
    *,
    user_id: int,
    role: str,
    day: date | None = None,
) -> None:
    if role == "admin":
        return

    day = day or today_utc()
    record = await get_usage_record(session, user_id, day)
    if record is None:
        return
    record.count = max(0, record.count - 1)
    await session.flush()
