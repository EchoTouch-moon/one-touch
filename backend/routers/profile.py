from fastapi import APIRouter, Query, Request

from backend.auth import get_current_user
from backend.services import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/activity")
async def get_activity(request: Request, days: int = Query(365, ge=1, le=366)):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        return await profile_service.get_activity(db, days, user_id=user_id, role=role)
