from fastapi import APIRouter, HTTPException, Request

from backend.auth import get_current_user
from backend.schemas.review import ReviewStatsResponse, ReviewSubmit
from backend.services import review_service

router = APIRouter(prefix="/review", tags=["review"])


def _get_session(request: Request):
    return request.app.state.session_maker


def _serialize_word(w):
    rr = w.review_record
    defs = [
        {"pos": d.pos, "meaning_zh": d.meaning_zh, "canvas_image": d.canvas_image, "ink_data": d.ink_data}
        for d in w.definitions
    ]
    return {
        "word_id": w.id,
        "text": w.text,
        "phonetic": w.phonetic,
        "definitions": defs,
        "ease_factor": rr.ease_factor if rr else 2.5,
        "interval_days": rr.interval_days if rr else 0,
        "repetitions": rr.repetitions if rr else 0,
        "next_review": rr.next_review.isoformat() if rr and rr.next_review else None,
    }


@router.get("/due")
async def get_due_words(request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        words = await review_service.get_due_words(db, user_id=user_id, role=role)
        items = [_serialize_word(w) for w in words]
        return {"items": items, "total": len(items)}


@router.get("/session")
async def get_review_session(request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        words = await review_service.get_due_words(db, user_id=user_id, role=role)
        stats = await review_service.get_review_stats(db, user_id=user_id, role=role)
        items = [_serialize_word(w) for w in words]
        return {"items": items, "total": len(items), "stats": stats}


@router.get("/stats", response_model=ReviewStatsResponse)
async def get_review_stats(request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        return await review_service.get_review_stats(db, user_id=user_id, role=role)


@router.post("/submit")
async def submit_review(body: ReviewSubmit, request: Request):
    user_id, role = get_current_user(request)
    session_maker = _get_session(request)
    async with session_maker() as db:
        try:
            record = await review_service.submit_review(db, body.word_id, body.quality, user_id=user_id, role=role)
        except ValueError:
            raise HTTPException(status_code=404, detail="Word not found")
        await db.commit()
        return {
            "word_id": record.word_id,
            "ease_factor": record.ease_factor,
            "interval_days": record.interval_days,
            "repetitions": record.repetitions,
            "next_review": record.next_review.isoformat(),
        }
