import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _link_task(task_id: int, goal_id: int) -> None:
    client.patch(f"/api/v1/tasks/{task_id}", json={"goal_id": goal_id})


def test_create_goal():
    r = client.post("/api/v1/goals/", json={"title": "Learn Guitar", "type": "learning"})
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    assert data["status"] == "active"
    assert data["progress_pct"] == 0


def test_archive_goal():
    r = client.post("/api/v1/goals/", json={"title": "Run a Marathon", "type": "health"})
    goal_id = r.json()["id"]
    r2 = client.patch(f"/api/v1/goals/{goal_id}", json={"status": "archived"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "archived"


def test_no_hard_delete():
    r = client.post("/api/v1/goals/", json={"title": "Persistent Goal", "type": "career"})
    goal_id = r.json()["id"]
    client.patch(f"/api/v1/goals/{goal_id}", json={"status": "archived"})
    goals = client.get("/api/v1/goals/").json()
    ids = [g["id"] for g in goals]
    assert goal_id in ids


def test_progress_tasks_only():
    r = client.post("/api/v1/goals/", json={"title": "Progress Task Goal", "type": "learning"})
    goal_id = r.json()["id"]
    t1 = client.post("/api/v1/tasks/", json={"title": "Task 1"}).json()["id"]
    t2 = client.post("/api/v1/tasks/", json={"title": "Task 2"}).json()["id"]
    _link_task(t1, goal_id)
    _link_task(t2, goal_id)
    client.patch(f"/api/v1/tasks/{t1}", json={"completed": True})
    r2 = client.get(f"/api/v1/goals/{goal_id}")
    assert r2.status_code == 200
    assert r2.json()["progress_pct"] == 50


def test_progress_no_items():
    r = client.post("/api/v1/goals/", json={"title": "Empty Goal", "type": "financial"})
    goal_id = r.json()["id"]
    r2 = client.get(f"/api/v1/goals/{goal_id}")
    assert r2.status_code == 200
    assert r2.json()["progress_pct"] == 0


def test_progress_milestones_count():
    r = client.post("/api/v1/goals/", json={"title": "Milestone Progress Goal", "type": "life"})
    goal_id = r.json()["id"]
    ms1 = client.post(f"/api/v1/goals/{goal_id}/milestones", json={"title": "Milestone A"}).json()["id"]
    ms2 = client.post(f"/api/v1/goals/{goal_id}/milestones", json={"title": "Milestone B"}).json()["id"]
    client.patch(f"/api/v1/goals/{goal_id}/milestones/{ms1}", json={"done": True})
    r2 = client.get(f"/api/v1/goals/{goal_id}")
    assert r2.status_code == 200
    assert r2.json()["progress_pct"] == 50


def test_milestone_crud():
    r = client.post("/api/v1/goals/", json={"title": "CRUD Goal", "type": "career"})
    goal_id = r.json()["id"]
    r2 = client.post(f"/api/v1/goals/{goal_id}/milestones", json={"title": "First Milestone"})
    assert r2.status_code == 201
    ms_id = r2.json()["id"]
    r3 = client.patch(f"/api/v1/goals/{goal_id}/milestones/{ms_id}", json={"done": True})
    assert r3.status_code == 200
    assert r3.json()["done"] is True
    r4 = client.get(f"/api/v1/goals/{goal_id}")
    ms_ids = [m["id"] for m in r4.json()["milestones"]]
    assert ms_id in ms_ids


def test_milestone_celebration(monkeypatch):
    calls = []

    def _recorder(milestone_title: str, goal_title: str) -> None:
        calls.append((milestone_title, goal_title))

    monkeypatch.setattr("app.services.celebrate.fire_milestone_celebration", _recorder)

    r = client.post("/api/v1/goals/", json={"title": "Celebrate Milestone Goal", "type": "health"})
    goal_id = r.json()["id"]
    r2 = client.post(f"/api/v1/goals/{goal_id}/milestones", json={"title": "Key Milestone"})
    ms_id = r2.json()["id"]
    client.patch(f"/api/v1/goals/{goal_id}/milestones/{ms_id}", json={"done": True})
    assert len(calls) == 1
    assert calls[0] == ("Key Milestone", "Celebrate Milestone Goal")


def test_goal_completion_celebration(monkeypatch):
    calls = []

    def _recorder(goal_title: str) -> None:
        calls.append(goal_title)

    monkeypatch.setattr("app.services.celebrate.fire_goal_celebration", _recorder)

    r = client.post("/api/v1/goals/", json={"title": "Finish Line Goal", "type": "career"})
    goal_id = r.json()["id"]
    client.patch(f"/api/v1/goals/{goal_id}", json={"status": "completed"})
    assert len(calls) == 1
    assert calls[0] == "Finish Line Goal"


def test_no_double_celebration(monkeypatch):
    calls = []

    def _recorder(milestone_title: str, goal_title: str) -> None:
        calls.append((milestone_title, goal_title))

    monkeypatch.setattr("app.services.celebrate.fire_milestone_celebration", _recorder)

    r = client.post("/api/v1/goals/", json={"title": "No Double Goal", "type": "learning"})
    goal_id = r.json()["id"]
    r2 = client.post(f"/api/v1/goals/{goal_id}/milestones", json={"title": "Already Done"})
    ms_id = r2.json()["id"]
    # Mark done once (fires celebration)
    client.patch(f"/api/v1/goals/{goal_id}/milestones/{ms_id}", json={"done": True})
    calls.clear()
    # Mark done again — should NOT fire
    client.patch(f"/api/v1/goals/{goal_id}/milestones/{ms_id}", json={"done": True})
    assert len(calls) == 0
