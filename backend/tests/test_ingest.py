import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def _payload(**overrides):
    base = {
        "schema_version": "1.0",
        "goals": [{"external_key": "learn-guitar-2026", "title": "Learn Guitar", "type": "learning"}],
        "tasks": [{"external_key": "learn-guitar-2026/practice-chords", "goal_key": "learn-guitar-2026", "title": "Practice chords"}],
        "routines": [],
        "habits": [],
    }
    base.update(overrides)
    return base


def test_schema_endpoint():
    r = client.get("/api/v1/ingest/schema")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    assert "properties" in body
    assert "schema_version" in body["properties"]
    assert "required" in body


def test_schema_version_mismatch():
    r = client.post("/api/v1/ingest/confirm", json=_payload(schema_version="2.0"))
    assert r.status_code == 422
    detail = r.json()["detail"]
    locs = [str(e["loc"]) for e in detail]
    assert any("schema_version" in loc for loc in locs)


def test_extra_field_rejected():
    payload = _payload()
    payload["goals"][0]["color"] = "red"
    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code == 422


def test_invalid_cron_rejected():
    payload = _payload(
        habits=[{
            "external_key": "h1",
            "title": "Stretch",
            "recurrence_cron": "not a cron",
        }]
    )
    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code == 422


def test_confirm_writes_all():
    payload = _payload(
        goals=[{"external_key": "g-writes-all", "title": "Writes All Goal", "type": "career"}],
        tasks=[{"external_key": "g-writes-all/task-1", "goal_key": "g-writes-all", "title": "Task One"}],
        routines=[{"external_key": "g-writes-all/routine-1", "goal_key": "g-writes-all", "name": "Morning Review", "cron": "0 8 * * *"}],
        habits=[{"external_key": "g-writes-all/habit-1", "goal_key": "g-writes-all", "title": "Daily Stretch", "recurrence_cron": "0 7 * * *"}],
    )
    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["created"]["goals"] == 1
    assert body["created"]["tasks"] == 1
    assert body["created"]["routines"] == 1
    assert body["created"]["habits"] == 1
    goals = client.get("/api/v1/goals/").json()
    goal_keys = [g.get("external_key") for g in goals]
    assert "g-writes-all" in goal_keys
    tasks = client.get("/api/v1/tasks/").json()
    task_keys = [t.get("external_key") for t in tasks]
    assert "g-writes-all/task-1" in task_keys


def test_rollback_on_mid_commit_failure(monkeypatch):
    from app.services import ingest_service

    goals_before = client.get("/api/v1/goals/").json()
    goal_external_keys_before = {g.get("external_key") for g in goals_before}

    call_count = 0
    original = ingest_service._upsert_task

    async def _fail_on_second(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise RuntimeError("simulated mid-commit failure")
        return await original(*args, **kwargs)

    monkeypatch.setattr("app.services.ingest_service._upsert_task", _fail_on_second)

    payload = _payload(
        goals=[{"external_key": "rollback-goal-2026", "title": "Rollback Goal", "type": "life"}],
        tasks=[
            {"external_key": "rollback-goal-2026/task-1", "goal_key": "rollback-goal-2026", "title": "Task One"},
            {"external_key": "rollback-goal-2026/task-2", "goal_key": "rollback-goal-2026", "title": "Task Two"},
        ],
    )

    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code >= 400

    goals_after = client.get("/api/v1/goals/").json()
    goal_external_keys_after = {g.get("external_key") for g in goals_after}
    assert "rollback-goal-2026" not in goal_external_keys_after


def test_idempotent_reimport():
    payload = _payload(
        goals=[{"external_key": "idempotent-goal-2026", "title": "Idempotent Goal", "type": "learning"}],
        tasks=[{"external_key": "idempotent-goal-2026/task-1", "goal_key": "idempotent-goal-2026", "title": "Idempotent Task"}],
    )
    client.post("/api/v1/ingest/confirm", json=payload)
    r2 = client.post("/api/v1/ingest/confirm", json=payload)
    assert r2.status_code == 200
    body = r2.json()
    assert body["created"]["goals"] == 0
    assert body["updated"]["goals"] == 1
    goals = client.get("/api/v1/goals/").json()
    matching = [g for g in goals if g.get("external_key") == "idempotent-goal-2026"]
    assert len(matching) == 1


def test_preserves_completed_on_reimport():
    payload = _payload(
        goals=[{"external_key": "preserve-complete-goal", "title": "Preserve Completed Goal", "type": "health"}],
        tasks=[{"external_key": "preserve-complete-goal/task-1", "goal_key": "preserve-complete-goal", "title": "Preserve Task"}],
    )
    client.post("/api/v1/ingest/confirm", json=payload)
    tasks = client.get("/api/v1/tasks/").json()
    task = next(t for t in tasks if t.get("external_key") == "preserve-complete-goal/task-1")
    task_id = task["id"]
    client.patch(f"/api/v1/tasks/{task_id}", json={"completed": True})
    client.post("/api/v1/ingest/confirm", json=payload)
    tasks_after = client.get("/api/v1/tasks/").json()
    task_after = next(t for t in tasks_after if t["id"] == task_id)
    assert task_after["completed"] is True


def test_habits_created():
    payload = _payload(
        goals=[{"external_key": "habit-goal-2026", "title": "Habit Goal", "type": "health"}],
        tasks=[],
        habits=[{
            "external_key": "habit-goal-2026/stretch",
            "goal_key": "habit-goal-2026",
            "title": "Stretch",
            "recurrence_cron": "0 7 * * *",
        }],
    )
    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code == 200
    tasks = client.get("/api/v1/tasks/").json()
    habit_task = next(
        (t for t in tasks if t.get("external_key") == "habit-goal-2026/stretch"),
        None,
    )
    assert habit_task is not None
    assert habit_task.get("is_habit") is True
    assert habit_task.get("recurrence_cron") == "0 7 * * *"


def test_habit_goal_linkage():
    payload = _payload(
        goals=[{"external_key": "habit-link-goal", "title": "Habit Linkage Goal", "type": "life"}],
        tasks=[],
        habits=[{
            "external_key": "habit-link-goal/daily-run",
            "goal_key": "habit-link-goal",
            "title": "Daily Run",
            "recurrence_cron": "0 6 * * *",
        }],
    )
    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code == 200
    goals = client.get("/api/v1/goals/").json()
    goal = next(g for g in goals if g.get("external_key") == "habit-link-goal")
    goal_id = goal["id"]
    tasks = client.get("/api/v1/tasks/").json()
    habit_task = next(t for t in tasks if t.get("external_key") == "habit-link-goal/daily-run")
    assert habit_task.get("goal_id") == goal_id
