from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_create_with_reminder_schedules(monkeypatch):
    calls = []

    def fake_upsert(task):
        calls.append(task)

    monkeypatch.setattr("app.routers.tasks.upsert_reminder", fake_upsert)

    r = client.post(
        "/api/v1/tasks/",
        json={"title": "Meeting", "reminder_at": "2030-06-15T09:00:00Z"},
    )
    assert r.status_code == 201
    assert len(calls) == 1
    assert calls[0].reminder_at is not None


def test_create_without_reminder(monkeypatch):
    calls = []

    def fake_upsert(task):
        calls.append(task)

    monkeypatch.setattr("app.routers.tasks.upsert_reminder", fake_upsert)

    r = client.post("/api/v1/tasks/", json={"title": "No reminder"})
    assert r.status_code == 201
    assert len(calls) == 1


def test_complete_removes_reminder(monkeypatch):
    create = client.post("/api/v1/tasks/", json={"title": "Finish report"})
    task_id = create.json()["id"]

    remove_calls = []

    def fake_remove(tid):
        remove_calls.append(tid)

    monkeypatch.setattr("app.routers.tasks.remove_reminder", fake_remove)
    monkeypatch.setattr("app.routers.tasks.upsert_reminder", lambda t: None)

    r = client.patch(f"/api/v1/tasks/{task_id}", json={"completed": True})
    assert r.status_code == 200
    assert task_id in remove_calls


def test_delete_removes_reminder(monkeypatch):
    create = client.post("/api/v1/tasks/", json={"title": "Delete me"})
    task_id = create.json()["id"]

    remove_calls = []

    def fake_remove(tid):
        remove_calls.append(tid)

    monkeypatch.setattr("app.routers.tasks.remove_reminder", fake_remove)

    r = client.delete(f"/api/v1/tasks/{task_id}")
    assert r.status_code == 204
    assert task_id in remove_calls


def test_clear_reminder_via_update(monkeypatch):
    create = client.post(
        "/api/v1/tasks/",
        json={"title": "Meeting", "reminder_at": "2030-06-15T09:00:00Z"},
    )
    task_id = create.json()["id"]

    upsert_calls = []
    remove_calls = []

    def fake_upsert(task):
        upsert_calls.append(task)

    def fake_remove(tid):
        remove_calls.append(tid)

    monkeypatch.setattr("app.routers.tasks.upsert_reminder", fake_upsert)
    monkeypatch.setattr("app.routers.tasks.remove_reminder", fake_remove)

    r = client.patch(f"/api/v1/tasks/{task_id}", json={"reminder_at": None})
    assert r.status_code == 200
    assert len(upsert_calls) == 1
    assert len(remove_calls) == 0
