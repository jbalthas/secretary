from datetime import date, datetime, time, timedelta

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Task
from app.models.goal import Goal, GoalProgressSnapshot, GoalStatus, Milestone
from app.services.brief import _compute_progress_sync

_sync_url = settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)


def _week_bounds(snapshot_date: date) -> tuple[datetime, datetime]:
    week_start = snapshot_date - timedelta(days=snapshot_date.weekday())
    start = datetime.combine(week_start, time.min)
    return start, start + timedelta(days=7)


def take_progress_snapshot(snapshot_date: date | None = None) -> dict[str, int]:
    captured_on = snapshot_date or date.today()
    week_start, week_end = _week_bounds(captured_on)
    created = 0
    skipped = 0

    with _Session() as session:
        goals = session.scalars(
            select(Goal).where(Goal.status == GoalStatus.active)
        ).all()

        for goal in goals:
            exists = session.scalar(
                select(GoalProgressSnapshot.id).where(
                    GoalProgressSnapshot.goal_id == goal.id,
                    GoalProgressSnapshot.snapshotted_on == captured_on,
                )
            )
            if exists is not None:
                skipped += 1
                continue

            milestones_done = session.scalar(
                select(func.count(Milestone.id)).where(
                    Milestone.goal_id == goal.id,
                    Milestone.done.is_(True),
                )
            ) or 0
            tasks_completed_week = session.scalar(
                select(func.count(Task.id)).where(
                    Task.goal_id == goal.id,
                    Task.completed_at >= week_start,
                    Task.completed_at < week_end,
                )
            ) or 0
            tasks_slipped_week = session.scalar(
                select(func.count(Task.id)).where(
                    Task.goal_id == goal.id,
                    Task.due_date >= week_start,
                    Task.due_date < week_end,
                    Task.completed.is_(False),
                )
            ) or 0

            session.add(
                GoalProgressSnapshot(
                    goal_id=goal.id,
                    snapshotted_on=captured_on,
                    progress_pct=_compute_progress_sync(goal.id, session),
                    milestones_done=milestones_done,
                    tasks_completed_week=tasks_completed_week,
                    tasks_slipped_week=tasks_slipped_week,
                )
            )
            created += 1

        session.commit()

    return {"created": created, "skipped": skipped}


def cleanup_progress_snapshots(today: date | None = None) -> int:
    cutoff = (today or date.today()) - timedelta(days=730)
    with _Session() as session:
        result = session.execute(
            delete(GoalProgressSnapshot).where(
                GoalProgressSnapshot.snapshotted_on < cutoff
            )
        )
        session.commit()
        return result.rowcount or 0
