from datetime import date, datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Task, Priority
from app.models.calendar import CalendarEvent

client = TestClient(app)


# ---------------------------------------------------------------------------
# UNIT tests — pure planner function. Import deferred inside each test body so
# the module stays collectable before app.services.planner_service exists.
# ORM objects are built in memory; no DB.
# ---------------------------------------------------------------------------


def _task(id, title="T", priority=Priority.medium, due_date=None,
          estimated_minutes=None, is_habit=False, completed=False):
    t = Task(
        id=id,
        title=title,
        priority=priority,
        due_date=due_date,
        estimated_minutes=estimated_minutes,
        is_habit=is_habit,
        completed=completed,
    )
    return t


def test_all_day_event_not_a_blocker():
    from app.services.planner_service import propose_day_plan

    allday = CalendarEvent(
        google_id="ad1",
        title="Holiday",
        all_day=True,
        start_date="2026-06-18",
        start_dt=None,
        end_dt=None,
    )
    task = _task(1, estimated_minutes=30, due_date=datetime(2026, 6, 18, tzinfo=timezone.utc))

    result = propose_day_plan(
        tasks=[task],
        events=[allday],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(18, 0),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    assert len(result.blocks) == 1


def test_block_sized_from_estimated_minutes():
    from app.services.planner_service import propose_day_plan

    t1 = _task(1, estimated_minutes=45, due_date=datetime(2026, 6, 18, tzinfo=timezone.utc))
    t2 = _task(2, estimated_minutes=None, due_date=datetime(2026, 6, 18, tzinfo=timezone.utc))

    result = propose_day_plan(
        tasks=[t1, t2],
        events=[],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(18, 0),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    by_task = {b.task_id: b for b in result.blocks}
    assert (by_task[1].end_dt - by_task[1].start_dt) == timedelta(minutes=45)
    assert (by_task[2].end_dt - by_task[2].start_dt) == timedelta(minutes=30)


def test_task_ordering():
    from app.services.planner_service import propose_day_plan

    due = datetime(2026, 6, 18, tzinfo=timezone.utc)
    high = _task(1, priority=Priority.high, due_date=due, estimated_minutes=30)
    med = _task(2, priority=Priority.medium, due_date=due, estimated_minutes=30)
    low = _task(3, priority=Priority.low, due_date=due, estimated_minutes=30)

    result = propose_day_plan(
        tasks=[low, med, high],
        events=[],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(18, 0),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    assert [b.task_id for b in result.blocks[:3]] == [1, 2, 3]


def test_habits_excluded():
    from app.services.planner_service import propose_day_plan

    due = datetime(2026, 6, 18, tzinfo=timezone.utc)
    habit = _task(1, is_habit=True, due_date=due, estimated_minutes=30)
    normal = _task(2, is_habit=False, due_date=due, estimated_minutes=30)

    result = propose_day_plan(
        tasks=[habit, normal],
        events=[],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(18, 0),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    placed_ids = [b.task_id for b in result.blocks]
    assert placed_ids == [2]
    assert 1 not in placed_ids
    assert 1 not in result.unplaced_task_ids


def test_place_if_fits_else_skip():
    from app.services.planner_service import propose_day_plan

    task = _task(1, estimated_minutes=30, due_date=datetime(2026, 6, 18, tzinfo=timezone.utc))

    result = propose_day_plan(
        tasks=[task],
        events=[],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(9, 20),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    assert result.blocks == []
    assert 1 in result.unplaced_task_ids


def test_work_hours_covered_does_not_mean_full_day():
    from app.services.planner_service import propose_day_plan

    busy = CalendarEvent(
        google_id="b1",
        title="Workday meeting",
        all_day=False,
        start_dt=datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc),
        end_dt=datetime(2026, 6, 18, 18, 0, tzinfo=timezone.utc),
    )
    task = _task(1, estimated_minutes=30, due_date=datetime(2026, 6, 18, tzinfo=timezone.utc))

    result = propose_day_plan(
        tasks=[task],
        events=[busy],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(18, 0),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    assert result.fully_booked is False
    assert result.blocks == []


def test_fully_booked_requires_continuous_coverage_from_8_to_8():
    from app.services.planner_service import propose_day_plan

    busy = CalendarEvent(
        google_id="b1",
        title="Truly full day",
        all_day=False,
        start_dt=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
        end_dt=datetime(2026, 6, 18, 20, 0, tzinfo=timezone.utc),
    )

    result = propose_day_plan(
        tasks=[],
        events=[busy],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(18, 0),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    assert result.fully_booked is True


def test_even_a_small_gap_means_the_calendar_is_not_full():
    from app.services.planner_service import propose_day_plan

    morning = CalendarEvent(
        google_id="b1",
        title="Morning commitments",
        all_day=False,
        start_dt=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
        end_dt=datetime(2026, 6, 18, 13, 0, tzinfo=timezone.utc),
    )
    evening = CalendarEvent(
        google_id="b2",
        title="Afternoon commitments",
        all_day=False,
        start_dt=datetime(2026, 6, 18, 13, 0, 1, tzinfo=timezone.utc),
        end_dt=datetime(2026, 6, 18, 20, 0, tzinfo=timezone.utc),
    )

    result = propose_day_plan(
        tasks=[],
        events=[morning, evening],
        target_date=date(2026, 6, 18),
        now=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
    )

    assert result.fully_booked is False


def test_past_gaps_excluded():
    from app.services.planner_service import propose_day_plan

    task = _task(1, estimated_minutes=60, due_date=datetime(2026, 6, 18, tzinfo=timezone.utc))
    now = datetime(2026, 6, 18, 14, 0, tzinfo=timezone.utc)

    result = propose_day_plan(
        tasks=[task],
        events=[],
        target_date=date(2026, 6, 18),
        work_start=time(9, 0),
        work_end=time(18, 0),
        now=now,
    )

    assert len(result.blocks) == 1
    assert result.blocks[0].start_dt >= now


# ---------------------------------------------------------------------------
# INTEGRATION tests — sync TestClient, DB-backed. Far-future date_keys keep
# tests isolated on the shared session-scoped test DB.
# ---------------------------------------------------------------------------


def test_propose_is_read_only():
    d = "2099-01-01"
    r = client.get(f"/api/v1/plan/propose?date={d}")
    assert r.status_code == 200
    blocks = client.get(f"/api/v1/plan/blocks?date={d}")
    assert blocks.status_code == 200
    assert blocks.json() == []


def test_propose_accepts_a_request_specific_time_window(monkeypatch):
    from app.schemas.plan import ProposedDayPlan

    captured = {}

    def fake_propose_day_plan(**kwargs):
        captured.update(kwargs)
        return ProposedDayPlan(
            date=kwargs["target_date"],
            blocks=[],
            unplaced_task_ids=[],
            fully_booked=False,
        )

    monkeypatch.setattr(
        "app.routers.plan.planner_service.propose_day_plan",
        fake_propose_day_plan,
    )
    d = "2099-01-10"
    r = client.get(
        f"/api/v1/plan/propose?date={d}&work_start=13:00&work_end=14:00"
    )
    assert r.status_code == 200, r.text
    assert captured["work_start"] == time(13, 0)
    assert captured["work_end"] == time(14, 0)


def test_propose_rejects_a_reversed_time_window():
    d = "2099-01-11"
    r = client.get(
        f"/api/v1/plan/propose?date={d}&work_start=18:00&work_end=09:00"
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "Planning start time must be before end time."


def test_approve_idempotent_409():
    d = "2099-01-02"
    body = {
        "date": d,
        "blocks": [
            {
                "task_id": None,
                "title": "Block A",
                "start_dt": "2099-01-02T09:00:00Z",
                "end_dt": "2099-01-02T10:00:00Z",
            }
        ],
    }
    r1 = client.post("/api/v1/plan/approve", json=body)
    assert r1.status_code == 201, r1.text
    r2 = client.post("/api/v1/plan/approve", json=body)
    assert r2.status_code == 409


def test_replan_replaces():
    d = "2099-01-03"
    approve_body = {
        "date": d,
        "blocks": [
            {"task_id": None, "title": "B1", "start_dt": f"{d}T09:00:00Z", "end_dt": f"{d}T10:00:00Z"},
            {"task_id": None, "title": "B2", "start_dt": f"{d}T10:00:00Z", "end_dt": f"{d}T11:00:00Z"},
        ],
    }
    assert client.post("/api/v1/plan/approve", json=approve_body).status_code == 201

    replan_body = {
        "date": d,
        "blocks": [
            {"task_id": None, "title": "B1 only", "start_dt": f"{d}T09:00:00Z", "end_dt": f"{d}T10:00:00Z"},
        ],
    }
    r = client.post("/api/v1/plan/replan", json=replan_body)
    assert r.status_code == 200, r.text

    blocks = client.get(f"/api/v1/plan/blocks?date={d}").json()
    assert len(blocks) == 1


def test_staleness_detection():
    d = "2099-01-04"
    approve_body = {
        "date": d,
        "blocks": [
            {"task_id": None, "title": "Focus", "start_dt": f"{d}T09:00:00Z", "end_dt": f"{d}T10:00:00Z"},
        ],
    }
    assert client.post("/api/v1/plan/approve", json=approve_body).status_code == 201

    from app import db as app_db

    async def _insert():
        async with app_db.SessionLocal() as s:
            s.add(CalendarEvent(
                google_id="conflict_2099_01_04",
                title="Surprise Meeting",
                all_day=False,
                start_dt=datetime(2099, 1, 4, 9, 30, tzinfo=timezone.utc),
                end_dt=datetime(2099, 1, 4, 10, 30, tzinfo=timezone.utc),
            ))
            await s.commit()

    import asyncio
    asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_insert())

    blocks = client.get(f"/api/v1/plan/blocks?date={d}").json()
    assert blocks[0]["conflict_with"] == "Surprise Meeting"


def test_delete_block():
    d = "2099-01-05"
    approve_body = {
        "date": d,
        "blocks": [
            {"task_id": None, "title": "Delete me", "start_dt": f"{d}T09:00:00Z", "end_dt": f"{d}T10:00:00Z"},
        ],
    }
    assert client.post("/api/v1/plan/approve", json=approve_body).status_code == 201

    blocks = client.get(f"/api/v1/plan/blocks?date={d}").json()
    block_id = blocks[0]["id"]

    r = client.delete(f"/api/v1/plan/blocks/{block_id}")
    assert r.status_code == 204

    remaining = client.get(f"/api/v1/plan/blocks?date={d}").json()
    assert all(b["id"] != block_id for b in remaining)


def test_complete_block_persists_and_completes_linked_task():
    d = "2099-01-06"
    task = client.post(
        "/api/v1/tasks/",
        json={"title": "Persist plan completion"},
    ).json()
    approve_body = {
        "date": d,
        "blocks": [
            {
                "task_id": task["id"],
                "title": task["title"],
                "start_dt": f"{d}T09:00:00Z",
                "end_dt": f"{d}T10:00:00Z",
            },
        ],
    }
    created = client.post("/api/v1/plan/approve", json=approve_body).json()

    updated = client.patch(
        f"/api/v1/plan/blocks/{created[0]['id']}",
        json={"completed": True},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["completed"] is True

    reloaded = client.get(f"/api/v1/plan/blocks?date={d}").json()
    assert reloaded[0]["completed"] is True

    tasks = client.get("/api/v1/tasks/").json()
    linked = next(row for row in tasks if row["id"] == task["id"])
    assert linked["completed"] is True


def test_patch_block_parent_task_id():
    d = "2099-01-07"
    task = client.post("/api/v1/tasks/", json={"title": "Sam's Club run"}).json()
    approve_body = {
        "date": d,
        "blocks": [
            {
                "task_id": None,
                "title": "Buy chicken",
                "start_dt": f"{d}T09:00:00Z",
                "end_dt": f"{d}T10:00:00Z",
            },
        ],
    }
    created = client.post("/api/v1/plan/approve", json=approve_body).json()
    block_id = created[0]["id"]

    r1 = client.patch(f"/api/v1/plan/blocks/{block_id}", json={"parent_task_id": task["id"]})
    assert r1.status_code == 200, r1.text
    assert r1.json()["parent_task_id"] == task["id"]

    r2 = client.patch(f"/api/v1/plan/blocks/{block_id}", json={"parent_task_id": None})
    assert r2.status_code == 200, r2.text
    assert r2.json()["parent_task_id"] is None

    reloaded = client.get(f"/api/v1/plan/blocks?date={d}").json()
    assert reloaded[0]["parent_task_id"] is None


def test_patch_block_parent_task_id_rejects_nested_parent():
    d = "2099-01-08"
    grandparent = client.post("/api/v1/tasks/", json={"title": "Grandparent task"}).json()
    parent = client.post(
        "/api/v1/tasks/",
        json={"title": "Nested parent", "parent_task_id": grandparent["id"]},
    ).json()
    approve_body = {
        "date": d,
        "blocks": [
            {
                "task_id": None,
                "title": "Some block",
                "start_dt": f"{d}T09:00:00Z",
                "end_dt": f"{d}T10:00:00Z",
            },
        ],
    }
    created = client.post("/api/v1/plan/approve", json=approve_body).json()
    block_id = created[0]["id"]

    r = client.patch(f"/api/v1/plan/blocks/{block_id}", json={"parent_task_id": parent["id"]})
    assert r.status_code == 422
