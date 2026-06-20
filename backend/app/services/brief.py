import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy import create_engine, select, or_, and_, func, case
from sqlalchemy.orm import sessionmaker
from app.config import settings as app_settings
from app.services.pushover import PushoverClient
from app.services.tts import TTSClient
import app.services.tts_settings as _tts_settings

_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)


def _compute_progress_sync(goal_id: int, session) -> int:
    from app.models import Task
    from app.models.goal import Milestone
    task_row = session.execute(
        select(func.count(Task.id), func.sum(case((Task.completed == True, 1), else_=0))).where(Task.goal_id == goal_id)
    ).one()
    ms_row = session.execute(
        select(func.count(Milestone.id), func.sum(case((Milestone.done == True, 1), else_=0))).where(Milestone.goal_id == goal_id)
    ).one()
    total = (task_row[0] or 0) + (ms_row[0] or 0)
    done = (task_row[1] or 0) + (ms_row[1] or 0)
    return round(done / total * 100) if total > 0 else 0


def build_brief_body() -> str:
    from app.models import Task
    from app.models.calendar import CalendarEvent
    from app.models.goal import Goal

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
        goals = s.execute(select(Goal).where(Goal.status == "active")).scalars().all()

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

        goal_lines = []
        for g in goals:
            pct = _compute_progress_sync(g.id, s)
            pending = [t for t in g.tasks if not t.completed]
            if pending:
                with_due = [t for t in pending if t.due_date]
                if with_due:
                    next_task = min(with_due, key=lambda t: t.due_date)
                else:
                    next_task = max(pending, key=lambda t: {"high": 3, "medium": 2, "low": 1}.get(t.priority.value, 1))
                goal_lines.append(f"• {g.title}: {pct}% — next: {next_task.title}")
            else:
                goal_lines.append(f"• {g.title}: {pct}%")

    if goal_lines:
        lines.append("\nGoals:")
        lines.extend(goal_lines)

    if not lines:
        return "Nothing scheduled today."
    return "\n".join(lines)


def build_brief_speech() -> str:
    from app.models import Task
    from app.models.calendar import CalendarEvent
    from app.models.goal import Goal

    now = datetime.now()
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
        goals = s.execute(select(Goal).where(Goal.status == "active")).scalars().all()

    timed: list[tuple[str, str]] = []
    untimed: list[str] = []

    for t in tasks:
        if t.due_date.hour == 0 and t.due_date.minute == 0:
            untimed.append(t.title)
        else:
            timed.append((t.due_date.strftime("%H:%M"), t.title))

    for e in events:
        if e.all_day or e.start_dt is None:
            untimed.append(e.title)
        else:
            timed.append((e.start_dt.strftime("%H:%M"), e.title))

    timed.sort(key=lambda x: x[0])
    titles = [title for _, title in timed] + untimed

    speech = "Good morning."
    if titles:
        speech += " " + ". ".join(titles) + "."
    elif not goals:
        speech += " Nothing scheduled today."

    if goals:
        sorted_goals = sorted(goals, key=lambda g: (g.target_date is None, g.target_date))
        top = sorted_goals[:3]
        top_titles = ", ".join(g.title for g in top)
        speech += f" You have {len(goals)} active goals. Top goals: {top_titles}."

    return speech


def send_daily_brief() -> None:
    try:
        body = build_brief_body()
    except Exception:
        body = "Could not load agenda."
    PushoverClient().send(title="Good morning", message=body, priority=0)
    try:
        if _tts_settings.get_tts_enabled():
            try:
                speech = build_brief_speech()
            except Exception:
                speech = "Good morning."
            TTSClient().speak(speech)
    except Exception:
        logging.getLogger(__name__).exception("TTS brief failed")


def _configured_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(app_settings.timezone)
    except ZoneInfoNotFoundError:
        logging.getLogger(__name__).warning(
            "Unknown configured timezone %s; using UTC", app_settings.timezone
        )
        return ZoneInfo("UTC")


def _spoken_time(value: datetime, local_tz: ZoneInfo) -> str:
    """Format a time naturally for speech, e.g. 09:30 -> '9:30 A M'."""
    local_value = value.astimezone(local_tz) if value.tzinfo else value
    hour = local_value.strftime("%I").lstrip("0") or "12"
    minute = local_value.strftime("%M")
    suffix = "A M" if local_value.hour < 12 else "P M"
    if minute == "00":
        return f"{hour} {suffix}"
    return f"{hour}:{minute} {suffix}"


def build_tomorrow_speech() -> str:
    """Build an on-demand spoken summary from tomorrow's saved itinerary."""
    from app.models.calendar import CalendarEvent
    from app.models.plan import ScheduledBlock

    local_tz = _configured_timezone()
    tomorrow = datetime.now(local_tz).date() + timedelta(days=1)
    tomorrow_str = tomorrow.isoformat()
    tomorrow_start = datetime.combine(tomorrow, datetime.min.time(), tzinfo=local_tz)
    tomorrow_end = tomorrow_start + timedelta(days=1)
    tomorrow_start_utc = tomorrow_start.astimezone(timezone.utc)
    tomorrow_end_utc = tomorrow_end.astimezone(timezone.utc)

    with _Session() as s:
        blocks = s.execute(
            select(ScheduledBlock)
            .where(ScheduledBlock.date_key == tomorrow_str)
            .order_by(ScheduledBlock.start_dt)
        ).scalars().all()
        events = s.execute(
            select(CalendarEvent).where(
                CalendarEvent.cancelled == False,
                or_(
                    CalendarEvent.start_date == tomorrow_str,
                    and_(
                        CalendarEvent.start_dt >= tomorrow_start_utc,
                        CalendarEvent.start_dt < tomorrow_end_utc,
                    ),
                ),
            )
        ).scalars().all()

    all_day = sorted(
        (event.title for event in events if event.all_day or event.start_dt is None),
        key=str.casefold,
    )
    timed = [(block.start_dt, block.title) for block in blocks]
    timed.extend(
        (event.start_dt, event.title)
        for event in events
        if not event.all_day and event.start_dt is not None
    )
    timed.sort(key=lambda item: item[0])

    entries = [f"all day, {title}" for title in all_day]
    entries.extend(
        f"at {_spoken_time(start, local_tz)}, {title}" for start, title in timed
    )

    if not entries:
        return "You have nothing planned for tomorrow."
    return "Tomorrow, you have " + "; ".join(entries) + "."


def send_tomorrow_brief() -> None:
    """Cast tomorrow's itinerary without also creating a Pushover notification."""
    try:
        if not _tts_settings.get_tts_enabled():
            return
        try:
            speech = build_tomorrow_speech()
        except Exception:
            speech = "I could not load tomorrow's itinerary."
        TTSClient().speak(speech)
    except Exception:
        logging.getLogger(__name__).exception("Tomorrow itinerary TTS failed")


def _day_entries(s, day_start_naive: datetime) -> tuple[list[tuple[str, str]], list[str]]:
    from app.models import Task
    from app.models.calendar import CalendarEvent

    day_end_naive = day_start_naive + timedelta(days=1)
    day_str = day_start_naive.date().isoformat()

    tasks = s.execute(
        select(Task).where(
            Task.completed == False,
            Task.due_date.isnot(None),
            Task.due_date >= day_start_naive,
            Task.due_date < day_end_naive,
        )
    ).scalars().all()
    events = s.execute(
        select(CalendarEvent).where(
            CalendarEvent.cancelled == False,
            or_(
                CalendarEvent.start_date == day_str,
                and_(
                    CalendarEvent.start_dt >= day_start_naive,
                    CalendarEvent.start_dt < day_end_naive,
                ),
            ),
        )
    ).scalars().all()

    timed: list[tuple[str, str]] = []
    untimed: list[str] = []

    for t in tasks:
        if t.due_date.hour == 0 and t.due_date.minute == 0:
            untimed.append(t.title)
        else:
            timed.append((t.due_date.strftime("%H:%M"), t.title))

    for e in events:
        if e.all_day or e.start_dt is None:
            untimed.append(e.title)
        else:
            timed.append((e.start_dt.strftime("%H:%M"), e.title))

    timed.sort(key=lambda x: x[0])
    return timed, untimed


def build_week_body() -> str:
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    blocks: list[str] = []

    with _Session() as s:
        for i in range(7):
            day_start = today_start + timedelta(days=i)
            timed, untimed = _day_entries(s, day_start)
            if not (timed or untimed):
                continue
            lines = [f"{day_start.strftime('%A')}:"]
            lines += [f"{hm} {title}" for hm, title in timed]
            lines += [f"• {t}" for t in untimed]
            blocks.append("\n".join(lines))

    return "\n".join(blocks) if blocks else "Nothing scheduled this week."


def build_week_speech() -> str:
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_strings: list[str] = []

    with _Session() as s:
        for i in range(7):
            day_start = today_start + timedelta(days=i)
            timed, untimed = _day_entries(s, day_start)
            if not (timed or untimed):
                continue
            titles = [title for _, title in timed] + untimed
            day_strings.append(f"{day_start.strftime('%A')}: " + ", ".join(titles) + ".")

    if not day_strings:
        return "Good morning. Nothing scheduled this week."
    return "Good morning. This week. " + " ".join(day_strings)


def send_weekly_brief() -> None:
    try:
        body = build_week_body()
    except Exception:
        body = "Could not load agenda."
    PushoverClient().send(title="This week", message=body, priority=0)
    try:
        if _tts_settings.get_tts_enabled():
            try:
                speech = build_week_speech()
            except Exception:
                speech = "Good morning."
            TTSClient().speak(speech)
    except Exception:
        logging.getLogger(__name__).exception("TTS brief failed")
