from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.models import AppSettings
from app.schemas.settings import BriefTimeRead, BriefTimeUpdate, WorkHoursRead, WorkHoursUpdate
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


@router.get("/work-hours", response_model=WorkHoursRead)
async def get_work_hours(session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    sh = cfg.work_start_hour if cfg and cfg.work_start_hour is not None else 9
    sm = cfg.work_start_minute if cfg and cfg.work_start_minute is not None else 0
    eh = cfg.work_end_hour if cfg and cfg.work_end_hour is not None else 18
    em = cfg.work_end_minute if cfg and cfg.work_end_minute is not None else 0
    return WorkHoursRead(work_start=f"{sh:02d}:{sm:02d}", work_end=f"{eh:02d}:{em:02d}")


@router.put("/work-hours", response_model=WorkHoursRead)
async def set_work_hours(body: WorkHoursUpdate, session: AsyncSession = Depends(get_session)):
    sh, sm = map(int, body.work_start.split(":"))
    eh, em = map(int, body.work_end.split(":"))
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, work_start_hour=sh, work_start_minute=sm, work_end_hour=eh, work_end_minute=em)
        session.add(cfg)
    else:
        cfg.work_start_hour = sh
        cfg.work_start_minute = sm
        cfg.work_end_hour = eh
        cfg.work_end_minute = em
    await session.commit()
    return WorkHoursRead(work_start=body.work_start, work_end=body.work_end)
