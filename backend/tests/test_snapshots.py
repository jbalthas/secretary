from datetime import date, datetime, timedelta
import inspect
from unittest.mock import patch

import pytest
from apscheduler.jobstores.memory import MemoryJobStore
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.main import app
from app.models import Task
from app.models.goal import (
    Goal,
    GoalProgressSnapshot,
    GoalStatus,
    GoalType,
    Milestone,
)
from app.scheduler import (
    scheduler,
    schedule_snapshot_cleanup,
    schedule_weekly_snapshot,
)
from app.services import snapshot_service


SNAPSHOT_DATE = date(2026, 6, 28)


@pytest.fixture
def snapshot_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'snapshots.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(engine)
    with patch("app.services.snapshot_service._Session", Session):
        yield Session
    engine.dispose()


@pytest.fixture
def populated_snapshot_session(snapshot_session):
    with snapshot_session() as session:
        active = Goal(title="Active goal", type=GoalType.career, status=GoalStatus.active)
        archived = Goal(title="Archived goal", type=GoalType.life, status=GoalStatus.archived)
        session.add_all([active, archived])
        session.flush()
        session.add_all(
            [
                Milestone(goal_id=active.id, title="Done milestone", done=True),
                Milestone(goal_id=active.id, title="Open milestone", done=False),
                Task(
                    title="Completed this week",
                    goal_id=active.id,
                    completed=True,
                    completed_at=datetime(2026, 6, 23, 12, 0),
                ),
                Task(
                    title="Slipped this week",
                    goal_id=active.id,
                    completed=False,
                    due_date=datetime(2026, 6, 25, 9, 0),
                ),
                Task(
                    title="Future task",
                    goal_id=active.id,
                    completed=False,
                    due_date=datetime(2026, 7, 2, 9, 0),
                ),
            ]
        )
        session.commit()
    return snapshot_session


def test_snapshot_captures_active_goal_metrics(populated_snapshot_session):
    assert not inspect.iscoroutinefunction(snapshot_service.take_progress_snapshot)

    result = snapshot_service.take_progress_snapshot(SNAPSHOT_DATE)

    assert result == {"created": 1, "skipped": 0}
    with populated_snapshot_session() as session:
        row = session.scalar(select(GoalProgressSnapshot))
        assert row.snapshotted_on == SNAPSHOT_DATE
        assert row.progress_pct == 40
        assert row.milestones_done == 1
        assert row.tasks_completed_week == 1
        assert row.tasks_slipped_week == 1


def test_snapshot_same_day_is_idempotent(populated_snapshot_session):
    first = snapshot_service.take_progress_snapshot(SNAPSHOT_DATE)
    second = snapshot_service.take_progress_snapshot(SNAPSHOT_DATE)

    assert first == {"created": 1, "skipped": 0}
    assert second == {"created": 0, "skipped": 1}
    with populated_snapshot_session() as session:
        assert session.scalar(select(func.count(GoalProgressSnapshot.id))) == 1


def test_snapshot_skips_inactive_goals(populated_snapshot_session):
    snapshot_service.take_progress_snapshot(SNAPSHOT_DATE)

    with populated_snapshot_session() as session:
        rows = session.scalars(select(GoalProgressSnapshot)).all()
        assert len(rows) == 1
        goal = session.get(Goal, rows[0].goal_id)
        assert goal.status == GoalStatus.active


def test_snapshot_cleanup_retention(snapshot_session):
    today = date(2026, 6, 29)
    with snapshot_session() as session:
        goal = Goal(title="Retention goal", type=GoalType.learning, status=GoalStatus.active)
        session.add(goal)
        session.flush()
        session.add_all(
            [
                GoalProgressSnapshot(
                    goal_id=goal.id,
                    snapshotted_on=today - timedelta(days=731),
                    progress_pct=10,
                ),
                GoalProgressSnapshot(
                    goal_id=goal.id,
                    snapshotted_on=today - timedelta(days=730),
                    progress_pct=20,
                ),
            ]
        )
        session.commit()

    assert snapshot_service.cleanup_progress_snapshots(today) == 1
    with snapshot_session() as session:
        dates = session.scalars(select(GoalProgressSnapshot.snapshotted_on)).all()
        assert dates == [today - timedelta(days=730)]


@pytest.fixture
def memory_jobstore():
    scheduler.remove_jobstore("default")
    scheduler.add_jobstore(MemoryJobStore(), "default")
    yield
    for job in scheduler.get_jobs():
        job.remove()


def test_snapshot_jobs_registered(memory_jobstore):
    schedule_weekly_snapshot()
    schedule_snapshot_cleanup()

    weekly = scheduler.get_job("snapshot_progress")
    cleanup = scheduler.get_job("snapshot_cleanup")
    assert weekly is not None
    assert cleanup is not None
    assert "day_of_week='sun'" in str(weekly.trigger)
    assert "hour='23'" in str(weekly.trigger)
    assert "minute='50'" in str(weekly.trigger)
    assert "day='1'" in str(cleanup.trigger)


def test_snapshot_endpoint():
    with patch(
        "app.routers.export.snapshot_service.take_progress_snapshot",
        return_value={"created": 2, "skipped": 1},
    ):
        response = TestClient(app).post("/api/v1/export/snapshot")

    assert response.status_code == 200
    assert response.json() == {"created": 2, "skipped": 1}
