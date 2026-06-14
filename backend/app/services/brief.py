from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, select, or_, and_
from sqlalchemy.orm import sessionmaker
from app.config import settings as app_settings
from app.services.pushover import PushoverClient

_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)


def build_brief_body() -> str:
    from app.models import Task
    from app.models.calendar import CalendarEvent

    now = datetime.now()  # local time, matching how SQLite stores naive datetimes
    today_str = now.date().isoformat()
    today_start_naive = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start_naive = today_start_naive + timedelta(days=1)

    with _Session() as s:
        tasks = s.execute(
            select(Task).where(
                Task.completed == False,
                Task.due_date.isnot(None),
                Task.due_date >= today_start_naive,
                Task.due_date < tomorrow_start_naive,
            )
        ).scalars().all()
        events = s.execute(
            select(CalendarEvent).where(
                CalendarEvent.cancelled == False,
                or_(
                    CalendarEvent.start_date == today_str,
                    and_(
                        CalendarEvent.start_dt >= today_start_naive,
                        CalendarEvent.start_dt < tomorrow_start_naive,
                    ),
                ),
            )
        ).scalars().all()

    timed = []
    untimed = []

    for t in tasks:
        if t.due_date.hour == 0 and t.due_date.minute == 0:
            untimed.append(f"• {t.title}")
        else:
            timed.append((t.due_date.strftime("%H:%M"), t.title))

    for e in events:
        if e.all_day or e.start_dt is None:
            untimed.append(f"• {e.title}")
        else:
            timed.append((e.start_dt.strftime("%H:%M"), e.title))

    timed.sort(key=lambda x: x[0])
    lines = [f"{hm} {title}" for hm, title in timed] + untimed
    return "\n".join(lines) if lines else "Nothing scheduled today."


def send_daily_brief() -> None:
    try:
        body = build_brief_body()
    except Exception:
        body = "Could not load agenda."
    PushoverClient().send(title="Good morning", message=body, priority=0)
