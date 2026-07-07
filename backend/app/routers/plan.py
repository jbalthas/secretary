import os
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import Task, AppSettings
from app.models.calendar import CalendarEvent
from app.models.plan import ScheduledBlock
from app.schemas.plan import (
    ProposedDayPlan,
    ApproveRequest,
    ScheduledBlockRead,
    ScheduledBlockUpdate,
)
from app.scheduler import remove_reminder, upsert_reminder
from app.services import planner_service
from app.services.task_hierarchy import get_valid_parent_task

router = APIRouter(prefix=f"{settings.api_prefix}/plan", tags=["plan"])


async def _fetch_events_for_date(target: date, session: AsyncSession) -> list[CalendarEvent]:
    date_str = target.isoformat()
    day_start = datetime.combine(target, time.min, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    stmt = select(CalendarEvent).where(
        CalendarEvent.cancelled == False,
        or_(
            CalendarEvent.start_date == date_str,
            and_(CalendarEvent.start_dt >= day_start, CalendarEvent.start_dt < day_end),
        ),
    )
    return (await session.execute(stmt)).scalars().all()


def _is_stale(block: ScheduledBlock, events: list[CalendarEvent]) -> str | None:
    for e in events:
        if e.all_day or not e.start_dt or not e.end_dt:
            continue
        if block.start_dt < e.end_dt and e.start_dt < block.end_dt:
            return e.title
    return None


async def _write_blocks(body: ApproveRequest, session: AsyncSession) -> list[ScheduledBlock]:
    date_key = body.date.isoformat()
    now = datetime.now(timezone.utc)
    rows = [
        ScheduledBlock(
            task_id=b.task_id,
            title=b.title,
            start_dt=b.start_dt,
            end_dt=b.end_dt,
            date_key=date_key,
            approved_at=now,
        )
        for b in body.blocks
    ]
    session.add_all(rows)
    await session.commit()
    for r in rows:
        await session.refresh(r)
    return rows


@router.get("/propose", response_model=ProposedDayPlan)
async def propose(
    date_str: str = Query(alias="date"),
    work_start: str | None = Query(default=None, pattern=r"^\d{2}:\d{2}$"),
    work_end: str | None = Query(default=None, pattern=r"^\d{2}:\d{2}$"),
    session: AsyncSession = Depends(get_session),
):
    target_date = date.fromisoformat(date_str)

    tasks = (
        await session.execute(select(Task).where(Task.completed == False))
    ).scalars().all()
    events = await _fetch_events_for_date(target_date, session)

    cfg = await session.get(AppSettings, 1)
    sh = cfg.work_start_hour if cfg and cfg.work_start_hour is not None else 9
    sm = cfg.work_start_minute if cfg and cfg.work_start_minute is not None else 0
    eh = cfg.work_end_hour if cfg and cfg.work_end_hour is not None else 18
    em = cfg.work_end_minute if cfg and cfg.work_end_minute is not None else 0
    try:
        ws = time.fromisoformat(work_start) if work_start else time(sh, sm)
        we = time.fromisoformat(work_end) if work_end else time(eh, em)
    except ValueError as exc:
        raise HTTPException(422, detail="Planning hours must use a valid HH:MM time.") from exc
    if ws >= we:
        raise HTTPException(422, detail="Planning start time must be before end time.")

    local_tz = os.environ.get("TZ", "UTC")

    return planner_service.propose_day_plan(
        tasks=tasks,
        events=events,
        target_date=target_date,
        work_start=ws,
        work_end=we,
        local_tz=local_tz,
    )


@router.post("/approve", response_model=list[ScheduledBlockRead], status_code=201)
async def approve(
    body: ApproveRequest,
    session: AsyncSession = Depends(get_session),
):
    date_key = body.date.isoformat()
    existing = (
        await session.execute(
            select(ScheduledBlock).where(ScheduledBlock.date_key == date_key).limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            409,
            detail=f"A plan for {date_key} already exists. Use /plan/replan to replace it.",
        )
    return await _write_blocks(body, session)


@router.post("/replan", response_model=list[ScheduledBlockRead], status_code=200)
async def replan(
    body: ApproveRequest,
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        delete(ScheduledBlock).where(ScheduledBlock.date_key == body.date.isoformat())
    )
    return await _write_blocks(body, session)


@router.get("/blocks", response_model=list[ScheduledBlockRead])
async def blocks(
    date_str: str = Query(alias="date"),
    session: AsyncSession = Depends(get_session),
):
    target = date.fromisoformat(date_str)
    rows = (
        await session.execute(
            select(ScheduledBlock)
            .where(ScheduledBlock.date_key == date_str)
            .order_by(ScheduledBlock.start_dt)
        )
    ).scalars().all()
    events = await _fetch_events_for_date(target, session)

    result = []
    for b in rows:
        read = ScheduledBlockRead.model_validate(b)
        read.conflict_with = _is_stale(b, events)
        result.append(read)
    return result


@router.delete("/blocks/{block_id}", status_code=204)
async def delete_block(
    block_id: int,
    session: AsyncSession = Depends(get_session),
):
    block = await session.get(ScheduledBlock, block_id)
    if block is None:
        raise HTTPException(404)
    await session.delete(block)
    await session.commit()


@router.patch("/blocks/{block_id}", response_model=ScheduledBlockRead)
async def update_block(
    block_id: int,
    body: ScheduledBlockUpdate,
    session: AsyncSession = Depends(get_session),
):
    block = await session.get(ScheduledBlock, block_id)
    if block is None:
        raise HTTPException(404)

    update_data = body.model_dump(exclude_unset=True)
    task = await session.get(Task, block.task_id) if block.task_id is not None else None

    if "completed" in update_data and update_data["completed"] is not None:
        block.completed = update_data["completed"]
        if task is not None:
            was_completed = task.completed
            task.completed = update_data["completed"]
            if update_data["completed"] and not was_completed:
                task.completed_at = datetime.now(timezone.utc)

    if "parent_task_id" in update_data:
        new_parent_id = update_data["parent_task_id"]
        if new_parent_id is not None:
            await get_valid_parent_task(session, new_parent_id)
        block.parent_task_id = new_parent_id

    await session.commit()
    await session.refresh(block)

    if task is not None:
        if task.completed:
            remove_reminder(task.id)
        else:
            upsert_reminder(task)

    read = ScheduledBlockRead.model_validate(block)
    events = await _fetch_events_for_date(date.fromisoformat(block.date_key), session)
    read.conflict_with = _is_stale(block, events)
    return read
