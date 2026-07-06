"""Phase 12 — Wave 0 test stubs.

All 10 tests are RED until the Wave 2 plans implement the real behaviour.
Imports of the unit-under-test are deferred inside each test body (Phase 08
convention) so collection never fails on ImportError.
"""
import types
from unittest.mock import patch, MagicMock

import pytest
from apscheduler.jobstores.memory import MemoryJobStore
from fastapi.testclient import TestClient

from app.main import app
from app.scheduler import scheduler

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Scheduler fixture — copied from test_scheduler.py (memory_jobstore)
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def memory_jobstore():
    scheduler.remove_jobstore("default")
    scheduler.add_jobstore(MemoryJobStore(), "default")
    yield
    for job in scheduler.get_jobs():
        job.remove()


# ---------------------------------------------------------------------------
# Helper — build in-memory SimpleNamespace blocks / tasks
# ---------------------------------------------------------------------------

def _make_blocks(*titles):
    return [
        types.SimpleNamespace(id=i + 1, title=t, date_key=None, completed=False)
        for i, t in enumerate(titles)
    ]


def _make_tasks(*titles):
    return [
        types.SimpleNamespace(id=100 + i, title=t, completed=False)
        for i, t in enumerate(titles)
    ]


# ---------------------------------------------------------------------------
# Resolution tests (UPDATE-02 / UPDATE-03)
# ---------------------------------------------------------------------------

def test_resolve_clear_match():
    """UPDATE-02: clear match returns resolved + correct entity."""
    from app.services.resolution_service import resolve_update  # noqa: PLC0415

    blocks = _make_blocks("Morning standup prep", "Lunch meeting")
    tasks = _make_tasks("Review PR", "Write weekly report")

    result = resolve_update("done with standup prep", blocks, tasks)

    assert result["status"] == "resolved"
    assert result["action"] == "done"
    assert result["entity_title"] == "Morning standup prep"
    assert result["entity_type"] == "block"


def test_no_http_call():
    """UPDATE-02: resolve_update makes zero external HTTP calls."""
    from app.services.resolution_service import resolve_update  # noqa: PLC0415

    blocks = _make_blocks("Morning standup prep")
    tasks = _make_tasks("Review PR")

    with patch("httpx.Client") as mock_client:
        result = resolve_update("done with standup", blocks, tasks)

    mock_client.assert_not_called()
    assert result["status"] == "resolved"


def test_resolve_ambiguous():
    """UPDATE-03: near-identical titles → ambiguous + candidate list."""
    from app.services.resolution_service import resolve_update  # noqa: PLC0415

    blocks = _make_blocks("Team sync A", "Team sync B")
    tasks = []

    result = resolve_update("team sync", blocks, tasks)

    assert result["status"] == "ambiguous"
    assert len(result["candidates"]) >= 2


def test_resolve_no_match():
    """UPDATE-03: unrelated query → no_match."""
    from app.services.resolution_service import resolve_update  # noqa: PLC0415

    blocks = _make_blocks("Morning standup prep", "Lunch meeting")
    tasks = _make_tasks("Review PR")

    result = resolve_update("buy oranges from the shop", blocks, tasks)

    assert result["status"] == "no_match"


# ---------------------------------------------------------------------------
# Check-in scheduler tests (NOTIF-07)
# ---------------------------------------------------------------------------

def test_schedule_checkin_registers_job():
    """NOTIF-07: schedule_checkin registers job id='mid_day_checkin'."""
    from app.scheduler import schedule_checkin  # noqa: PLC0415

    schedule_checkin(12, 0)

    assert scheduler.get_job("mid_day_checkin") is not None


def test_checkin_notification_includes_url():
    """NOTIF-07: send_checkin_notification calls PushoverClient.send with url kwarg.

    12-03 must:
    - Import PushoverClient at module top of checkin_service.py
    - Call PushoverClient().send(..., url="/today?update=1", ...)
    """
    from app.services.checkin_service import send_checkin_notification  # noqa: PLC0415

    # Once 12-03 adds PushoverClient to checkin_service, patch target resolves.
    # Until then, send_checkin_notification raises NotImplementedError (RED).
    with patch("app.services.pushover.PushoverClient") as MockPushover:
        mock_instance = MagicMock()
        MockPushover.return_value = mock_instance

        send_checkin_notification()

    mock_instance.send.assert_called_once()
    call_kwargs = mock_instance.send.call_args[1]
    assert call_kwargs.get("url") == "/today?update=1"


def test_checkin_time_settings_roundtrip():
    """NOTIF-07: PUT /api/v1/settings/check-in-time persists; GET returns same."""
    r = client.put("/api/v1/settings/check-in-time", json={"hour": 13, "minute": 30})
    assert r.status_code == 200

    r2 = client.get("/api/v1/settings/check-in-time")
    assert r2.status_code == 200
    body = r2.json()
    assert body["hour"] == 13
    assert body["minute"] == 30


# ---------------------------------------------------------------------------
# Ingest extension tests (INGEST-08)
# ---------------------------------------------------------------------------

def test_ingest_intra_day_update_applies():
    """INGEST-08: POST /ingest/confirm with updates list applies 'done' action."""
    task = client.post(
        "/api/v1/tasks/",
        json={"title": "Deploy to staging"},
    ).json()
    task_id = task["id"]

    payload = {
        "schema_version": "1.1",
        "updates": [
            {
                "update_id": "upd-001-intra",
                "entity_type": "task",
                "entity_id": task_id,
                "action": "done",
            }
        ],
    }
    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code == 200

    task_after = client.get(f"/api/v1/tasks/{task_id}").json()
    assert task_after["completed"] is True


def test_ingest_update_idempotent():
    """INGEST-08: posting same update_id twice → no double-mutation."""
    task = client.post(
        "/api/v1/tasks/",
        json={"title": "Deploy to staging (idempotent)"},
    ).json()
    task_id = task["id"]

    payload = {
        "schema_version": "1.1",
        "updates": [
            {
                "update_id": "upd-002-idempotent",
                "entity_type": "task",
                "entity_id": task_id,
                "action": "done",
            }
        ],
    }

    r1 = client.post("/api/v1/ingest/confirm", json=payload)
    assert r1.status_code == 200

    task_after_first = client.get(f"/api/v1/tasks/{task_id}").json()
    assert task_after_first["completed"] is True

    r2 = client.post("/api/v1/ingest/confirm", json=payload)
    assert r2.status_code == 200

    task_after_second = client.get(f"/api/v1/tasks/{task_id}").json()
    assert task_after_second["completed"] is True


def test_ingest_v10_still_valid():
    """INGEST-08: schema_version '1.0' payload with empty updates → 200 (guards Pitfall 3)."""
    payload = {
        "schema_version": "1.0",
        "goals": [],
        "tasks": [],
        "routines": [],
        "habits": [],
        "updates": [],
    }
    r = client.post("/api/v1/ingest/confirm", json=payload)
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Phase 13 Plan 02 — Task 1: resolver applies actions (UPDATE-03)
# ---------------------------------------------------------------------------

def test_resolve_applies_done():
    """13-02 Task 1: resolver applies done mutation when fuzzy match resolves (confirmed-id path for isolation)."""
    # Use confirmed_id to guarantee resolution regardless of other tasks in DB
    task = client.post("/api/v1/tasks/", json={"title": "Xq9UniqueResolveAppliesDoneTask"}).json()
    task_id = task["id"]

    r = client.post(
        "/api/v1/updates/resolve",
        json={
            "text": "done",
            "confirmed_id": task_id,
            "confirmed_type": "task",
            "confirmed_action": "done",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "resolved"

    task_after = client.get(f"/api/v1/tasks/{task_id}").json()
    assert task_after["completed"] is True


def test_confirm_applies_done():
    """13-02 Task 1: confirmed_id path bypasses fuzzy match and applies action."""
    task = client.post("/api/v1/tasks/", json={"title": "Send weekly report"}).json()
    task_id = task["id"]

    r = client.post(
        "/api/v1/updates/resolve",
        json={
            "text": "x",
            "confirmed_id": task_id,
            "confirmed_type": "task",
            "confirmed_action": "done",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "resolved"

    task_after = client.get(f"/api/v1/tasks/{task_id}").json()
    assert task_after["completed"] is True


def test_ambiguous_does_not_mutate():
    """13-02 Task 1: ambiguous match never mutates either candidate."""
    task_a = client.post("/api/v1/tasks/", json={"title": "Team sync A"}).json()
    task_b = client.post("/api/v1/tasks/", json={"title": "Team sync B"}).json()

    r = client.post("/api/v1/updates/resolve", json={"text": "team sync"})
    assert r.status_code == 200
    assert r.json()["status"] == "ambiguous"

    assert client.get(f"/api/v1/tasks/{task_a['id']}").json()["completed"] is False
    assert client.get(f"/api/v1/tasks/{task_b['id']}").json()["completed"] is False


# ---------------------------------------------------------------------------
# Phase 13 Plan 02 — Task 2: check_in_enabled (NOTIF-08)
# ---------------------------------------------------------------------------

def test_checkin_enabled_roundtrip():
    """13-02 Task 2: PUT with enabled=false; GET returns enabled=False."""
    r = client.put("/api/v1/settings/check-in-time", json={"hour": 13, "minute": 30, "enabled": False})
    assert r.status_code == 200

    r2 = client.get("/api/v1/settings/check-in-time")
    assert r2.status_code == 200
    assert r2.json()["enabled"] is False


def test_checkin_disable_removes_job():
    """13-02 Task 2: enable=true registers job; enable=false removes it."""
    r1 = client.put("/api/v1/settings/check-in-time", json={"hour": 12, "minute": 0, "enabled": True})
    assert r1.status_code == 200
    assert scheduler.get_job("mid_day_checkin") is not None

    r2 = client.put("/api/v1/settings/check-in-time", json={"hour": 12, "minute": 0, "enabled": False})
    assert r2.status_code == 200
    assert scheduler.get_job("mid_day_checkin") is None
