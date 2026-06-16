"""
Tests for weekly brief functions (NOTIF-06 extension).

Patch seams:
  - Builder session:  app.services.brief._Session
  - TTS flag:         app.services.tts_settings.get_tts_enabled
  - Webhook routing:  app.routers.webhooks.send_weekly_brief
                      app.routers.webhooks.send_daily_brief
                      app.routers.webhooks.settings
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from apscheduler.jobstores.memory import MemoryJobStore
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.main import app
from app.scheduler import scheduler

client = TestClient(app)

TEST_SYNC_URL = "sqlite:///./test_secretary.db"


@pytest.fixture(autouse=True)
def memory_jobstore():
    scheduler.remove_jobstore("default")
    scheduler.add_jobstore(MemoryJobStore(), "default")
    yield
    for job in scheduler.get_jobs():
        job.remove()


def _make_session():
    engine = create_engine(TEST_SYNC_URL)
    Base.metadata.create_all(engine)
    return sessionmaker(engine)


# ---------------------------------------------------------------------------
# Builder tests — patch brief._Session to control DB state
# ---------------------------------------------------------------------------

def test_build_week_speech_groups_by_day():
    from app.models import Task
    from app.models.calendar import CalendarEvent
    from app.services.brief import build_week_speech

    Session = _make_session()
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_weekday = today_start.strftime("%A")
    tomorrow_start = today_start + timedelta(days=1)
    tomorrow_weekday = tomorrow_start.strftime("%A")

    event = CalendarEvent(
        google_id="test-speech-evt-today",
        title="Morning Standup",
        start_dt=today_start.replace(hour=9, minute=0),
        end_dt=today_start.replace(hour=10, minute=0),
        all_day=False,
        cancelled=False,
    )
    task = Task(
        title="Weekly Review",
        completed=False,
        due_date=tomorrow_start.replace(hour=0, minute=0),
    )

    with Session() as s:
        s.add(event)
        s.add(task)
        s.commit()
        task_id = task.id

    try:
        with patch("app.services.brief._Session", Session):
            result = build_week_speech()

        assert today_weekday in result
        assert "Morning Standup" in result
        assert tomorrow_weekday in result
        assert "Weekly Review" in result
        # days with no entries should not appear — check a day with no data
        # (we can't guarantee which days are empty without knowing full DB state,
        # but we can verify the two seeded days are present)
        assert "Good morning. This week." in result
    finally:
        with Session() as s:
            s.delete(s.get(CalendarEvent, "test-speech-evt-today"))
            t = s.get(Task, task_id)
            if t:
                s.delete(t)
            s.commit()


def test_build_week_body_groups_by_day():
    from app.models import Task
    from app.models.calendar import CalendarEvent
    from app.services.brief import build_week_body

    Session = _make_session()
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_weekday = today_start.strftime("%A")
    tomorrow_start = today_start + timedelta(days=1)
    tomorrow_weekday = tomorrow_start.strftime("%A")

    event = CalendarEvent(
        google_id="test-body-evt-today",
        title="Team Sync",
        start_dt=today_start.replace(hour=9, minute=0),
        end_dt=today_start.replace(hour=10, minute=0),
        all_day=False,
        cancelled=False,
    )
    task = Task(
        title="Send Report",
        completed=False,
        due_date=tomorrow_start.replace(hour=0, minute=0),
    )

    with Session() as s:
        s.add(event)
        s.add(task)
        s.commit()
        task_id = task.id

    try:
        with patch("app.services.brief._Session", Session):
            result = build_week_body()

        assert f"{today_weekday}:" in result
        assert "09:00 Team Sync" in result
        assert f"{tomorrow_weekday}:" in result
        assert "• Send Report" in result
    finally:
        with Session() as s:
            s.delete(s.get(CalendarEvent, "test-body-evt-today"))
            t = s.get(Task, task_id)
            if t:
                s.delete(t)
            s.commit()


def test_build_week_empty():
    from app.services.brief import build_week_speech, build_week_body

    # Use an isolated in-memory engine with no rows
    empty_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(empty_engine)
    EmptySession = sessionmaker(empty_engine)

    with patch("app.services.brief._Session", EmptySession):
        speech = build_week_speech()
        body = build_week_body()

    assert speech == "Good morning. Nothing scheduled this week."
    assert body == "Nothing scheduled this week."


# ---------------------------------------------------------------------------
# Webhook routing tests
# ---------------------------------------------------------------------------

def test_webhook_range_week_routes_weekly():
    with patch("app.routers.webhooks.settings") as mock_settings, \
         patch("app.routers.webhooks.send_weekly_brief") as mock_weekly, \
         patch("app.routers.webhooks.send_daily_brief") as mock_daily:
        mock_settings.webhook_secret = "test-secret"

        r = client.post(
            "/api/v1/webhooks/brief",
            params={"range": "week"},
            headers={"X-Webhook-Secret": "test-secret"},
        )

    assert r.status_code == 200
    mock_weekly.assert_called_once()
    mock_daily.assert_not_called()


def test_webhook_range_default_routes_daily():
    with patch("app.routers.webhooks.settings") as mock_settings, \
         patch("app.routers.webhooks.send_weekly_brief") as mock_weekly, \
         patch("app.routers.webhooks.send_daily_brief") as mock_daily:
        mock_settings.webhook_secret = "test-secret"

        r = client.post(
            "/api/v1/webhooks/brief",
            headers={"X-Webhook-Secret": "test-secret"},
        )

    assert r.status_code == 200
    mock_daily.assert_called_once()
    mock_weekly.assert_not_called()


def test_webhook_range_bad_secret():
    with patch("app.routers.webhooks.settings") as mock_settings, \
         patch("app.routers.webhooks.send_weekly_brief") as mock_weekly, \
         patch("app.routers.webhooks.send_daily_brief") as mock_daily:
        mock_settings.webhook_secret = "test-secret"

        r = client.post(
            "/api/v1/webhooks/brief",
            params={"range": "week"},
            headers={"X-Webhook-Secret": "wrong-secret"},
        )

    assert r.status_code == 403
    mock_weekly.assert_not_called()
    mock_daily.assert_not_called()


def test_webhook_range_invalid_value():
    with patch("app.routers.webhooks.settings") as mock_settings, \
         patch("app.routers.webhooks.send_weekly_brief") as mock_weekly, \
         patch("app.routers.webhooks.send_daily_brief") as mock_daily:
        mock_settings.webhook_secret = "test-secret"

        r = client.post(
            "/api/v1/webhooks/brief",
            params={"range": "month"},
            headers={"X-Webhook-Secret": "test-secret"},
        )

    assert r.status_code == 422
    mock_weekly.assert_not_called()
    mock_daily.assert_not_called()
