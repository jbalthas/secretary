from datetime import date, datetime, time, timezone, timedelta
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


@router.get("/range", response_model=list[CalendarEventOut])
async def events_range(
    start: str | None = None,
    days: int = 7,
    session: AsyncSession = Depends(get_session),
):
    if start is None:
        start_date = datetime.now(timezone.utc).date()
    else:
        try:
            start_date = date.fromisoformat(start)
        except ValueError:
            raise HTTPException(422, "start must be YYYY-MM-DD")

    days = max(1, min(days, 31))

    win_start = start_date - timedelta(days=1)
    win_end = start_date + timedelta(days=days + 1)

    lo = datetime.combine(win_start, time.min, tzinfo=timezone.utc)
    hi = datetime.combine(win_end, time.min, tzinfo=timezone.utc)

    stmt = select(CalendarEvent).where(
        CalendarEvent.cancelled == False,
        or_(
            and_(
                CalendarEvent.start_date >= win_start.isoformat(),
                CalendarEvent.start_date < win_end.isoformat(),
            ),
            and_(
                CalendarEvent.start_dt >= lo,
                CalendarEvent.start_dt < hi,
            ),
        ),
    )
    result = await session.execute(stmt)
    return result.scalars().all()


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
