"""Wave 0 RED test scaffold for Phase 15 export bundle (EXPORT-01..06 + PROMPT CI guard).

All export_service-dependent tests defer the import of `app.services.export_service`
INSIDE the test body (mirrors the Phase 08 decision) so this file COLLECTS before
export_service.py exists. Tests 3-8 are EXPECTED RED until plan 15-02 lands the service
and the GET /api/v1/export/bundle route.

The export_session fixture patches all THREE module-level _Session refs to one in-memory
test Session: export_service (the service under test), brief (_compute_progress_sync), and
guidance_service (_find_stalled_goals) -- because build_export_bundle calls into all three.
"""

import pathlib
import types
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.main import app
from app.models import Priority, Task
from app.models.calendar import CalendarEvent
from app.models.goal import (
    Goal,
    GoalProgressSnapshot,
    GoalStatus,
    GoalType,
    Milestone,
)
from app.models.plan import ScheduledBlock


@pytest.fixture
def export_session(tmp_path):
    """One test Session patched over export_service, brief, and guidance_service."""
    engine = create_engine(f"sqlite:///{tmp_path / 'export.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(engine)
    with patch("app.services.export_service._Session", Session), \
         patch("app.services.brief._Session", Session), \
         patch("app.services.guidance_service._Session", Session):
        yield Session
    engine.dispose()


def _add_goal(
    session,
    *,
    title,
    type_,
    external_key=None,
    status=GoalStatus.active,
    target_date=None,
):
    goal = Goal(
        title=title,
        type=type_,
        external_key=external_key,
        status=status,
        target_date=target_date,
    )
    session.add(goal)
    session.flush()
    return goal


def _add_task(
    session,
    *,
    title,
    goal_id=None,
    priority=Priority.medium,
    due_date=None,
    completed=False,
    completed_at=None,
    is_habit=False,
    external_key=None,
):
    task = Task(
        title=title,
        goal_id=goal_id,
        priority=priority,
        due_date=due_date,
        completed=completed,
        completed_at=completed_at,
        is_habit=is_habit,
        external_key=external_key,
    )
    session.add(task)
    session.flush()
    return task


def _add_block(session, *, title, date_key, completed=False):
    now = datetime.now(timezone.utc)
    block = ScheduledBlock(
        title=title,
        date_key=date_key,
        completed=completed,
        start_dt=now,
        end_dt=now + timedelta(hours=1),
    )
    session.add(block)
    session.flush()
    return block


def _add_event(session, *, google_id, title, start_dt=None, start_date=None, all_day=False):
    event = CalendarEvent(
        google_id=google_id,
        title=title,
        start_dt=start_dt,
        start_date=start_date,
        all_day=all_day,
        cancelled=False,
    )
    session.add(event)
    session.flush()
    return event


# ---------------------------------------------------------------------------
# 1. CI GUARD -- locked hard constraint. No deferred import; passes immediately.
# ---------------------------------------------------------------------------
def test_no_llm_imports():
    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    offenders = [
        str(p)
        for p in root.rglob("*.py")
        if any(
            s in p.read_text(encoding="utf-8")
            for s in ("anthropic", "openai", "litellm")
        )
    ]
    assert offenders == [], f"LLM library import found in: {offenders}"


# ---------------------------------------------------------------------------
# 2. EXPORT-04 pure velocity logic.
# ---------------------------------------------------------------------------
def test_velocity_label():
    from app.services.export_service import _velocity_label

    def SN(pct):
        return types.SimpleNamespace(progress_pct=pct)

    assert _velocity_label([]) == "no_data"
    assert _velocity_label([SN(50)]) == "no_data"
    assert _velocity_label([SN(40), SN(55)]) == "accelerating"  # delta +15 >= 10
    assert _velocity_label([SN(60), SN(50)]) == "stalling"       # delta -10 <= -5
    assert _velocity_label([SN(50), SN(52)]) == "steady"         # delta +2


# ---------------------------------------------------------------------------
# 3. EXPORT-01 endpoint shape.
# ---------------------------------------------------------------------------
def test_bundle_endpoint(export_session):
    with export_session() as session:
        _add_goal(session, title="Endpoint goal", type_=GoalType.career)
        session.commit()

    response = TestClient(app).get("/api/v1/export/bundle")

    assert response.status_code == 200
    body = response.json()
    assert set(("markdown", "session_id", "generated_at")) <= set(body.keys())
    assert body["markdown"].startswith("# Advisor Brief")
    assert isinstance(body["session_id"], str)
    assert body["session_id"]


# ---------------------------------------------------------------------------
# 4. EXPORT-02 goal section content.
# ---------------------------------------------------------------------------
def test_bundle_contains_goal_section(export_session):
    from app.services import export_service

    past = datetime.now(timezone.utc) - timedelta(days=2)
    future = datetime.now(timezone.utc) + timedelta(days=5)
    with export_session() as session:
        goal = _add_goal(
            session, title="Ship v2", type_=GoalType.career, external_key="ship-v2"
        )
        session.add(Milestone(goal_id=goal.id, title="Beta cut", done=False))
        _add_task(
            session,
            title="Write the launch post",
            goal_id=goal.id,
            priority=Priority.high,
            due_date=future,
        )
        _add_task(
            session,
            title="Tidy the changelog",
            goal_id=goal.id,
            priority=Priority.low,
        )
        _add_task(
            session,
            title="Fix the overdue migration",
            goal_id=goal.id,
            priority=Priority.high,
            due_date=past,
            completed=False,
        )
        session.commit()

    bundle = export_service.build_export_bundle()
    md = bundle["markdown"]

    assert "Ship v2" in md
    assert "career" in md
    assert "%" in md
    assert "Beta cut" in md
    assert "Write the launch post" in md
    assert "Tidy the changelog" in md
    assert "overdue" in md.lower()


# ---------------------------------------------------------------------------
# 5. EXPORT-03 block summary (Planned / Completed / Slipped over last 14 days).
# ---------------------------------------------------------------------------
def test_block_summary(export_session):
    from app.services import export_service

    today = date.today()
    today_key = today.isoformat()
    yesterday_key = (today - timedelta(days=1)).isoformat()

    with export_session() as session:
        _add_block(session, title="Done block", date_key=yesterday_key, completed=True)
        _add_block(session, title="Slipped block", date_key=yesterday_key, completed=False)
        _add_block(session, title="Upcoming block", date_key=today_key, completed=False)
        session.commit()

    bundle = export_service.build_export_bundle()
    md = bundle["markdown"]

    assert "Planned" in md and "3" in md
    assert "Completed" in md and "1" in md
    assert "Slipped" in md and "1" in md


# ---------------------------------------------------------------------------
# 6. EXPORT-06 goal ordering (career & learning before health).
# ---------------------------------------------------------------------------
def test_goal_ordering(export_session):
    from app.services import export_service

    with export_session() as session:
        _add_goal(session, title="Run", type_=GoalType.health, external_key="run")
        _add_goal(session, title="Promo", type_=GoalType.career, external_key="promo")
        _add_goal(session, title="Rust", type_=GoalType.learning, external_key="rust")
        session.commit()

    bundle = export_service.build_export_bundle()
    md = bundle["markdown"]

    assert md.index("Promo") < md.index("Run")
    assert md.index("Rust") < md.index("Run")


# ---------------------------------------------------------------------------
# 7. EXPORT-05 calendar privacy + stalled goals section.
# ---------------------------------------------------------------------------
def test_calendar_section_privacy(export_session):
    from app.services import export_service

    # Two events in the next 7 days; titles must NEVER appear (D-05).
    tomorrow = date.today() + timedelta(days=1)
    timed_start = datetime.now(timezone.utc) + timedelta(days=2, hours=3)
    with export_session() as session:
        _add_event(
            session,
            google_id="evt-allday",
            title="DENTIST APPOINTMENT",
            start_date=tomorrow.isoformat(),
            all_day=True,
        )
        _add_event(
            session,
            google_id="evt-timed",
            title="DENTIST APPOINTMENT",
            start_dt=timed_start,
            all_day=False,
        )

        # A stalled goal: active goal + linked non-habit task that was never completed.
        stalled = _add_goal(
            session, title="Stalled goal", type_=GoalType.career, external_key="stalled"
        )
        _add_task(
            session,
            title="Untouched task",
            goal_id=stalled.id,
            is_habit=False,
            completed=False,
            completed_at=None,
        )
        session.commit()

    bundle = export_service.build_export_bundle()
    md = bundle["markdown"]

    assert "DENTIST APPOINTMENT" not in md  # D-05 privacy
    assert "Calendar" in md
    assert any(ch.isdigit() for ch in md)  # per-day count present
    assert "Stalled" in md
    assert "Stalled goal" in md


# ---------------------------------------------------------------------------
# 8. EXPORT-04 integration -- graceful degradation when no snapshots exist.
# ---------------------------------------------------------------------------
def test_trend_no_data(export_session):
    from app.services import export_service

    with export_session() as session:
        _add_goal(
            session, title="No history goal", type_=GoalType.career, external_key="no-history"
        )
        # Intentionally seed ZERO GoalProgressSnapshot rows.
        assert session.query(GoalProgressSnapshot).count() == 0
        session.commit()

    bundle = export_service.build_export_bundle()
    md = bundle["markdown"]

    assert "no_data" in md
