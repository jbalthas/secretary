from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, union, or_, and_

from app.db import get_session
from app.models import Task
from app.models.goal import Goal
from app.schemas.task import TaskCreate, TaskUpdate, TaskRead
from app.schemas.task_list import TaskListGroupRead
from app.config import settings
from app.scheduler import upsert_reminder, remove_reminder

router = APIRouter(prefix=f"{settings.api_prefix}/tasks", tags=["tasks"])


@router.get("/lists", response_model=list[str])
async def list_task_lists(session: AsyncSession = Depends(get_session)):
    linked_goal_ids = select(Task.goal_id).where(Task.goal_id.isnot(None))
    combined = union(
        select(Task.list_name.label("list_name")).where(Task.list_name.isnot(None)),
        select(Task.parent_list_name.label("list_name")).where(Task.parent_list_name.isnot(None)),
        select(Goal.list_name.label("list_name")).where(
            Goal.list_name.isnot(None), Goal.id.in_(linked_goal_ids)
        ),
        select(Goal.parent_list_name.label("list_name")).where(
            Goal.parent_list_name.isnot(None), Goal.id.in_(linked_goal_ids)
        ),
    ).subquery()
    result = await session.execute(
        select(combined.c.list_name).order_by(combined.c.list_name)
    )
    return list(result.scalars().all())


@router.get("/list-hierarchy", response_model=list[TaskListGroupRead])
async def list_task_hierarchy(session: AsyncSession = Depends(get_session)):
    task_rows = await session.execute(
        select(Task.parent_list_name, Task.list_name).where(
            or_(Task.parent_list_name.isnot(None), Task.list_name.isnot(None))
        )
    )
    goal_rows = await session.execute(
        select(Goal.parent_list_name, Goal.list_name).where(
            or_(Goal.parent_list_name.isnot(None), Goal.list_name.isnot(None))
        )
    )

    groups: dict[str, tuple[str, dict[str, str]]] = {}
    for parent_name, list_name in [*task_rows.all(), *goal_rows.all()]:
        parent = (parent_name or list_name or "").strip()
        child = (list_name or "").strip()
        if not parent:
            continue
        parent_key = parent.casefold()
        display_name, children = groups.setdefault(parent_key, (parent, {}))
        if parent_name and child and child.casefold() != parent_key:
            children.setdefault(child.casefold(), child)

    return [
        TaskListGroupRead(
            name=display_name,
            children=sorted(children.values(), key=str.casefold),
        )
        for display_name, children in sorted(groups.values(), key=lambda item: item[0].casefold())
    ]


@router.get("/", response_model=list[TaskRead])
async def list_tasks(
    list_name: str | None = None,
    parent_list_name: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Task).order_by(Task.created_at.desc())
    if list_name or parent_list_name:
        stmt = stmt.join(Goal, Task.goal_id == Goal.id, isouter=True)
    if list_name and parent_list_name:
        stmt = stmt.where(
            or_(
                and_(
                    Task.parent_list_name == parent_list_name,
                    Task.list_name == list_name,
                ),
                and_(
                    Goal.parent_list_name == parent_list_name,
                    Goal.list_name == list_name,
                ),
            )
        )
    elif list_name:
        stmt = stmt.where(or_(Task.list_name == list_name, Goal.list_name == list_name))
    elif parent_list_name:
        stmt = stmt.where(
            or_(
                Task.parent_list_name == parent_list_name,
                Goal.parent_list_name == parent_list_name,
                and_(Task.parent_list_name.is_(None), Task.list_name == parent_list_name),
                and_(Goal.parent_list_name.is_(None), Goal.list_name == parent_list_name),
            )
        )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=TaskRead, status_code=201)
async def create_task(body: TaskCreate, session: AsyncSession = Depends(get_session)):
    task = Task(**body.model_dump())
    session.add(task)
    await session.commit()
    await session.refresh(task)
    upsert_reminder(task)
    return task


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: int, session: AsyncSession = Depends(get_session)):
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(404)
    return task


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(task_id: int, body: TaskUpdate, session: AsyncSession = Depends(get_session)):
    from datetime import datetime, timezone
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(404)
    was_completed = task.completed
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    if task.completed and not was_completed:
        task.completed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(task)
    if task.completed:
        remove_reminder(task.id)
    else:
        upsert_reminder(task)
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: int, session: AsyncSession = Depends(get_session)):
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(404)
    await session.delete(task)
    await session.commit()
    remove_reminder(task_id)
