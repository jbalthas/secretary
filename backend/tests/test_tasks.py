import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_create_task():
    r = client.post("/api/v1/tasks/", json={"title": "Buy milk", "priority": "high"})
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Buy milk"
    assert data["priority"] == "high"
    assert data["completed"] is False
    assert "id" in data
    assert "created_at" in data


def test_list_tasks():
    client.post("/api/v1/tasks/", json={"title": "Task A"})
    client.post("/api/v1/tasks/", json={"title": "Task B"})
    r = client.get("/api/v1/tasks/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    titles = [t["title"] for t in r.json()]
    assert "Task A" in titles
    assert "Task B" in titles


def test_update_task():
    create = client.post("/api/v1/tasks/", json={"title": "Original"})
    task_id = create.json()["id"]
    r = client.patch(f"/api/v1/tasks/{task_id}", json={"title": "Updated"})
    assert r.status_code == 200
    assert r.json()["title"] == "Updated"


def test_complete_task():
    create = client.post("/api/v1/tasks/", json={"title": "Do laundry"})
    task_id = create.json()["id"]
    r = client.patch(f"/api/v1/tasks/{task_id}", json={"completed": True})
    assert r.status_code == 200
    assert r.json()["completed"] is True


def test_delete_task():
    create = client.post("/api/v1/tasks/", json={"title": "Delete me"})
    task_id = create.json()["id"]
    r = client.delete(f"/api/v1/tasks/{task_id}")
    assert r.status_code == 204
    r2 = client.delete(f"/api/v1/tasks/{task_id}")
    assert r2.status_code == 404


def test_task_reminder_stored():
    r = client.post(
        "/api/v1/tasks/",
        json={"title": "Meeting", "reminder_at": "2026-06-15T09:00:00Z"},
    )
    assert r.status_code == 201
    assert r.json()["reminder_at"] is not None


def test_task_recurrence_stored():
    r = client.post(
        "/api/v1/tasks/",
        json={"title": "Daily standup", "recurrence_cron": "0 9 * * 1-5"},
    )
    assert r.status_code == 201
    assert r.json()["recurrence_cron"] == "0 9 * * 1-5"


def test_task_estimated_minutes_stored():
    r = client.post(
        "/api/v1/tasks/",
        json={"title": "Write report", "estimated_minutes": 45},
    )
    assert r.status_code == 201
    assert r.json()["estimated_minutes"] == 45


def test_task_estimated_minutes_defaults_null():
    r = client.post("/api/v1/tasks/", json={"title": "No estimate"})
    assert r.status_code == 201
    assert r.json()["estimated_minutes"] is None


def test_task_estimated_minutes_patch():
    create = client.post(
        "/api/v1/tasks/",
        json={"title": "Resize me", "estimated_minutes": 45},
    )
    task_id = create.json()["id"]
    r = client.patch(f"/api/v1/tasks/{task_id}", json={"estimated_minutes": 90})
    assert r.status_code == 200
    assert r.json()["estimated_minutes"] == 90


def test_completed_at_stamped():
    """D-09: PATCH completed=True stamps completed_at; idempotent re-PATCH does not change it."""
    create = client.post("/api/v1/tasks/", json={"title": "Stamp me"})
    task_id = create.json()["id"]

    r1 = client.patch(f"/api/v1/tasks/{task_id}", json={"completed": True})
    assert r1.status_code == 200
    data1 = r1.json()
    assert data1["completed"] is True
    assert data1["completed_at"] is not None
    first_stamp = data1["completed_at"]

    r2 = client.patch(f"/api/v1/tasks/{task_id}", json={"completed": True})
    assert r2.status_code == 200
    assert r2.json()["completed_at"] == first_stamp


def test_unlink_task_from_goal():
    g = client.post("/api/v1/goals/", json={"title": "Ship v2", "type": "learning"}).json()
    t = client.post("/api/v1/tasks/", json={"title": "Linked", "goal_id": g["id"]}).json()
    assert t["goal_id"] == g["id"]

    r = client.patch(f"/api/v1/tasks/{t['id']}", json={"goal_id": None})
    assert r.status_code == 200
    assert r.json()["goal_id"] is None

    tasks = client.get("/api/v1/tasks/").json()
    found = next(task for task in tasks if task["id"] == t["id"])
    assert found["goal_id"] is None
