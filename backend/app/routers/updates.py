from datetime import date

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


@router.post("/resolve", response_model=UpdateResponse)
async def resolve(body: UpdateRequest, session: AsyncSession = Depends(get_session)):
    today_key = date.today().isoformat()
    blocks = (await session.execute(
        select(ScheduledBlock).where(ScheduledBlock.date_key == today_key)
    )).scalars().all()
    tasks = (await session.execute(
        select(Task).where(Task.completed == False)  # noqa: E712
    )).scalars().all()
    return resolution_service.resolve_update(body.text, blocks, tasks)
