from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.definition import Definition
from backend.models.collocation import Collocation
from backend.models.example import ExampleSentence
from backend.models.word import Word


def _scope(query, user_id: Optional[int], role: Optional[str]):
    if role != "admin" and user_id is not None:
        return query.where(Word.user_id == user_id)
    return query


async def create_word(session: AsyncSession, text: str, *, user_id: Optional[int] = None) -> Word:
    text = text.strip().lower()
    word = Word(text=text, status="captured", user_id=user_id)
    session.add(word)
    await session.flush()
    await session.refresh(word)
    return word


async def get_word(
    session: AsyncSession, word_id: int, *, user_id: Optional[int] = None, role: Optional[str] = None
) -> Word | None:
    query = select(Word).where(Word.id == word_id).options(
        selectinload(Word.definitions).selectinload(Definition.examples),
        selectinload(Word.definitions).selectinload(Definition.collocations),
    )
    query = _scope(query, user_id, role)
    result = await session.execute(query)
    word = result.scalar_one_or_none()
    if word is not None:
        word.definition_count = len(word.definitions)
        word.review_ready = len(word.definitions) > 0
    return word


async def list_words(
    session: AsyncSession,
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
    sort: str = "created_at",
    order: str = "desc",
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> tuple[list[Word], int]:
    query = select(Word)
    count_query = select(func.count()).select_from(Word)

    if status:
        query = query.where(Word.status == status)
        count_query = count_query.where(Word.status == status)

    query = _scope(query, user_id, role)
    count_query = _scope(count_query, user_id, role)

    valid_sort_fields = {"created_at", "updated_at", "text", "status", "id"}
    if sort not in valid_sort_fields:
        sort = "created_at"
    sort_col = getattr(Word, sort)
    if order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await session.execute(query)
    words = list(result.scalars().all())
    await attach_review_readiness(session, words)

    count_result = await session.execute(count_query)
    total = count_result.scalar() or 0

    return words, total


async def search_words(
    session: AsyncSession,
    q: str,
    page: int = 1,
    page_size: int = 50,
    *,
    user_id: Optional[int] = None,
    role: Optional[str] = None,
) -> tuple[list[Word], int]:
    pattern = f"%{q}%"
    query = select(Word).where(Word.text.ilike(pattern))
    count_query = select(func.count()).select_from(Word).where(Word.text.ilike(pattern))

    query = _scope(query, user_id, role)
    count_query = _scope(count_query, user_id, role)

    offset = (page - 1) * page_size
    query = query.order_by(Word.created_at.desc()).offset(offset).limit(page_size)

    result = await session.execute(query)
    words = list(result.scalars().all())
    await attach_review_readiness(session, words)

    count_result = await session.execute(count_query)
    total = count_result.scalar() or 0

    return words, total


async def suggest_words(
    session: AsyncSession, prefix: str, limit: int = 8, *, user_id: Optional[int] = None, role: Optional[str] = None
) -> list[str]:
    pattern = f"{prefix}%"
    query = (
        select(Word.text)
        .where(Word.text.ilike(pattern))
        .order_by(Word.created_at.desc())
        .limit(limit)
    )
    query = _scope(query, user_id, role)
    result = await session.execute(query)
    return [row[0] for row in result.all()]


async def attach_review_readiness(session: AsyncSession, words: list[Word]) -> None:
    if not words:
        return
    word_ids = [word.id for word in words]
    result = await session.execute(
        select(Definition.word_id, func.count(Definition.id))
        .where(Definition.word_id.in_(word_ids))
        .group_by(Definition.word_id)
    )
    counts = {word_id: count for word_id, count in result.all()}
    for word in words:
        definition_count = counts.get(word.id, 0)
        word.definition_count = definition_count
        word.review_ready = definition_count > 0


async def add_definition(
    session: AsyncSession,
    word_id: int,
    pos: str,
    meaning_en: str,
    meaning_zh: str,
    canvas_image: str | None = None,
    ink_data: str | None = None,
    examples: list[dict] | None = None,
    collocations: list[dict] | None = None,
) -> Definition:
    result = await session.execute(
        select(func.count()).select_from(Definition).where(Definition.word_id == word_id)
    )
    order = result.scalar() or 0
    definition = Definition(
        word_id=word_id,
        pos=pos,
        meaning_en=meaning_en,
        meaning_zh=meaning_zh,
        canvas_image=canvas_image,
        ink_data=ink_data,
        order=order,
    )
    session.add(definition)
    await session.flush()

    for i, ex in enumerate(examples or []):
        session.add(ExampleSentence(
            definition_id=definition.id,
            sentence_en=ex.get("sentence_en", ""),
            sentence_zh=ex.get("sentence_zh", ""),
            source="user",
            order=i,
        ))

    for i, coll in enumerate(collocations or []):
        session.add(Collocation(
            definition_id=definition.id,
            pattern=coll.get("pattern", ""),
            meaning_zh=coll.get("meaning_zh", ""),
            order=i,
        ))

    await session.flush()
    await session.refresh(definition)
    return definition


async def update_definition(
    session: AsyncSession,
    word_id: int,
    definition_id: int,
    values: dict,
) -> Definition | None:
    result = await session.execute(
        select(Definition).where(Definition.id == definition_id, Definition.word_id == word_id)
    )
    definition = result.scalar_one_or_none()
    if definition is None:
        return None

    if "pos" in values:
        definition.pos = values["pos"]
    if "meaning_en" in values:
        definition.meaning_en = values["meaning_en"]
    if "meaning_zh" in values:
        definition.meaning_zh = values["meaning_zh"]
    if "canvas_image" in values:
        definition.canvas_image = values["canvas_image"]
    if "ink_data" in values:
        definition.ink_data = values["ink_data"]

    await session.flush()
    await session.refresh(definition)
    return definition


async def update_word(session: AsyncSession, word_id: int, phonetic: str | None = None) -> Word:
    word = await session.get(Word, word_id)
    if word is None:
        raise ValueError(f"Word {word_id} not found")
    if phonetic is not None:
        word.phonetic = phonetic
    await session.flush()
    await session.refresh(word)
    return word


async def delete_definition(session: AsyncSession, definition_id: int) -> bool:
    defn = await session.get(Definition, definition_id)
    if defn is None:
        return False
    await session.delete(defn)
    return True


async def delete_word(session: AsyncSession, word_id: int) -> bool:
    word = await session.get(Word, word_id)
    if word is None:
        return False
    await session.delete(word)
    return True
