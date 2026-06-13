"""
Tests for /api/v1/routines/ CRUD (Plan 05-01 RED scaffold).
Implementation in Plan 02 (routers/routines.py + models Routine).
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


def test_create_routine():
    """D-11: create routine -> 201, id present, APScheduler job 'routine_{id}' added."""
    r = client.post("/api/v1/routines/", json={
        "name": "Evening review",
        "cron": "0 18 * * *",
        "action": "send_daily_brief",
    })
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    routine_id = data["id"]
    assert scheduler.get_job(f"routine_{routine_id}") is not None


def test_list_routines():
    """GET /api/v1/routines/ returns list containing created routine."""
    client.post("/api/v1/routines/", json={
        "name": "Morning check",
        "cron": "0 7 * * *",
        "action": "send_daily_brief",
    })
    r = client.get("/api/v1/routines/")
    assert r.status_code == 200
    names = [item["name"] for item in r.json()]
    assert "Morning check" in names


def test_update_routine():
    """PATCH cron -> 200, updated cron in response, job still present."""
    create = client.post("/api/v1/routines/", json={
        "name": "Review",
        "cron": "0 18 * * *",
        "action": "send_daily_brief",
    })
    routine_id = create.json()["id"]

    r = client.patch(f"/api/v1/routines/{routine_id}", json={"cron": "30 18 * * *"})
    assert r.status_code == 200
    assert r.json()["cron"] == "30 18 * * *"
    assert scheduler.get_job(f"routine_{routine_id}") is not None


def test_delete_routine():
    """DELETE -> 204, APScheduler job removed; second delete -> 404."""
    create = client.post("/api/v1/routines/", json={
        "name": "To delete",
        "cron": "0 20 * * *",
        "action": "send_daily_brief",
    })
    routine_id = create.json()["id"]

    r = client.delete(f"/api/v1/routines/{routine_id}")
    assert r.status_code == 204
    assert scheduler.get_job(f"routine_{routine_id}") is None

    r2 = client.delete(f"/api/v1/routines/{routine_id}")
    assert r2.status_code == 404


def test_create_routine_invalid_cron():
    """Pitfall 4: invalid cron expression -> 422, not 500."""
    r = client.post("/api/v1/routines/", json={
        "name": "Bad",
        "cron": "every day 8am",
        "action": "send_daily_brief",
    })
    assert r.status_code == 422
