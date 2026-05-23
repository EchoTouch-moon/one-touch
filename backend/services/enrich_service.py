from __future__ import annotations

import logging
import time
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.llm import LLMConfig, LLMFactory
from backend.models.collocation import Collocation
from backend.models.definition import Definition
from backend.models.example import ExampleSentence
from backend.models.word import Word

logger = logging.getLogger(__name__)


def _scope(query, user_id: Optional[int], role: Optional[str]):
    if role != "admin" and user_id is not None:
        return query.where(Word.user_id == user_id)
    return query


async def _delete_previous_ai_definitions(session: AsyncSession, word_id: int) -> None:
    ai_definition_rows = await session.execute(
        select(Definition.id)
        .join(ExampleSentence, ExampleSentence.definition_id == Definition.id)
        .where(
            Definition.word_id == word_id,
            Definition.canvas_image.is_(None),
            Definition.ink_data.is_(None),
            ExampleSentence.source == "llm",
        )
        .distinct()
    )
    ai_definition_ids = list(ai_definition_rows.scalars().all())
    if not ai_definition_ids:
        return

    await session.execute(delete(Collocation).where(Collocation.definition_id.in_(ai_definition_ids)))
    await session.execute(delete(ExampleSentence).where(ExampleSentence.definition_id.in_(ai_definition_ids)))
    await session.execute(delete(Definition).where(Definition.id.in_(ai_definition_ids)))
    await session.flush()


async def enrich_word(
    session: AsyncSession,
    word_id: int,
    llm_config: LLMConfig,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> Word:
    start = time.perf_counter()
    query = select(Word).where(Word.id == word_id)
    query = _scope(query, user_id, role)
    result = await session.execute(query)
    word = result.scalar_one_or_none()
    if word is None:
        raise ValueError(f"Word {word_id} not found")

    provider = LLMFactory(llm_config)
    enrich_result = await provider.enrich_word(word.text)

    # Update phonetic
    if enrich_result.phonetic:
        word.phonetic = enrich_result.phonetic

    await _delete_previous_ai_definitions(session, word.id)

    existing_count = await session.execute(
        select(func.count()).select_from(Definition).where(Definition.word_id == word.id)
    )
    order_offset = existing_count.scalar() or 0

    for i, def_data in enumerate(enrich_result.definitions):
        definition = Definition(
            word_id=word.id,
            pos=def_data.get("pos", "unknown"),
            meaning_en=def_data.get("meaning_en", ""),
            meaning_zh=def_data.get("meaning_zh", ""),
            order=order_offset + i,
        )
        session.add(definition)
        await session.flush()

        example_data = def_data.get("example")
        examples = [example_data] if isinstance(example_data, dict) else []
        legacy_pos_examples = [e for e in enrich_result.examples if e.get("pos") == def_data.get("pos")]
        for j, ex_data in enumerate(examples or legacy_pos_examples[:1]):
            example = ExampleSentence(
                definition_id=definition.id,
                sentence_en=ex_data.get("sentence_en", ""),
                sentence_zh=ex_data.get("sentence_zh", ""),
                source="llm",
                order=j,
            )
            session.add(example)

        def_pos = def_data.get("pos")
        def_colls = [c for c in enrich_result.collocations if c.get("pos") == def_pos]
        if not def_colls and i == 0:
            def_colls = [c for c in enrich_result.collocations if not c.get("pos")]
        for j, coll_data in enumerate(def_colls):
            collocation = Collocation(
                definition_id=definition.id,
                pattern=coll_data.get("pattern", ""),
                meaning_zh=coll_data.get("meaning_zh", ""),
                order=j,
            )
            session.add(collocation)

    word.status = "enriched"
    await session.flush()
    await session.refresh(word)
    logger.info(
        "enrich_word completed word_id=%s duration_ms=%.1f provider=%s",
        word.id,
        (time.perf_counter() - start) * 1000,
        llm_config.provider,
    )

    return word
