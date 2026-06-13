from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from app.config import settings

_sync_url = settings.database_url.replace("+aiosqlite", "")

scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(url=_sync_url)},
    timezone="UTC",
)


def _pushover_priority(priority) -> int:
    return 1 if priority is not None and priority.value == "high" else 0


def _send_reminder(title: str, body: str, priority: int) -> None:
    from app.services.pushover import PushoverClient
    PushoverClient().send(title=title, message=body, priority=priority)


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
