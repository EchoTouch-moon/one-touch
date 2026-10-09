from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from sqlalchemy import case, delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.kaoyan import ExamSentence, KaoyanWord
from backend.models.word import Word


async def seed_if_empty(session: AsyncSession, data_dir: Path) -> tuple[int, int]:
    """Import kaoyan lexicon on first run; re-import sentences every start."""
    word_count = (await session.execute(select(func.count()).select_from(KaoyanWord))).scalar() or 0

    words_path = data_dir / "kaoyan_words.json"
    sentences_path = data_dir / "exam_sentences.json"

    # Validate both complete payloads before mutating the database.
    for path in (words_path, sentences_path):
        if not path.is_file():
            raise RuntimeError(f"Required kaoyan data file is missing: {path}")
    entries = json.loads(words_path.read_text(encoding="utf-8"))
    sentences = json.loads(sentences_path.read_text(encoding="utf-8"))
    if not isinstance(entries, list) or not entries or not isinstance(sentences, list) or not sentences:
        raise ValueError("Kaoyan data files must contain non-empty arrays")
    for entry in entries:
        if not isinstance(entry.get("word"), str) or not entry["word"].strip() or not isinstance(entry.get("translation"), str):
            raise ValueError(f"Invalid lexicon entry in {words_path}")
        int(entry.get("frq") or 0)
        int(entry.get("bnc") or 0)
    for item in sentences:
        int(item["year"])
        if not isinstance(item.get("text"), str) or not isinstance(item.get("words"), list) or not all(isinstance(w, str) for w in item["words"]):
            raise ValueError(f"Invalid sentence in {sentences_path}")

    if word_count == 0:
        for entry in entries:
            session.add(KaoyanWord(
                word=entry["word"],
                translation=entry["translation"],
                phonetic=entry.get("phonetic", ""),
                frq=int(entry.get("frq") or 0),
                bnc=int(entry.get("bnc") or 0),
            ))
        word_count = len(entries)

    sentence_count = 0
    if sentences_path.exists():
        await session.execute(sa_delete(ExamSentence))
        for item in sentences:
            session.add(ExamSentence(
                year=int(item["year"]),
                exam_type=item.get("paper", "英语一"),
                text=item["text"],
                words_json=json.dumps(item["words"], ensure_ascii=False),
            ))
        sentence_count = len(sentences)

    await session.flush()
    return word_count, sentence_count


async def get_word(session: AsyncSession, word: str) -> Optional[KaoyanWord]:
    result = await session.execute(
        select(KaoyanWord).where(KaoyanWord.word == word.strip().lower())
    )
    return result.scalar_one_or_none()


async def list_words(
    session: AsyncSession,
    page: int = 1,
    page_size: int = 50,
    q: Optional[str] = None,
    status: Optional[str] = None,
    *,
    user_id: Optional[int] = None,
) -> tuple[list[dict], int]:
    query = select(KaoyanWord, Word.id).outerjoin(
        Word, (Word.text == KaoyanWord.word) & (Word.user_id == user_id)
    )

    if q:
        pattern = f"{q.strip().lower()}%"
        query = query.where(KaoyanWord.word.like(pattern))
    if status == "captured":
        query = query.where(Word.id.isnot(None))
    elif status == "uncaptured":
        query = query.where(Word.id.is_(None))

    count_query = select(func.count()).select_from(query.subquery())

    query = query.order_by(
        case((KaoyanWord.frq > 0, 0), else_=1),
        KaoyanWord.frq,
        KaoyanWord.word,
    ).offset((page - 1) * page_size).limit(page_size)

    rows = (await session.execute(query)).all()
    total = (await session.execute(count_query)).scalar() or 0
    return [
        {
            "word": kw.word,
            "translation": kw.translation,
            "phonetic": kw.phonetic,
            "frq": kw.frq,
            "captured": word_id is not None,
        }
        for kw, word_id in rows
    ], total


async def get_stats(session: AsyncSession, *, user_id: Optional[int]) -> dict:
    total = (await session.execute(select(func.count()).select_from(KaoyanWord))).scalar() or 0
    captured = 0
    if total > 0 and user_id is not None:
        captured = (
            await session.execute(
                select(func.count()).select_from(KaoyanWord).join(
                    Word, (Word.text == KaoyanWord.word) & (Word.user_id == user_id)
                )
            )
        ).scalar() or 0
    return {"total": total, "captured": captured, "remaining": max(0, total - captured)}


def build_inverted_index(sentences: list[ExamSentence]) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for sentence in sentences:
        try:
            words = json.loads(sentence.words_json)
        except json.JSONDecodeError:
            continue
        entry = {
            "id": sentence.id,
            "year": sentence.year,
            "paper": sentence.exam_type,
            "text": sentence.text,
        }
        for word in words:
            index.setdefault(word, []).append(entry)
    for entries in index.values():
        entries.sort(key=lambda item: (item["year"], item["id"]))
    return index
