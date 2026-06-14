from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.models import AppSettings
from app.schemas.settings import BriefTimeRead, BriefTimeUpdate
from app.config import settings
from app.scheduler import schedule_daily_brief

router = APIRouter(prefix=f"{settings.api_prefix}/settings", tags=["settings"])


@router.get("/brief-time", response_model=BriefTimeRead)
async def get_brief_time(session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        return BriefTimeRead(hour=8, minute=0)
    return BriefTimeRead(hour=cfg.brief_hour, minute=cfg.brief_minute)


@router.put("/brief-time", response_model=BriefTimeRead)
async def set_brief_time(body: BriefTimeUpdate, session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, brief_hour=body.hour, brief_minute=body.minute)
        session.add(cfg)
    else:
        cfg.brief_hour = body.hour
        cfg.brief_minute = body.minute
    await session.commit()
    schedule_daily_brief(body.hour, body.minute)
    return BriefTimeRead(hour=body.hour, minute=body.minute)
