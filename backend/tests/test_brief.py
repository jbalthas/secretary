"""
Tests for app.services.brief (Plan 05-01 RED scaffold + Phase 06 Wave 0 RED).

Patch target for session seam: `app.services.brief._Session`
Plan 02 must expose a module-level `_Session` factory in brief.py that
these tests can swap out to inject the test DB.

Phase 06 patch seams:
  - TTS client:        app.services.brief.TTSClient
  - TTS flag:          app.services.tts_settings.get_tts_enabled

Plan 02 must import TTSClient at module top of app/services/brief.py:
    from app.services.tts import TTSClient

Plan 03 must expose get_tts_enabled() in app/services/tts_settings.py.
Plan 02 must add build_brief_speech() function to app/services/brief.py.
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


# ---------------------------------------------------------------------------
# NOTIF-05 — build_brief_speech + TTS integration (Phase 06 Wave 0 RED)
# ---------------------------------------------------------------------------

def test_build_brief_speech_empty():
    """NOTIF-05: no tasks/events → build_brief_speech() == "Good morning. Nothing scheduled today."

    Plan 02 must add build_brief_speech() to app/services/brief.py that:
      - Calls build_brief_body() to get the text body
      - Wraps it in natural-language speech format
      - Returns "Good morning. Nothing scheduled today." when body is empty
    """
    from app.services.brief import build_brief_speech  # noqa: PLC0415

    SyncSession = _make_sync_session()

    with patch("app.services.brief._Session", SyncSession):
        from app.models import Task  # noqa: PLC0415
        from app.models.calendar import CalendarEvent  # noqa: PLC0415

        with SyncSession() as s:
            s.query(Task).delete()
            s.query(CalendarEvent).delete()
            s.commit()

        result = build_brief_speech()

    assert result == "Good morning. Nothing scheduled today."


def test_build_brief_speech_format():
    """NOTIF-05: one timed event "Team standup" at 08:30 + one untimed task "Call dentist"
    → result starts "Good morning." contains "Team standup" and "Call dentist",
    has NO "08:30" and NO "•" bullet character.

    build_brief_speech must strip the HH:MM prefix and bullet markers from
    build_brief_body output, and join items with ". ".
    """
    from app.services.brief import build_brief_speech  # noqa: PLC0415
    from app.models import Task  # noqa: PLC0415
    from app.models.calendar import CalendarEvent  # noqa: PLC0415

    SyncSession = _make_sync_session()

    today = date.today()
    event_dt = datetime(today.year, today.month, today.day, 8, 30, tzinfo=timezone.utc)
    due = datetime(today.year, today.month, today.day, 0, 0, tzinfo=timezone.utc)

    with SyncSession() as s:
        s.query(Task).delete()
        s.query(CalendarEvent).delete()
        s.add(CalendarEvent(
            google_id="e-speech-1",
            title="Team standup",
            start_dt=event_dt,
            all_day=False,
            cancelled=False,
            start_date=None,
        ))
        s.add(Task(title="Call dentist", due_date=due, completed=False))
        s.commit()

    with patch("app.services.brief._Session", SyncSession):
        result = build_brief_speech()

    assert result.startswith("Good morning.")
    assert "Team standup" in result
    assert "Call dentist" in result
    assert "08:30" not in result
    assert "•" not in result

    # Cleanup
    with SyncSession() as s:
        s.query(CalendarEvent).filter_by(google_id="e-speech-1").delete()
        s.query(Task).filter_by(title="Call dentist").delete()
        s.commit()


def test_brief_calls_tts():
    """NOTIF-05: tts_enabled=True → send_daily_brief() calls TTSClient.speak once
    with a string starting "Good morning.".

    Plan 02 must import TTSClient at module top of app/services/brief.py so that
    patching app.services.brief.TTSClient replaces the class at call time.
    Plan 03 must expose get_tts_enabled() in app/services/tts_settings.py.
    """
    from app.services.brief import send_daily_brief  # noqa: PLC0415

    with patch("app.services.brief.TTSClient") as MockTTS, \
         patch("app.services.tts_settings.get_tts_enabled", return_value=True), \
         patch("app.services.brief.PushoverClient"):
        mock_instance = MagicMock()
        MockTTS.return_value = mock_instance

        send_daily_brief()

    mock_instance.speak.assert_called_once()
    speech_arg = mock_instance.speak.call_args[0][0]
    assert speech_arg.startswith("Good morning.")


def test_brief_tts_failure_swallowed():
    """NOTIF-05: TTSClient.speak raises → send_daily_brief MUST NOT raise;
    Pushover send must still be called.

    Plan 03 must wrap the TTSClient.speak call in a try/except Exception
    inside send_daily_brief.
    """
    from app.services.brief import send_daily_brief  # noqa: PLC0415

    with patch("app.services.brief.TTSClient") as MockTTS, \
         patch("app.services.tts_settings.get_tts_enabled", return_value=True), \
         patch("app.services.brief.PushoverClient") as MockPushover:
        mock_tts_instance = MagicMock()
        mock_tts_instance.speak.side_effect = RuntimeError("cast failed")
        MockTTS.return_value = mock_tts_instance

        mock_pushover_instance = MagicMock()
        MockPushover.return_value = mock_pushover_instance

        try:
            send_daily_brief()
        except Exception as exc:
            pytest.fail(f"send_daily_brief raised unexpectedly: {exc}")

    mock_pushover_instance.send.assert_called_once()
