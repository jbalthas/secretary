from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db import get_session
from app.models import Task
from app.schemas.task import TaskCreate, TaskUpdate, TaskRead
from app.config import settings
from app.scheduler import upsert_reminder, remove_reminder

router = APIRouter(prefix=f"{settings.api_prefix}/tasks", tags=["tasks"])


@router.get("/", response_model=list[TaskRead])
async def list_tasks(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Task).order_by(Task.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=TaskRead, status_code=201)
async def create_task(body: TaskCreate, session: AsyncSession = Depends(get_session)):
    task = Task(**body.model_dump())
    session.add(task)
    await session.commit()
    await session.refresh(task)
    upsert_reminder(task)
    return task


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(task_id: int, body: TaskUpdate, session: AsyncSession = Depends(get_session)):
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
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
