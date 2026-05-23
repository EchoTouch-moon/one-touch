from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.collocation import Collocation
from backend.models.definition import Definition
from backend.models.example import ExampleSentence
from backend.models.review import ReviewRecord
from backend.models.word import Word


def _scope(query, user_id: Optional[int], role: Optional[str]):
    if role != "admin" and user_id is not None:
        return query.where(Word.user_id == user_id)
    return query


async def _delete_scoped_words(
    session: AsyncSession,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> None:
    word_id_query = select(Word.id)
    word_id_query = _scope(word_id_query, user_id, role)
    word_ids = list((await session.execute(word_id_query)).scalars().all())
    if not word_ids:
        return

    definition_ids = list(
        (
            await session.execute(
                select(Definition.id).where(Definition.word_id.in_(word_ids))
            )
        )
        .scalars()
        .all()
    )
    if definition_ids:
        await session.execute(delete(Collocation).where(Collocation.definition_id.in_(definition_ids)))
        await session.execute(delete(ExampleSentence).where(ExampleSentence.definition_id.in_(definition_ids)))
        await session.execute(delete(Definition).where(Definition.id.in_(definition_ids)))

    await session.execute(delete(ReviewRecord).where(ReviewRecord.word_id.in_(word_ids)))
    await session.execute(delete(Word).where(Word.id.in_(word_ids)))
    await session.flush()


async def _find_word_by_text(
    session: AsyncSession,
    text: str,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> Word | None:
    query = select(Word).where(Word.text == text)
    query = _scope(query, user_id, role)
    result = await session.execute(query)
    return result.scalar_one_or_none()


async def export_all(
    session: AsyncSession,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> dict:
    query = select(Word).options(
        selectinload(Word.definitions).selectinload(Definition.examples),
        selectinload(Word.definitions).selectinload(Definition.collocations),
        selectinload(Word.review_record),
    )
    query = _scope(query, user_id, role)
    result = await session.execute(query)
    words = list(result.scalars().all())

    export_data = {
        "version": "1.0",
        "exported_at": datetime.now(UTC).isoformat(),
        "words": [],
    }

    for word in words:
        word_data: dict = {
            "text": word.text,
            "phonetic": word.phonetic,
            "status": word.status,
            "created_at": word.created_at.isoformat() if word.created_at else None,
            "definitions": [],
            "review_record": None,
        }

        for defn in word.definitions:
            def_data: dict = {
                "pos": defn.pos,
                "meaning_en": defn.meaning_en,
                "meaning_zh": defn.meaning_zh,
                "examples": [
                    {
                        "sentence_en": ex.sentence_en,
                        "sentence_zh": ex.sentence_zh,
                        "source": ex.source,
                    }
                    for ex in defn.examples
                ],
                "collocations": [
                    {"pattern": col.pattern, "meaning_zh": col.meaning_zh}
                    for col in defn.collocations
                ],
            }
            word_data["definitions"].append(def_data)

        if word.review_record:
            rr = word.review_record
            word_data["review_record"] = {
                "ease_factor": rr.ease_factor,
                "interval_days": rr.interval_days,
                "repetitions": rr.repetitions,
                "next_review": rr.next_review.isoformat() if rr.next_review else None,
                "last_review": rr.last_review.isoformat() if rr.last_review else None,
                "last_quality": rr.last_quality,
            }

        export_data["words"].append(word_data)

    return export_data


async def import_data(
    session: AsyncSession,
    data: dict,
    mode: str = "merge",
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> dict:
    if mode == "replace":
        await _delete_scoped_words(session, user_id=user_id, role=role)

    imported = 0
    skipped = 0

    for word_data in data.get("words", []):
        text = word_data.get("text", "").strip().lower()
        if not text:
            continue

        existing_word = await _find_word_by_text(session, text, user_id=user_id, role=role)

        if mode == "merge" and existing_word:
            skipped += 1
            continue

        global_existing = await session.execute(select(Word.id).where(Word.text == text))
        if global_existing.scalar_one_or_none() is not None:
            skipped += 1
            continue

        word = Word(
            text=text,
            phonetic=word_data.get("phonetic"),
            status=word_data.get("status", "captured"),
            user_id=user_id,
        )
        session.add(word)
        await session.flush()

        for def_data in word_data.get("definitions", []):
            defn = Definition(
                word_id=word.id,
                pos=def_data.get("pos", "unknown"),
                meaning_en=def_data.get("meaning_en", ""),
                meaning_zh=def_data.get("meaning_zh", ""),
            )
            session.add(defn)
            await session.flush()

            for ex_data in def_data.get("examples", []):
                session.add(
                    ExampleSentence(
                        definition_id=defn.id,
                        sentence_en=ex_data.get("sentence_en", ""),
                        sentence_zh=ex_data.get("sentence_zh", ""),
                        source=ex_data.get("source"),
                    )
                )

            for coll_data in def_data.get("collocations", []):
                session.add(
                    Collocation(
                        definition_id=defn.id,
                        pattern=coll_data.get("pattern", ""),
                        meaning_zh=coll_data.get("meaning_zh"),
                    )
                )

        rr_data = word_data.get("review_record")
        if rr_data:
            next_review_str = rr_data.get("next_review")
            last_review_str = rr_data.get("last_review")
            session.add(
                ReviewRecord(
                    word_id=word.id,
                    ease_factor=rr_data.get("ease_factor", 2.5),
                    interval_days=rr_data.get("interval_days", 0),
                    repetitions=rr_data.get("repetitions", 0),
                    next_review=datetime.fromisoformat(next_review_str) if next_review_str else datetime.now(UTC),
                    last_review=datetime.fromisoformat(last_review_str) if last_review_str else None,
                    last_quality=rr_data.get("last_quality"),
                )
            )

        imported += 1

    await session.flush()
    return {"imported": imported, "skipped": skipped}
