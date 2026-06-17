"""Pure deterministic day planner.

Read-only guarantee: this module imports nothing from the database/session
layer and contains no async functions and no side effects. The
``/plan/propose`` router is responsible
for loading ORM objects from the DB and passing them in; this module only reads
their fields and returns a ``ProposedDayPlan``. It is structurally incapable of
writing to the database.

Timezone assumption: ``local_tz`` (default "UTC") is the timezone the work-hours
window (work_start/work_end) is expressed in. On the Pi this should be the
system timezone. All ORM datetimes (event start/end, task due dates) are stored
and reasoned about in UTC; the work window is converted to UTC before gap-finding
(see RESEARCH §10).
"""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.models import Task
from app.models.calendar import CalendarEvent
from app.schemas.plan import ProposedBlock, ProposedDayPlan

PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _find_gaps(
    events: list[CalendarEvent],
    work_start: time,
    work_end: time,
    target_date: date,
    now: datetime | None,
    local_tz: str,
) -> list[tuple[datetime, datetime]]:
    tz = ZoneInfo(local_tz)
    ws = datetime.combine(target_date, work_start, tzinfo=tz).astimezone(timezone.utc)
    we = datetime.combine(target_date, work_end, tzinfo=tz).astimezone(timezone.utc)

    # Past-gap exclusion for today: never propose blocks before `now`.
    if now is not None and now.date() == target_date:
        ws = max(ws, now)

    if ws >= we:
        return []

    # Only timed events overlapping the window block time. All-day events
    # (all_day=True, start_dt=None) are context, not blockers (Pitfall 1).
    blockers = sorted(
        (
            e
            for e in events
            if not e.all_day
            and e.start_dt is not None
            and e.end_dt is not None
            and e.start_dt < we
            and e.end_dt > ws
        ),
        key=lambda e: e.start_dt,
    )

    gaps: list[tuple[datetime, datetime]] = []
    cursor = ws
    for e in blockers:
        bstart = max(e.start_dt, ws)
        bend = min(e.end_dt, we)
        if bstart > cursor:
            gaps.append((cursor, bstart))
        cursor = max(cursor, bend)
    if cursor < we:
        gaps.append((cursor, we))

    return gaps


def _priority_sort_key(task: Task, target_date: date) -> tuple[int, int, int]:
    due = task.due_date.date() if task.due_date else None
    tier = 0 if (due is not None and due <= target_date) else 1
    prio = PRIORITY_ORDER.get(task.priority.value, 1)
    proximity = (due - target_date).days if due is not None else 9999
    return (tier, prio, proximity)


def _pack_tasks(
    sorted_tasks: list[Task],
    gaps: list[tuple[datetime, datetime]],
    default_minutes: int,
) -> tuple[list[ProposedBlock], list[Task]]:
    gap_cursors = list(gaps)
    placed: list[ProposedBlock] = []
    unplaced: list[Task] = []

    for task in sorted_tasks:
        duration = timedelta(minutes=task.estimated_minutes or default_minutes)
        fit_index = None
        for i, (cursor, end) in enumerate(gap_cursors):
            if end - cursor >= duration:
                fit_index = i
                break

        if fit_index is None:
            unplaced.append(task)
            continue

        cursor, end = gap_cursors[fit_index]
        block_start = cursor
        block_end = cursor + duration
        gap_cursors[fit_index] = (block_end, end)
        placed.append(
            ProposedBlock(
                task_id=task.id,
                title=task.title,
                start_dt=block_start,
                end_dt=block_end,
            )
        )

    return placed, unplaced


def propose_day_plan(
    tasks: list[Task],
    events: list[CalendarEvent],
    target_date: date,
    work_start: time = time(9, 0),
    work_end: time = time(18, 0),
    default_block_minutes: int = 30,
    now: datetime | None = None,
    local_tz: str = "UTC",
) -> ProposedDayPlan:
    if now is None:
        now = datetime.now(timezone.utc)

    eligible = sorted(
        [t for t in tasks if not t.completed and not t.is_habit],
        key=lambda t: _priority_sort_key(t, target_date),
    )

    gaps = _find_gaps(events, work_start, work_end, target_date, now, local_tz)
    fully_booked = len(gaps) == 0

    if fully_booked:
        return ProposedDayPlan(
            date=target_date,
            blocks=[],
            unplaced_task_ids=[t.id for t in eligible],
            fully_booked=True,
        )

    placed, unplaced = _pack_tasks(eligible, gaps, default_block_minutes)
    return ProposedDayPlan(
        date=target_date,
        blocks=placed,
        unplaced_task_ids=[t.id for t in unplaced],
        fully_booked=False,
    )
