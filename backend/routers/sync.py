from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from backend.auth import get_current_user
from backend.schemas.sync import ImportRequest
from backend.services import sync_service

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/export")
async def export_data(request: Request):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        config = request.app.state.config
        result = await sync_service.export_all(
            db,
            user_id=user_id,
            role=role,
            app_version=config.ops.app_version,
            review_algorithm=config.review.algorithm,
        )
        return JSONResponse(content=result)


@router.post("/import")
async def import_data(body: ImportRequest, request: Request, dry_run: bool = Query(False)):
    user_id, role = get_current_user(request)
    session_maker = request.app.state.session_maker
    async with session_maker() as db:
        result = await sync_service.import_data(
            db,
            body.data.model_dump(mode="json"),
            body.mode,
            user_id=user_id,
            role=role,
            dry_run=dry_run,
        )
        if dry_run:
            await db.rollback()
        else:
            await db.commit()
        return result
