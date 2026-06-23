import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from app.config import settings
from app.services.pushover import PushoverClient
from app.services.tts import TTSClient
import app.services.tts_settings as _tts_settings

_sync_url = settings.database_url.replace("+aiosqlite", "")

scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(url=_sync_url)},
    timezone="UTC",
)


def _pushover_priority(priority) -> int:
    return 1 if priority is not None and priority.value == "high" else 0


def _send_reminder(title: str, body: str, priority: int) -> None:
    PushoverClient().send(title=title, message=body, priority=priority)
    try:
        if _tts_settings.get_tts_enabled():
            spoken = f"Reminder: {title}"
            if body:
                spoken += f". {body}"
            TTSClient().speak(spoken)
    except Exception:
        logging.getLogger(__name__).exception("TTS reminder failed")


def upsert_reminder(task) -> None:
    if task.reminder_at is None:
        remove_reminder(task.id)
        return
    scheduler.add_job(
        _send_reminder,
        "date",
        run_date=task.reminder_at,
        id=f"reminder_task_{task.id}",
        replace_existing=True,
        misfire_grace_time=3600,
        kwargs={
            "title": task.title,
            "body": task.description or "",
            "priority": _pushover_priority(task.priority),
        },
    )


def remove_reminder(task_id: int) -> None:
    try:
        scheduler.remove_job(f"reminder_task_{task_id}")
    except Exception:
        pass


def schedule_daily_brief(hour: int, minute: int) -> None:
    from apscheduler.triggers.cron import CronTrigger
    from app.services.brief import send_daily_brief
    scheduler.add_job(
        send_daily_brief,
        CronTrigger(hour=hour, minute=minute, timezone=settings.timezone),
        id="daily_brief",
        replace_existing=True,
        misfire_grace_time=None,
    )


def schedule_routine(routine) -> None:
    from apscheduler.triggers.cron import CronTrigger
    from app.services.brief import send_daily_brief
    trigger = CronTrigger.from_crontab(routine.cron, timezone=settings.timezone)
    scheduler.add_job(
        send_daily_brief,
        trigger,
        id=f"routine_{routine.id}",
        replace_existing=True,
        misfire_grace_time=None,
    )


def remove_routine(routine_id: int) -> None:
    try:
        scheduler.remove_job(f"routine_{routine_id}")
    except Exception:
        pass


def schedule_stall_check(hour: int = 8, minute: int = 5) -> None:
    from apscheduler.triggers.cron import CronTrigger
    from app.services.guidance_service import send_stall_nudge
    scheduler.add_job(
        send_stall_nudge,
        CronTrigger(hour=hour, minute=minute, timezone=settings.timezone),
        id="stall_check",
        replace_existing=True,
        misfire_grace_time=None,
    )


def remove_checkin() -> None:
    try:
        scheduler.remove_job("mid_day_checkin")
    except Exception:
        pass


def schedule_checkin(hour: int, minute: int) -> None:
    from apscheduler.triggers.cron import CronTrigger
    from app.services.checkin_service import send_checkin_notification
    scheduler.add_job(
        send_checkin_notification,
        CronTrigger(hour=hour, minute=minute, timezone=settings.timezone),
        id="mid_day_checkin",
        replace_existing=True,
        misfire_grace_time=None,
    )


def schedule_calendar_sync() -> None:
    from apscheduler.triggers.interval import IntervalTrigger
    from app.services.sync import sync_calendar
    scheduler.add_job(
        sync_calendar,
        IntervalTrigger(minutes=5),
        id="calendar_sync",
        replace_existing=True,
        misfire_grace_time=300,
    )


def schedule_outlook_ics_sync() -> None:
    from apscheduler.triggers.interval import IntervalTrigger
    from app.services.sync import sync_outlook_ics
    scheduler.add_job(
        sync_outlook_ics,
        IntervalTrigger(minutes=5),
        id="outlook_ics_sync",
        replace_existing=True,
        misfire_grace_time=300,
    )
