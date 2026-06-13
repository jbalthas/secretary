"""
Tests for app.services.brief (Plan 05-01 RED scaffold).

Patch target for session seam: `app.services.brief._Session`
Plan 02 must expose a module-level `_Session` factory in brief.py that
these tests can swap out to inject the test DB.
"""
from datetime import datetime, timezone, date
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base

TEST_SYNC_URL = "sqlite:///./test_secretary.db"


def _make_sync_session():
    engine = create_engine(TEST_SYNC_URL)
    Base.metadata.create_all(engine)
    return sessionmaker(engine)


# ---------------------------------------------------------------------------
# Task 1 — brief calls Pushover with "Good morning" / priority 0 (D-01, D-04)
# ---------------------------------------------------------------------------

def test_send_daily_brief_calls_pushover_good_morning():
    """D-01 title='Good morning', D-04 priority=0."""
    from app.services.brief import send_daily_brief  # noqa: PLC0415

    with patch("app.services.brief.PushoverClient") as MockClient:
        mock_instance = MagicMock()
        MockClient.return_value = mock_instance

        send_daily_brief()

    mock_instance.send.assert_called_once()
    call_kwargs = mock_instance.send.call_args
    args, kwargs = call_kwargs
    # Support both positional and keyword call styles
    title = kwargs.get("title", args[0] if args else None)
    priority = kwargs.get("priority", None)
    assert title == "Good morning"
    assert priority == 0


# ---------------------------------------------------------------------------
# Task 2 — empty brief body (D-02)
# ---------------------------------------------------------------------------

def test_build_brief_body_empty_returns_placeholder():
    """D-02: no tasks, no events -> 'Nothing scheduled today.'"""
    from app.services.brief import build_brief_body  # noqa: PLC0415

    SyncSession = _make_sync_session()

    with patch("app.services.brief._Session", SyncSession):
        # Clear all tasks and events for a clean state
        from app.models import Task  # noqa: PLC0415
        from app.models.calendar import CalendarEvent  # noqa: PLC0415

        with SyncSession() as s:
            s.query(Task).delete()
            s.query(CalendarEvent).delete()
            s.commit()

        body = build_brief_body()

    assert body == "Nothing scheduled today."


# ---------------------------------------------------------------------------
# Task 3 — timed calendar event formatted as "HH:MM Title" (D-03)
# ---------------------------------------------------------------------------

def test_build_brief_body_timed_event_format():
    """D-03: timed event today at 08:30 -> body contains '08:30 Team standup'."""
    from app.services.brief import build_brief_body  # noqa: PLC0415
    from app.models import Task  # noqa: PLC0415
    from app.models.calendar import CalendarEvent  # noqa: PLC0415

    SyncSession = _make_sync_session()

    today = date.today()
    event_dt = datetime(today.year, today.month, today.day, 8, 30, tzinfo=timezone.utc)

    with SyncSession() as s:
        s.query(Task).delete()
        s.query(CalendarEvent).delete()
        s.add(CalendarEvent(
            google_id="e1",
            title="Team standup",
            start_dt=event_dt,
            all_day=False,
            cancelled=False,
            start_date=None,
        ))
        s.commit()

    with patch("app.services.brief._Session", SyncSession):
        body = build_brief_body()

    assert "08:30 Team standup" in body

    # Cleanup
    with SyncSession() as s:
        s.query(CalendarEvent).filter_by(google_id="e1").delete()
        s.commit()


# ---------------------------------------------------------------------------
# Task 4 — untimed task formatted as "* Title" (D-03)
# ---------------------------------------------------------------------------

def test_build_brief_body_untimed_task_bullet():
    """D-03: pending task due today -> body contains '* Call dentist'."""
    from app.services.brief import build_brief_body  # noqa: PLC0415
    from app.models import Task  # noqa: PLC0415
    from app.models.calendar import CalendarEvent  # noqa: PLC0415

    SyncSession = _make_sync_session()

    today = date.today()
    due = datetime(today.year, today.month, today.day, 0, 0, tzinfo=timezone.utc)

    with SyncSession() as s:
        s.query(Task).delete()
        s.query(CalendarEvent).delete()
        s.add(Task(title="Call dentist", due_date=due, completed=False))
        s.commit()

    with patch("app.services.brief._Session", SyncSession):
        body = build_brief_body()

    assert "• Call dentist" in body

    # Cleanup
    with SyncSession() as s:
        s.query(Task).filter_by(title="Call dentist").delete()
        s.commit()
