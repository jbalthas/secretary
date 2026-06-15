from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from app.db import get_session
from app.models.calendar import CalendarEvent
from app.schemas.event import CalendarEventOut
from app.config import settings

router = APIRouter(prefix=f"{settings.api_prefix}/events", tags=["events"])


class EventDoneUpdate(BaseModel):
    done: bool


@router.get("/today", response_model=list[CalendarEventOut])
async def events_today(session: AsyncSession = Depends(get_session)):
    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)

    stmt = select(CalendarEvent).where(
        CalendarEvent.cancelled == False,
        or_(
            CalendarEvent.start_date == today_str,
            and_(
                CalendarEvent.start_dt >= today_start,
                CalendarEvent.start_dt < tomorrow_start,
            ),
        ),
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.patch("/{google_id}", response_model=CalendarEventOut)
async def update_event_done(
    google_id: str,
    body: EventDoneUpdate,
    session: AsyncSession = Depends(get_session),
):
    event = await session.get(CalendarEvent, google_id)
    if not event:
        raise HTTPException(404)
    event.done = body.done
    await session.commit()
    await session.refresh(event)
    return event
