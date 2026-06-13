from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

from app.db import get_session
from app.models.calendar import CalendarSync, CalendarEvent
from app.config import settings

router = APIRouter(prefix=f"{settings.api_prefix}/calendar", tags=["calendar"])


@router.get("/status")
async def calendar_status(session: AsyncSession = Depends(get_session)):
    row = await session.get(CalendarSync, 1)
    return {
        "connected": bool(row and row.credentials_json),
        "last_synced_at": row.last_synced_at if row else None,
    }


@router.post("/disconnect")
async def disconnect(session: AsyncSession = Depends(get_session)):
    row = await session.get(CalendarSync, 1)
    if row is not None:
        row.credentials_json = None
        row.sync_token = None
    await session.execute(delete(CalendarEvent))
    await session.commit()
    return {"connected": False}
