from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Task
from app.models.goal import Milestone


async def compute_progress(goal_id: int, session: AsyncSession) -> dict:
    task_result = await session.execute(
        select(
            func.count(Task.id).label("total"),
            func.sum(case((Task.completed == True, 1), else_=0)).label("done"),
        ).where(Task.goal_id == goal_id)
    )
    task_row = task_result.one()
    total_tasks = task_row.total or 0
    done_tasks = task_row.done or 0

    ms_result = await session.execute(
        select(
            func.count(Milestone.id).label("total"),
            func.sum(case((Milestone.done == True, 1), else_=0)).label("done"),
        ).where(Milestone.goal_id == goal_id)
    )
    ms_row = ms_result.one()
    total_ms = ms_row.total or 0
    done_ms = ms_row.done or 0

    total = total_tasks + total_ms
    done = done_tasks + done_ms
    pct = round(done / total * 100) if total > 0 else 0
    return {"total": total, "done": done, "pct": pct}
