import logging
from datetime import datetime, timedelta, date
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from app.config import settings as app_settings
from app.services.pushover import PushoverClient

_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)

_log = logging.getLogger(__name__)


def _most_urgent_task_title(goal) -> str | None:
    pending = [t for t in goal.tasks if not t.completed]
    if not pending:
        return None
    with_due = [t for t in pending if t.due_date]
    if with_due:
        return min(with_due, key=lambda t: t.due_date).title
    _priority_rank = {"high": 3, "medium": 2, "low": 1}
    return max(pending, key=lambda t: _priority_rank.get(t.priority.value, 1)).title


def get_stalled_goals(threshold_days: int = 7) -> list:
    """Return active goals where every non-habit linked task has completed_at older than cutoff (or null).
    Goals with zero non-habit linked tasks are excluded (D-10)."""
    with _Session() as s:
        return _find_stalled_goals(s, threshold_days)


def _find_stalled_goals(session, threshold_days: int) -> list:
    from app.models.goal import Goal

    cutoff = datetime.now() - timedelta(days=threshold_days)
    goals = session.execute(
        select(Goal).where(Goal.status == "active")
    ).scalars().all()

    stalled = []
    for goal in goals:
        linked = [t for t in goal.tasks if not t.is_habit]
        if not linked:
            continue
        recently = any(
            t.completed_at is not None and t.completed_at.replace(tzinfo=None) >= cutoff
            for t in linked
        )
        if not recently:
            stalled.append(goal)
    return stalled


def send_stall_nudge() -> bool | None:
    """APScheduler job target. Returns False if rate-limited, None on fire."""
    from app.models import AppSettings

    try:
        with _Session() as s:
            cfg = s.get(AppSettings, 1)
            today = datetime.now().date()
            if cfg and cfg.last_guidance_sent_date == today:
                return False  # D-14/D-15 rate limit
            threshold = cfg.stall_threshold_days if (cfg and cfg.stall_threshold_days is not None) else 7
            stalled = _find_stalled_goals(s, threshold)
            if not stalled:
                return None
            lines = []
            for g in stalled:
                nt = _most_urgent_task_title(g)
                suffix = f" Next: {nt}." if nt else ""
                lines.append(f"• Goal stalled: {g.title} — {threshold}+ days without a completion.{suffix}")
            message = "\n".join(lines)[:1024]
            PushoverClient().send(title="Goal stalled", message=message, priority=0)
            if cfg is None:
                cfg = AppSettings(id=1, last_guidance_sent_date=today)
                s.add(cfg)
            else:
                cfg.last_guidance_sent_date = today
            s.commit()
    except Exception:
        _log.exception("send_stall_nudge failed")
