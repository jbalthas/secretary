"""
Wave 0 failing test stubs for Phase 11 goal-guided guidance.

Patch target for session seam: `app.services.guidance_service._Session`
Plan 11-02 (brief integration) and 11-03 (next-best-task + stall detection) implement these.

All guidance-service tests import guidance_service INSIDE the test body so this
file remains collectable before guidance_service.py exists.

The two foundation tests (test_completed_at_stamped, test_stall_threshold_roundtrip)
live in test_tasks.py and test_settings.py respectively and pass after Plan 11-01.
"""
from datetime import datetime, timezone, date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.main import app

TEST_SYNC_URL = "sqlite:///./test_secretary.db"

client = TestClient(app)


def _make_sync_session():
    engine = create_engine(TEST_SYNC_URL)
    Base.metadata.create_all(engine)
    return sessionmaker(engine)


# ---------------------------------------------------------------------------
# GUIDE-01 — brief body includes active goal snapshot
# ---------------------------------------------------------------------------

def test_brief_body_includes_goal_snapshot():
    """GUIDE-01: build_brief_body() output contains an active goal title and its progress '%' line."""
    from app.services.brief import build_brief_body  # noqa: PLC0415
    from app.models.goal import Goal, GoalStatus, GoalType  # noqa: PLC0415
    from app.models import Task  # noqa: PLC0415
    from app.models.calendar import CalendarEvent  # noqa: PLC0415

    SyncSession = _make_sync_session()

    with SyncSession() as s:
        s.query(Task).delete()
        s.query(CalendarEvent).delete()
        s.query(Goal).delete()
        s.commit()
        goal = Goal(
            title="Launch My Secretary v2",
            type=GoalType.career,
            status=GoalStatus.active,
        )
        s.add(goal)
        s.commit()

    with patch("app.services.brief._Session", SyncSession):
        body = build_brief_body()

    assert "Launch My Secretary v2" in body
    assert "%" in body


# ---------------------------------------------------------------------------
# GUIDE-01 — brief speech mentions active goal count (D-04)
# ---------------------------------------------------------------------------

def test_brief_speech_goal_summary():
    """D-04: build_brief_speech() mentions active goal count and at most 2-3 goal titles."""
    from app.services.brief import build_brief_speech  # noqa: PLC0415
    from app.models.goal import Goal, GoalStatus, GoalType  # noqa: PLC0415
    from app.models import Task  # noqa: PLC0415
    from app.models.calendar import CalendarEvent  # noqa: PLC0415

    SyncSession = _make_sync_session()

    with SyncSession() as s:
        s.query(Task).delete()
        s.query(CalendarEvent).delete()
        s.query(Goal).delete()
        s.commit()
        for name in ["Goal Alpha", "Goal Beta", "Goal Gamma", "Goal Delta"]:
            s.add(Goal(title=name, type=GoalType.career, status=GoalStatus.active))
        s.commit()

    with patch("app.services.brief._Session", SyncSession):
        speech = build_brief_speech()

    # Speech should reference goal count, not enumerate all 4 titles
    goal_title_count = sum(1 for name in ["Goal Alpha", "Goal Beta", "Goal Gamma", "Goal Delta"] if name in speech)
    assert goal_title_count <= 3
    assert "goal" in speech.lower()


# ---------------------------------------------------------------------------
# GUIDE-02 — next-best-task scoring endpoint
# ---------------------------------------------------------------------------

def test_next_best_task_scoring():
    """GUIDE-02: GET /guidance/next-best-task returns highest-scoring pending non-habit task (D-06)."""
    from app.models import Task, Priority  # noqa: PLC0415
    from app.models.goal import Goal, GoalStatus, GoalType  # noqa: PLC0415

    # Create tasks via API to ensure they exist in the live DB
    g = client.post("/api/v1/goals/", json={"title": "Score Goal", "type": "career"}).json()

    high_task = client.post("/api/v1/tasks/", json={
        "title": "High priority task",
        "priority": "high",
        "goal_id": g["id"],
    }).json()

    low_task = client.post("/api/v1/tasks/", json={
        "title": "Low priority task",
        "priority": "low",
        "goal_id": g["id"],
    }).json()

    r = client.get("/api/v1/guidance/next-best-task")
    assert r.status_code == 200
    data = r.json()
    assert data is not None
    assert data["id"] == high_task["id"]


def test_next_best_task_empty():
    """D-08: returns null when no pending tasks exist."""
    # Complete all existing tasks
    tasks = client.get("/api/v1/tasks/").json()
    for t in tasks:
        if not t["completed"]:
            client.patch(f"/api/v1/tasks/{t['id']}", json={"completed": True})

    r = client.get("/api/v1/guidance/next-best-task")
    assert r.status_code == 200
    assert r.json() is None


# ---------------------------------------------------------------------------
# GUIDE-03 — stall detection
# ---------------------------------------------------------------------------

def test_stall_detection_basic():
    """GUIDE-03: a goal with a linked task whose completed_at is older than threshold is flagged stalled."""
    from app.services import guidance_service  # noqa: PLC0415
    from app.models import Task  # noqa: PLC0415
    from app.models.goal import Goal, GoalStatus, GoalType  # noqa: PLC0415

    SyncSession = _make_sync_session()

    stale_dt = datetime.now(timezone.utc) - timedelta(days=10)

    with SyncSession() as s:
        s.query(Task).delete()
        s.query(Goal).delete()
        s.commit()
        goal = Goal(title="Stalled Goal", type=GoalType.career, status=GoalStatus.active)
        s.add(goal)
        s.flush()
        task = Task(
            title="Old task",
            completed=True,
            completed_at=stale_dt,
            goal_id=goal.id,
        )
        s.add(task)
        s.commit()
        goal_id = goal.id

    with patch("app.services.guidance_service._Session", SyncSession):
        stalled = guidance_service.get_stalled_goals(threshold_days=7)

    assert any(g.id == goal_id for g in stalled)


def test_stall_no_tasks_not_stalled():
    """D-10: a goal with zero linked tasks is NOT stalled."""
    from app.services import guidance_service  # noqa: PLC0415
    from app.models import Task  # noqa: PLC0415
    from app.models.goal import Goal, GoalStatus, GoalType  # noqa: PLC0415

    SyncSession = _make_sync_session()

    with SyncSession() as s:
        s.query(Task).delete()
        s.query(Goal).delete()
        s.commit()
        goal = Goal(title="Empty Goal", type=GoalType.career, status=GoalStatus.active)
        s.add(goal)
        s.commit()
        goal_id = goal.id

    with patch("app.services.guidance_service._Session", SyncSession):
        stalled = guidance_service.get_stalled_goals(threshold_days=7)

    assert not any(g.id == goal_id for g in stalled)


def test_stall_rate_limit():
    """D-14: send_stall_nudge skips when last_guidance_sent_date == today."""
    from app.services import guidance_service  # noqa: PLC0415
    from app.models import AppSettings  # noqa: PLC0415
    from app.models.goal import Goal, GoalStatus, GoalType  # noqa: PLC0415

    SyncSession = _make_sync_session()
    today = date.today()

    with SyncSession() as s:
        s.query(AppSettings).delete()
        s.commit()
        cfg = AppSettings(id=1, last_guidance_sent_date=today)
        s.add(cfg)
        s.commit()

    with patch("app.services.guidance_service._Session", SyncSession):
        result = guidance_service.send_stall_nudge()

    # When rate-limited, send_stall_nudge returns False (skipped)
    assert result is False
