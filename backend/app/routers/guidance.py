from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from app.db import get_session
from app.models import Task
from app.schemas.task import TaskRead
from app.config import settings

router = APIRouter(prefix=f"{settings.api_prefix}/guidance", tags=["guidance"])

PRIORITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}


def _score_task(task, today) -> float:
    pw = PRIORITY_WEIGHT.get(task.priority.value, 1)
    if task.goal is not None and task.goal.target_date is not None:
        gu = 1.0 / max((task.goal.target_date - today).days, 1)
    else:
        gu = 0.5
    if task.due_date is not None:
        dp = 1.0 / max((task.due_date.date() - today).days, 1)
    else:
        dp = 0.5
    return pw * gu * dp


@router.get("/next-best-task", response_model=TaskRead | None)
async def next_best_task(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(Task).where(Task.completed == False, Task.is_habit == False)
    )).scalars().all()
    if not rows:
        return None
    today = datetime.now(timezone.utc).date()
    return max(rows, key=lambda t: _score_task(t, today))
