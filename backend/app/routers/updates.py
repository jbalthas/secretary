from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import Task
from app.models.plan import ScheduledBlock
from app.schemas.update import UpdateRequest, UpdateResponse
from app.services import resolution_service

router = APIRouter(prefix=f"{settings.api_prefix}/updates", tags=["updates"])


async def _apply_action(session: AsyncSession, entity_type: str, entity_id: int, action: str) -> None:
    if entity_type == "task":
        row = await session.get(Task, entity_id)
    else:
        row = await session.get(ScheduledBlock, entity_id)
    if row is None:
        return
    if action in ("done", "drop"):
        # Phase 12-04: drop reuses completed=True (no separate flag)
        if not row.completed:
            row.completed = True
            if hasattr(row, "completed_at"):
                row.completed_at = datetime.now(timezone.utc)
    elif action == "reschedule":
        # v2.1 behavior: reschedule == carry forward to tomorrow
        tomorrow = datetime.now(timezone.utc) + timedelta(days=1)
        if hasattr(row, "start_dt") and row.start_dt is not None:
            delta = row.end_dt - row.start_dt
            row.start_dt = tomorrow
            row.end_dt = tomorrow + delta
        elif hasattr(row, "due_date"):
            row.due_date = tomorrow


@router.post("/resolve", response_model=UpdateResponse)
async def resolve(body: UpdateRequest, session: AsyncSession = Depends(get_session)):
    # Confirmed-id path: bypass fuzzy match, apply directly by entity id
    if body.confirmed_id is not None:
        action = body.confirmed_action or "done"
        await _apply_action(session, body.confirmed_type or "task", body.confirmed_id, action)
        await session.commit()
        return UpdateResponse(
            status="resolved",
            action=action,
            entity_type=body.confirmed_type,
            entity_id=body.confirmed_id,
        )

    today_key = date.today().isoformat()
    blocks = (await session.execute(
        select(ScheduledBlock).where(ScheduledBlock.date_key == today_key)
    )).scalars().all()
    tasks = (await session.execute(
        select(Task).where(Task.completed == False)  # noqa: E712
    )).scalars().all()
    result = resolution_service.resolve_update(body.text, blocks, tasks)

    if result["status"] == "resolved":
        await _apply_action(session, result["entity_type"], result["entity_id"], result["action"])
        await session.commit()

    return result
