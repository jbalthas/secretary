from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from app.db import get_session
from app.config import settings
from app.models.goal import Goal, Milestone, GoalStatus
from app.schemas.goal import (
    GoalCreate,
    GoalUpdate,
    GoalRead,
    MilestoneCreate,
    MilestoneUpdate,
    MilestoneRead,
)
from app.services import goal_service, celebrate

router = APIRouter(prefix=f"{settings.api_prefix}/goals", tags=["goals"])


async def _to_read(goal: Goal, session: AsyncSession) -> GoalRead:
    progress = await goal_service.compute_progress(goal.id, session)
    return GoalRead.model_validate(
        {
            "id": goal.id,
            "title": goal.title,
            "type": goal.type,
            "description": goal.description,
            "target_date": goal.target_date,
            "status": goal.status,
            "external_key": goal.external_key,
            "list_name": goal.list_name,
            "parent_list_name": goal.parent_list_name,
            "created_at": goal.created_at,
            "updated_at": goal.updated_at,
            "progress_pct": progress["pct"],
            "milestones": goal.milestones,
        }
    )


@router.get("/", response_model=list[GoalRead])
async def list_goals(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Goal).options(selectinload(Goal.milestones)).order_by(Goal.created_at.desc())
    )
    goals = result.scalars().all()
    return [await _to_read(g, session) for g in goals]


@router.post("/", response_model=GoalRead, status_code=201)
async def create_goal(body: GoalCreate, session: AsyncSession = Depends(get_session)):
    goal = Goal(**body.model_dump())
    session.add(goal)
    await session.commit()
    await session.refresh(goal, ["milestones"])
    return await _to_read(goal, session)


@router.get("/{goal_id}", response_model=GoalRead)
async def get_goal(goal_id: int, session: AsyncSession = Depends(get_session)):
    goal = await session.get(Goal, goal_id, options=[selectinload(Goal.milestones)])
    if not goal:
        raise HTTPException(404)
    return await _to_read(goal, session)


@router.patch("/{goal_id}", response_model=GoalRead)
async def update_goal(
    goal_id: int, body: GoalUpdate, session: AsyncSession = Depends(get_session)
):
    goal = await session.get(Goal, goal_id, options=[selectinload(Goal.milestones)])
    if not goal:
        raise HTTPException(404)
    old_status = goal.status
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(goal, k, v)
    await session.commit()
    await session.refresh(goal, ["milestones"])
    if old_status != GoalStatus.completed and goal.status == GoalStatus.completed:
        await run_in_threadpool(celebrate.fire_goal_celebration, goal.title)
    return await _to_read(goal, session)


@router.post("/{goal_id}/milestones", response_model=MilestoneRead, status_code=201)
async def add_milestone(
    goal_id: int, body: MilestoneCreate, session: AsyncSession = Depends(get_session)
):
    goal = await session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404)
    ms = Milestone(goal_id=goal_id, **body.model_dump())
    session.add(ms)
    await session.commit()
    await session.refresh(ms)
    return ms


@router.patch("/{goal_id}/milestones/{ms_id}", response_model=MilestoneRead)
async def update_milestone(
    goal_id: int,
    ms_id: int,
    body: MilestoneUpdate,
    session: AsyncSession = Depends(get_session),
):
    goal = await session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404)
    ms = await session.get(Milestone, ms_id)
    if not ms or ms.goal_id != goal_id:
        raise HTTPException(404)
    old_done = ms.done
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(ms, k, v)
    await session.commit()
    await session.refresh(ms)
    if not old_done and ms.done:
        await run_in_threadpool(celebrate.fire_milestone_celebration, ms.title, goal.title)
    return ms
