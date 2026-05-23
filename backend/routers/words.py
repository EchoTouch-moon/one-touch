from fastapi import APIRouter, HTTPException, Query, Request

from backend.auth import get_current_user
from backend.schemas.word import (
    DefinitionCreate,
    DefinitionUpdate,
    WordCreate,
    WordDetailResponse,
    WordListResponse,
    WordResponse,
    WordUpdate,
)
from backend.services import word_service

router = APIRouter(prefix="/words", tags=["words"])


def _get_session(request: Request):
    return request.app.state.session_maker


@router.post("", response_model=WordResponse, status_code=201)
async def create_word(body: WordCreate, request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        try:
            word = await word_service.create_word(db, body.text, user_id=user_id)
            await db.commit()
            return word
        except Exception as e:
            await db.rollback()
            if "UNIQUE constraint" in str(e):
                raise HTTPException(status_code=409, detail=f"Word '{body.text}' already exists")
            raise


@router.get("/suggest", response_model=list[str])
async def suggest_words(request: Request, q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        return await word_service.suggest_words(db, q, limit, user_id=user_id, role=role)


@router.get("", response_model=WordListResponse)
async def list_words(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: str | None = None,
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    q: str | None = None,
):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        if q:
            words, total = await word_service.search_words(db, q, page, page_size, user_id=user_id, role=role)
        else:
            words, total = await word_service.list_words(db, page, page_size, status, sort, order, user_id=user_id, role=role)
        return WordListResponse(
            items=words,
            total=total,
            page=page,
            page_size=page_size,
        )


@router.get("/{word_id}", response_model=WordDetailResponse)
async def get_word(word_id: int, request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        word = await word_service.get_word(db, word_id, user_id=user_id, role=role)
        if word is None:
            raise HTTPException(status_code=404, detail="Word not found")
        return word


@router.patch("/{word_id}", response_model=WordResponse)
async def update_word(word_id: int, body: WordUpdate, request: Request):
    session_maker = _get_session(request)
    async with session_maker() as db:
        try:
            word = await word_service.update_word(db, word_id, body.phonetic)
            await db.commit()
            return word
        except ValueError:
            raise HTTPException(status_code=404, detail="Word not found")


@router.post("/{word_id}/definitions", status_code=201)
async def add_definition(word_id: int, body: DefinitionCreate, request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        word = await word_service.get_word(db, word_id, user_id=user_id, role=role)
        if word is None:
            raise HTTPException(status_code=404, detail="Word not found")
        defn = await word_service.add_definition(
            db, word_id, body.pos, body.meaning_en, body.meaning_zh,
            canvas_image=body.canvas_image,
            ink_data=body.ink_data,
            examples=[e.model_dump() for e in body.examples],
            collocations=[c.model_dump() for c in body.collocations],
        )
        await db.commit()
        return {
            "id": defn.id,
            "pos": defn.pos,
            "meaning_en": defn.meaning_en,
            "meaning_zh": defn.meaning_zh,
            "canvas_image": defn.canvas_image,
            "ink_data": defn.ink_data,
        }


@router.patch("/{word_id}/definitions/{def_id}")
async def update_definition(word_id: int, def_id: int, body: DefinitionUpdate, request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        word = await word_service.get_word(db, word_id, user_id=user_id, role=role)
        if word is None:
            raise HTTPException(status_code=404, detail="Word not found")
        defn = await word_service.update_definition(
            db,
            word_id,
            def_id,
            body.model_dump(exclude_unset=True),
        )
        if defn is None:
            raise HTTPException(status_code=404, detail="Definition not found")
        await db.commit()
        return {
            "id": defn.id,
            "pos": defn.pos,
            "meaning_en": defn.meaning_en,
            "meaning_zh": defn.meaning_zh,
            "canvas_image": defn.canvas_image,
            "ink_data": defn.ink_data,
        }


@router.delete("/{word_id}/definitions/{def_id}", status_code=204)
async def delete_definition(word_id: int, def_id: int, request: Request):
    session_maker = _get_session(request)
    async with session_maker() as db:
        deleted = await word_service.delete_definition(db, def_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Definition not found")
        await db.commit()


@router.delete("/{word_id}", status_code=204)
async def delete_word(word_id: int, request: Request):
    session_maker = _get_session(request)
    async with session_maker() as db:
        deleted = await word_service.delete_word(db, word_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Word not found")
        await db.commit()
