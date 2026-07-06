from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.config import settings
from app.models import AppSettings
from app.schemas.advisory import (
    AdvisoryPayload,
    AdvisoryPreviewResult,
    AdvisoryResult,
    AdvisoryConfirmRequest,
)
from app.services import advisory_service

router = APIRouter(prefix=f"{settings.api_prefix}/advisory", tags=["advisory"])


@router.get("/schema")
async def get_schema():
    return AdvisoryPayload.model_json_schema()


@router.post("/preview", response_model=AdvisoryPreviewResult)
async def preview(payload: AdvisoryPayload, session: AsyncSession = Depends(get_session)):
    try:
        return await advisory_service.dry_run_advisory(payload, session)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/confirm", response_model=AdvisoryResult)
async def confirm(req: AdvisoryConfirmRequest, session: AsyncSession = Depends(get_session)):
    try:
        return await advisory_service.apply_advisory(req, session)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/last-sync")
async def last_sync(session: AsyncSession = Depends(get_session)):
    row = (await session.execute(select(AppSettings).limit(1))).scalar_one_or_none()
    ts = row.last_advisory_at if row else None
    return {"last_advisory_at": ts.isoformat() if ts else None}
