from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.models import AppSettings
from app.schemas.settings import BriefTimeRead, BriefTimeUpdate, WorkHoursRead, WorkHoursUpdate, StallThresholdRead, StallThresholdUpdate, CheckInTimeRead, CheckInTimeUpdate
from app.config import settings
from app.scheduler import schedule_daily_brief, schedule_checkin

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


@router.get("/stall-threshold", response_model=StallThresholdRead)
async def get_stall_threshold(session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    days = cfg.stall_threshold_days if cfg and cfg.stall_threshold_days is not None else 7
    return StallThresholdRead(stall_threshold_days=days)


@router.put("/stall-threshold", response_model=StallThresholdRead)
async def set_stall_threshold(body: StallThresholdUpdate, session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, stall_threshold_days=body.stall_threshold_days)
        session.add(cfg)
    else:
        cfg.stall_threshold_days = body.stall_threshold_days
    await session.commit()
    return StallThresholdRead(stall_threshold_days=body.stall_threshold_days)


@router.get("/check-in-time", response_model=CheckInTimeRead)
async def get_check_in_time(session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    h = cfg.check_in_hour if cfg and cfg.check_in_hour is not None else 12
    m = cfg.check_in_minute if cfg and cfg.check_in_minute is not None else 0
    return CheckInTimeRead(hour=h, minute=m)


@router.put("/check-in-time", response_model=CheckInTimeRead)
async def set_check_in_time(body: CheckInTimeUpdate, session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, check_in_hour=body.hour, check_in_minute=body.minute)
        session.add(cfg)
    else:
        cfg.check_in_hour = body.hour
        cfg.check_in_minute = body.minute
    await session.commit()
    schedule_checkin(body.hour, body.minute)
    return CheckInTimeRead(hour=body.hour, minute=body.minute)
