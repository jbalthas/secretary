from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task


async def get_valid_parent_task(session: AsyncSession, parent_task_id: int) -> Task:
    """Fetch and validate a candidate parent task.

    One-level nesting only (D-01): the parent must exist and must not itself
    already be nested under another task.
    """
    parent = await session.get(Task, parent_task_id)
    if parent is None:
        raise HTTPException(404, detail="Parent task not found")
    if parent.parent_task_id is not None:
        raise HTTPException(
            422, detail="Cannot nest under a task that is itself a subtask (one level only)"
        )
    return parent


async def assert_task_has_no_children(session: AsyncSession, task_id: int) -> None:
    """Reject nesting a task that already has its own children (D-01: no grandchildren)."""
    has_children = (
        await session.execute(select(Task.id).where(Task.parent_task_id == task_id).limit(1))
    ).first()
    if has_children:
        raise HTTPException(
            422, detail="Cannot nest a task that already has subtasks (one level only)"
        )
