import uuid
from datetime import date, datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app import db as app_db
from app.models.goal import Goal, GoalType, GoalStatus

client = TestClient(app, raise_server_exceptions=False)


def _uid(prefix: str) -> str:
    """Return a per-run unique string to avoid cross-test DB collisions."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


async def _seed_goal(external_key, title="Advisory Goal"):
    async with app_db.SessionLocal() as session:
        async with session.begin():
            goal = Goal(
                external_key=external_key,
                title=title,
                type=GoalType.career,
                status=GoalStatus.active,
                target_date=date(2026, 1, 1),
            )
            session.add(goal)
        await session.refresh(goal)
        return goal.id


def _payload(**overrides):
    base = {
        "session_id": "sess-1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "goal_adjustments": [],
        "milestone_adjustments": [],
        "new_tasks": [],
        "notes": None,
    }
    base.update(overrides)
    return base


def test_schema_endpoint():
    r = client.get("/api/v1/advisory/schema")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    assert "properties" in body
    props = body["properties"]
    for key in ["goal_adjustments", "milestone_adjustments", "new_tasks", "notes", "session_id", "generated_at"]:
        assert key in props


def test_preview_ok():
    import asyncio

    gkey = _uid("preview-ok-goal")
    asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_seed_goal(gkey))

    async def _count_goals():
        from sqlalchemy import select
        async with app_db.SessionLocal() as session:
            result = await session.execute(select(Goal))
            return len(result.scalars().all())

    count_before = asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_count_goals())

    payload = _payload(goal_adjustments=[{
        "external_key": gkey,
        "target_date": "2026-05-01",
        "rationale": "push deadline back",
    }])
    r = client.post("/api/v1/advisory/preview", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert len(body["goals"]) == 1
    assert body["goals"][0]["fields"]

    count_after = asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_count_goals())
    assert count_before == count_after


def test_preview_missing_rationale_422():
    gkey = _uid("preview-norationale-goal")
    payload = _payload(goal_adjustments=[{
        "external_key": gkey,
        "target_date": "2026-05-01",
    }])
    r = client.post("/api/v1/advisory/preview", json=payload)
    assert r.status_code == 422


def test_preview_unknown_goal_422():
    payload = _payload(goal_adjustments=[{
        "external_key": "does-not-exist-goal",
        "target_date": "2026-05-01",
        "rationale": "x",
    }])
    r = client.post("/api/v1/advisory/preview", json=payload)
    assert r.status_code == 422


def test_confirm_ok():
    import asyncio

    gkey = _uid("confirm-ok-goal")
    adv_id = _uid("confirm-ok-id")
    asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_seed_goal(gkey))

    payload = {
        "advisory_id": adv_id,
        "payload": _payload(goal_adjustments=[{
            "external_key": gkey,
            "target_date": "2026-06-01",
            "rationale": "confirm test",
        }]),
    }
    r = client.post("/api/v1/advisory/confirm", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["updated"]["goals"] == 1
    assert body["replayed"] is False

    goals = client.get("/api/v1/goals/").json()
    goal = next(g for g in goals if g.get("external_key") == gkey)
    assert goal["target_date"] == "2026-06-01"


def test_confirm_idempotent():
    import asyncio

    gkey = _uid("confirm-idem-goal")
    adv_id = _uid("confirm-idem-id")
    asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_seed_goal(gkey))

    payload = {
        "advisory_id": adv_id,
        "payload": _payload(goal_adjustments=[{
            "external_key": gkey,
            "target_date": "2026-07-01",
            "rationale": "idempotency test",
        }]),
    }
    r1 = client.post("/api/v1/advisory/confirm", json=payload)
    assert r1.status_code == 200
    assert r1.json()["replayed"] is False

    r2 = client.post("/api/v1/advisory/confirm", json=payload)
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["replayed"] is True

    goals = client.get("/api/v1/goals/").json()
    matching = [g for g in goals if g.get("external_key") == gkey]
    assert len(matching) == 1


def test_last_sync_endpoint():
    import asyncio

    gkey = _uid("lastsync-goal")
    adv_id = _uid("lastsync-id")
    asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_seed_goal(gkey))

    payload = {
        "advisory_id": adv_id,
        "payload": _payload(goal_adjustments=[{
            "external_key": gkey,
            "target_date": "2026-08-01",
            "rationale": "last sync test",
        }]),
    }
    client.post("/api/v1/advisory/confirm", json=payload)

    r = client.get("/api/v1/advisory/last-sync")
    assert r.status_code == 200
    body = r.json()
    assert body["last_advisory_at"] is not None
