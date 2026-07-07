"""Sync export bundle assembly for the advisor brief (EXPORT-01..06).

SYNC ONLY: copies the brief.py three-line engine boilerplate. No async/await,
no LLM imports, no new dependencies, no new migration. session_id is a fresh
uuid4 per request and is never persisted (stateless, D-11). progress_pct is live
via brief._compute_progress_sync (D-03). Calendar load is per-day COUNT only --
event titles are NEVER rendered (privacy, D-05).
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import settings as app_settings

_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)

PRIORITY_TYPES = {"career", "learning"}
PRIORITY_RANK = {"high": 3, "medium": 2, "low": 1}
ACCEL_THRESHOLD = 10
STALL_THRESHOLD = -5
TOKEN_BUDGET = 30000  # ~chars/4 approximation target (D-06)


def _velocity_label(snapshots) -> str:
    """snapshots ordered oldest->newest, each with a .progress_pct attribute."""
    if len(snapshots) < 2:
        return "no_data"
    delta = snapshots[-1].progress_pct - snapshots[0].progress_pct
    if delta >= ACCEL_THRESHOLD:
        return "accelerating"
    if delta <= STALL_THRESHOLD:
        return "stalling"
    return "steady"


def _render_goal_section(goal, session, today, *, compact=False) -> str:
    from app.models.goal import GoalProgressSnapshot
    from app.services.brief import _compute_progress_sync

    days_remaining = (goal.target_date - today).days if goal.target_date else None
    progress = _compute_progress_sync(goal.id, session)

    lines = [f"### {goal.title} ({goal.type.value})"]
    if goal.external_key:
        lines.append(f"- external_key: {goal.external_key}")
    target = goal.target_date.isoformat() if goal.target_date else "no target date"
    if days_remaining is not None:
        lines.append(f"- target: {target} ({days_remaining} days remaining)")
    else:
        lines.append(f"- target: {target}")
    lines.append(f"- progress: {progress}%")

    if goal.milestones:
        lines.append("- milestones:")
        for m in goal.milestones:
            mark = "x" if m.done else " "
            lines.append(f"  - [{mark}] {m.title}")

    active_tasks = [t for t in goal.tasks if not t.completed]
    now = datetime.now()
    top = sorted(
        active_tasks,
        key=lambda t: (
            -PRIORITY_RANK.get(t.priority.value, 1),
            t.due_date.replace(tzinfo=None) if t.due_date else datetime.max,
        ),
    )[:3]
    if top:
        lines.append("- top tasks:")
        for t in top:
            due = ""
            if t.due_date:
                due = f" (due {t.due_date.date().isoformat()})"
            lines.append(f"  - {t.title} [{t.priority.value}]{due}")

    overdue = sum(
        1
        for t in active_tasks
        if t.due_date and t.due_date.replace(tzinfo=None) < now
    )
    lines.append(f"- overdue: {overdue}")

    snaps = session.execute(
        select(GoalProgressSnapshot)
        .where(GoalProgressSnapshot.goal_id == goal.id)
        .order_by(GoalProgressSnapshot.snapshotted_on.asc())
    ).scalars().all()
    recent = snaps[-4:]
    if not recent:
        lines.append("- trend: no_data")
    else:
        values = [s.progress_pct for s in recent]
        if compact:
            values = values[-2:]
        label = _velocity_label(recent)
        lines.append(f"- trend: {' -> '.join(str(v) + '%' for v in values)} ({label})")

    return "\n".join(lines)


def _render_block_summary(session, today, *, compact=False) -> str:
    from app.models.plan import ScheduledBlock

    start_key = (today - timedelta(days=14)).isoformat()
    today_key = today.isoformat()
    blocks = session.execute(
        select(ScheduledBlock).where(
            ScheduledBlock.date_key >= start_key,
            ScheduledBlock.date_key <= today_key,
        )
    ).scalars().all()

    planned = len(blocks)
    completed = sum(1 for b in blocks if b.completed)
    slipped = sum(1 for b in blocks if not b.completed and b.date_key < today_key)

    if compact:
        return f"Planned {planned} / Completed {completed} / Slipped {slipped}"

    return (
        "| Metric | Count |\n"
        "| --- | --- |\n"
        f"| Planned | {planned} |\n"
        f"| Completed | {completed} |\n"
        f"| Slipped | {slipped} |"
    )


def _render_calendar_load(session, today) -> str:
    from app.models.calendar import CalendarEvent

    window_start = today
    window_end = today + timedelta(days=6)
    events = session.execute(
        select(CalendarEvent).where(CalendarEvent.cancelled == False)  # noqa: E712
    ).scalars().all()

    counts: dict[str, int] = {}
    for e in events:
        if e.all_day:
            if not e.start_date:
                continue
            try:
                event_day = date.fromisoformat(e.start_date)
            except ValueError:
                continue
        else:
            if e.start_dt is None:
                continue
            event_day = e.start_dt.date()
        if window_start <= event_day <= window_end:
            key = event_day.isoformat()
            counts[key] = counts.get(key, 0) + 1

    lines = []
    for i in range(7):
        day = today + timedelta(days=i)
        key = day.isoformat()
        lines.append(f"- {key}: {counts.get(key, 0)}")
    return "\n".join(lines)


def _render_stalled(session) -> str:
    from app.services.guidance_service import _find_stalled_goals

    stalled = _find_stalled_goals(session, 7)
    if not stalled:
        return "- none"
    return "\n".join(f"- {g.title}" for g in stalled)


def _assemble(goal_sections, block_table, calendar_section, stalled_section,
              generated_at, session_id) -> str:
    lines = [
        "# Advisor Brief",
        f"generated_at: {generated_at}  session_id: {session_id}",
        "",
        "## Goals",
        *goal_sections,
        "",
        "## 14-Day Block Summary",
        block_table,
        "",
        "## 7-Day Calendar Load",
        calendar_section,
        "",
        "## Stalled Goals",
        stalled_section,
    ]
    return "\n".join(lines)


def build_export_bundle() -> dict:
    from app.models.goal import Goal, GoalStatus

    session_id = str(uuid.uuid4())
    generated_at = datetime.now(timezone.utc).isoformat()
    today = date.today()

    with _Session() as s:
        goals = s.execute(
            select(Goal).where(Goal.status == GoalStatus.active)
        ).scalars().all()
        goals = sorted(
            goals,
            key=lambda g: (
                g.type.value not in PRIORITY_TYPES,
                g.target_date is None,
                g.target_date or date.max,
            ),
        )

        goal_sections = [_render_goal_section(g, s, today) for g in goals]
        block_table = _render_block_summary(s, today)
        calendar_section = _render_calendar_load(s, today)
        stalled_section = _render_stalled(s)

        markdown = _assemble(
            goal_sections, block_table, calendar_section, stalled_section,
            generated_at, session_id,
        )

        if len(markdown) // 4 > TOKEN_BUDGET:
            goal_sections = [
                _render_goal_section(g, s, today, compact=True) for g in goals
            ]
            block_table = _render_block_summary(s, today, compact=True)
            markdown = _assemble(
                goal_sections, block_table, calendar_section, stalled_section,
                generated_at, session_id,
            )

    return {"markdown": markdown, "session_id": session_id, "generated_at": generated_at}
