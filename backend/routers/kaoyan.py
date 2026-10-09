import re

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.services import kaoyan_service, word_service

router = APIRouter(prefix="/kaoyan", tags=["kaoyan"])

POS_RE = re.compile(r"^([a-z]{1,4})\.\s")


class CaptureRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=64)


def parse_pos(translation: str) -> str:
    first_line = translation.split("\n", 1)[0].strip()
    match = POS_RE.match(first_line)
    return f"{match.group(1)}." if match else "def."


@router.get("/words")
async def list_kaoyan_words(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        items, total = await kaoyan_service.list_words(
            db, page, page_size, q, status_filter, user_id=user_id
        )
        return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/stats")
async def kaoyan_stats(request: Request):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        return await kaoyan_service.get_stats(db, user_id=user_id)


@router.get("/words/{word}/sentences")
async def word_sentences(word: str, request: Request):
    get_current_user(request)
    index = getattr(request.app.state, "kaoyan_index", None) or {}
    return {"word": word, "sentences": index.get(word.strip().lower(), [])}


@router.get("/words/{word}/lookup")
async def word_lookup(word: str, request: Request):
    get_current_user(request)
    session_maker = request.app.state.session_maker
    index = getattr(request.app.state, "kaoyan_index", None) or {}
    normalized = word.strip().lower()
    async with session_maker() as db:
        entry = await kaoyan_service.get_word(db, normalized)
    if entry is None:
        return {"in_lexicon": False}
    return {
        "in_lexicon": True,
        "word": entry.word,
        "translation": entry.translation,
        "phonetic": entry.phonetic,
        "sentences": index.get(normalized, [])[:3],
    }


@router.post("/capture", status_code=201)
async def capture_kaoyan_word(body: CaptureRequest, request: Request):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    word = body.word.strip().lower()

    async with session_maker() as db:
        kaoyan_entry = await kaoyan_service.get_word(db, word)
        if kaoyan_entry is None:
            raise HTTPException(status_code=404, detail="Word is not in the kaoyan lexicon.")

        existing = await word_service.get_word_by_text(db, word, user_id=user_id)
        if existing is not None:
            return {"word_id": existing.id, "created": False}

        try:
            created = await word_service.create_word(db, word, user_id=user_id)
        except word_service.WordAlreadyExistsError:
            raise HTTPException(status_code=409, detail=f"Word '{word}' already exists")

        index = getattr(request.app.state, "kaoyan_index", None) or {}
        await word_service.add_definition(
            db,
            created.id,
            parse_pos(kaoyan_entry.translation),
            "",
            kaoyan_entry.translation,
            examples=[
                {"sentence_en": item["text"]}
                for item in index.get(word, [])[:3]
            ],
        )
        await db.commit()
        return {"word_id": created.id, "created": True}
