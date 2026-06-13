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
