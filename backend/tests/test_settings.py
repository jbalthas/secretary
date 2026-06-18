"""
Tests for GET/PUT /api/v1/settings/brief-time (Plan 05-01 RED scaffold).
Implementation in Plan 02 (routers/settings.py + models AppSettings).
"""
import pytest
from fastapi.testclient import TestClient
from apscheduler.jobstores.memory import MemoryJobStore

from app.main import app
from app.scheduler import scheduler

client = TestClient(app)


@pytest.fixture(autouse=True)
def memory_jobstore():
    scheduler.remove_jobstore("default")
    scheduler.add_jobstore(MemoryJobStore(), "default")
    yield
    for job in scheduler.get_jobs():
        job.remove()


def test_get_brief_time_default():
    """D-05: no settings row -> default 08:00 returned."""
    r = client.get("/api/v1/settings/brief-time")
    assert r.status_code == 200
    data = r.json()
    assert data["hour"] == 8
    assert data["minute"] == 0


def test_set_brief_time():
    """PUT persists new time; subsequent GET returns it."""
    r = client.put("/api/v1/settings/brief-time", json={"hour": 7, "minute": 30})
    assert r.status_code == 200

    r2 = client.get("/api/v1/settings/brief-time")
    assert r2.status_code == 200
    assert r2.json()["hour"] == 7
    assert r2.json()["minute"] == 30


def test_set_brief_time_reschedules_job():
    """D-06: PUT brief-time creates/replaces APScheduler job 'daily_brief'."""
    client.put("/api/v1/settings/brief-time", json={"hour": 6, "minute": 0})
    assert scheduler.get_job("daily_brief") is not None


# ---------------------------------------------------------------------------
# NOTIF-03 — TTS enabled/disabled setting (Phase 06 Wave 0 RED)
# ---------------------------------------------------------------------------

def test_get_tts_enabled():
    """NOTIF-03: GET /api/v1/settings/tts returns {"tts_enabled": true} by default.

    Plan 02 must implement GET /api/v1/settings/tts returning the current
    tts_enabled value from the AppSettings row (default True).
    """
    r = client.get("/api/v1/settings/tts")
    assert r.status_code == 200
    assert r.json() == {"tts_enabled": True}


def test_set_tts_enabled():
    """NOTIF-03: PUT /api/v1/settings/tts {"tts_enabled": false} returns 200
    and subsequent GET returns false.

    Plan 02 must implement PUT /api/v1/settings/tts that persists the value
    to the AppSettings row (upsert id=1 pattern).
    """
    r = client.put("/api/v1/settings/tts", json={"tts_enabled": False})
    assert r.status_code == 200

    r2 = client.get("/api/v1/settings/tts")
    assert r2.status_code == 200
    assert r2.json()["tts_enabled"] is False


# ---------------------------------------------------------------------------
# GUIDE-03 — stall threshold setting (Phase 11 Wave 0)
# ---------------------------------------------------------------------------

def test_stall_threshold_roundtrip():
    """D-11: PUT then GET /settings/stall-threshold returns the saved value."""
    r = client.put("/api/v1/settings/stall-threshold", json={"stall_threshold_days": 14})
    assert r.status_code == 200
    assert r.json()["stall_threshold_days"] == 14

    r2 = client.get("/api/v1/settings/stall-threshold")
    assert r2.status_code == 200
    assert r2.json()["stall_threshold_days"] == 14
