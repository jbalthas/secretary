from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_session
from app.models import Routine
from app.schemas.routine import RoutineCreate, RoutineUpdate, RoutineRead
from app.config import settings
from app.scheduler import schedule_routine, remove_routine

router = APIRouter(prefix=f"{settings.api_prefix}/routines", tags=["routines"])


@router.get("/", response_model=list[RoutineRead])
async def list_routines(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Routine).order_by(Routine.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=RoutineRead, status_code=201)
async def create_routine(body: RoutineCreate, session: AsyncSession = Depends(get_session)):
    routine = Routine(**body.model_dump())
    session.add(routine)
    await session.commit()
    await session.refresh(routine)
    schedule_routine(routine)
    return routine


@router.patch("/{routine_id}", response_model=RoutineRead)
async def update_routine(routine_id: int, body: RoutineUpdate, session: AsyncSession = Depends(get_session)):
    routine = await session.get(Routine, routine_id)
    if not routine:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(routine, k, v)
    await session.commit()
    await session.refresh(routine)
    schedule_routine(routine)
    return routine


@router.delete("/{routine_id}", status_code=204)
async def delete_routine(routine_id: int, session: AsyncSession = Depends(get_session)):
    routine = await session.get(Routine, routine_id)
    if not routine:
        raise HTTPException(404)
    remove_routine(routine.id)
    await session.delete(routine)
    await session.commit()
