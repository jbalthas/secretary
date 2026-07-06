import uuid
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import select

from app import db as app_db
from app.models import AdvisoryLog
from app.models.goal import Goal, Milestone, GoalType, GoalStatus
from app.schemas.advisory import AdvisoryPayload, AdvisoryConfirmRequest


def _uid(prefix: str) -> str:
    """Return a per-run unique string to avoid cross-test DB collisions."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


async def _seed_goal(external_key="adv-goal-1", title="Advisory Goal", milestone_title=None):
    async with app_db.SessionLocal() as session:
        async with session.begin():
            goal = Goal(
                external_key=external_key,
                title=title,
                type=GoalType.career,
                status=GoalStatus.active,
                target_date=date(2026, 1, 1),
            )
            if milestone_title:
                goal.milestones.append(Milestone(title=milestone_title, target_date=date(2026, 2, 1), done=False))
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
    return AdvisoryPayload(**base)


@pytest.mark.asyncio
async def test_preview_no_writes():
    gkey = _uid("preview-nowrite-goal")
    await _seed_goal(external_key=gkey)
    from app.services.advisory_service import dry_run_advisory

    payload = _payload(goal_adjustments=[{
        "external_key": gkey,
        "target_date": "2026-03-01",
        "rationale": "shift timeline",
    }])

    async with app_db.SessionLocal() as session:
        result = await session.execute(select(Goal))
        goals_before = result.scalars().all()
        count_before = len(goals_before)

        await dry_run_advisory(payload, session)

        result = await session.execute(select(Goal))
        count_after = len(result.scalars().all())

    assert count_before == count_after


@pytest.mark.asyncio
async def test_preview_field_level_diff():
    gkey = _uid("preview-diff-goal")
    await _seed_goal(external_key=gkey)
    from app.services.advisory_service import dry_run_advisory

    payload = _payload(goal_adjustments=[{
        "external_key": gkey,
        "target_date": "2026-05-01",
        "rationale": "push deadline back",
    }])

    async with app_db.SessionLocal() as session:
        preview = await dry_run_advisory(payload, session)

    assert len(preview.goals) == 1
    diff = preview.goals[0]
    assert diff.rationale == "push deadline back"
    target_date_change = next(f for f in diff.fields if f.field == "target_date")
    assert str(target_date_change.old) == "2026-01-01"
    assert str(target_date_change.new) == "2026-05-01"


@pytest.mark.asyncio
async def test_unknown_goal_key_raises():
    from app.services.advisory_service import dry_run_advisory

    payload = _payload(goal_adjustments=[{
        "external_key": "does-not-exist",
        "target_date": "2026-05-01",
        "rationale": "x",
    }])

    async with app_db.SessionLocal() as session:
        with pytest.raises(ValueError):
            await dry_run_advisory(payload, session)


@pytest.mark.asyncio
async def test_atomic_rollback(monkeypatch):
    gkey = _uid("rollback-adv-goal")
    adv_id = _uid("rollback-id")
    await _seed_goal(external_key=gkey)
    from app.services import advisory_service

    call_count = 0
    original = advisory_service.ingest_service._upsert_task

    async def _fail_on_second(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise RuntimeError("simulated mid-apply failure")
        return await original(*args, **kwargs)

    monkeypatch.setattr(advisory_service.ingest_service, "_upsert_task", _fail_on_second)

    req = AdvisoryConfirmRequest(
        advisory_id=adv_id,
        payload=_payload(
            goal_adjustments=[{
                "external_key": gkey,
                "target_date": "2026-09-01",
                "rationale": "test rollback",
            }],
            new_tasks=[
                {
                    "external_key": "ignored-1",
                    "goal_external_key": gkey,
                    "title": "Task A",
                    "rationale": "r1",
                },
                {
                    "external_key": "ignored-2",
                    "goal_external_key": gkey,
                    "title": "Task B",
                    "rationale": "r2",
                },
            ],
        ),
    )

    async with app_db.SessionLocal() as session:
        with pytest.raises(RuntimeError):
            await advisory_service.apply_advisory(req, session)

    async with app_db.SessionLocal() as session:
        result = await session.execute(select(Goal).where(Goal.external_key == gkey))
        goal = result.scalar_one()
        assert str(goal.target_date) == "2026-01-01"

        result = await session.execute(select(AdvisoryLog).where(AdvisoryLog.advisory_id == adv_id))
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_idempotent_replay():
    gkey = _uid("idem-adv-goal")
    adv_id = _uid("idem-id")
    await _seed_goal(external_key=gkey)
    from app.services.advisory_service import apply_advisory

    req = AdvisoryConfirmRequest(
        advisory_id=adv_id,
        payload=_payload(goal_adjustments=[{
            "external_key": gkey,
            "target_date": "2026-04-01",
            "rationale": "test idempotency",
        }]),
    )

    async with app_db.SessionLocal() as session:
        result1 = await apply_advisory(req, session)
    assert result1.replayed is False

    async with app_db.SessionLocal() as session:
        result2 = await apply_advisory(req, session)
    assert result2.replayed is True
    assert result2.created == result1.created
    assert result2.updated == result1.updated

    async with app_db.SessionLocal() as session:
        result = await session.execute(select(AdvisoryLog).where(AdvisoryLog.advisory_id == adv_id))
        rows = result.scalars().all()
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_notes_never_persisted():
    gkey = _uid("notes-adv-goal")
    await _seed_goal(external_key=gkey)
    from app.services.advisory_service import apply_advisory

    req = AdvisoryConfirmRequest(
        advisory_id=_uid("notes-id"),
        payload=_payload(
            goal_adjustments=[{
                "external_key": gkey,
                "target_date": "2026-06-01",
                "rationale": "test notes",
            }],
            notes="SECRET",
        ),
    )

    async with app_db.SessionLocal() as session:
        await apply_advisory(req, session)

    async with app_db.SessionLocal() as session:
        from app.models import Task
        goals = (await session.execute(select(Goal))).scalars().all()
        milestones = (await session.execute(select(Milestone))).scalars().all()
        tasks = (await session.execute(select(Task))).scalars().all()

    for g in goals:
        assert g.title != "SECRET"
        assert g.description != "SECRET"
    for m in milestones:
        assert m.title != "SECRET"
    for t in tasks:
        assert t.title != "SECRET"
        assert t.description != "SECRET"


@pytest.mark.asyncio
async def test_new_task_reuses_upsert():
    gkey = _uid("newtask-adv-goal")
    adv_id = _uid("newtask-id")
    await _seed_goal(external_key=gkey)
    from app.services.advisory_service import apply_advisory

    req = AdvisoryConfirmRequest(
        advisory_id=adv_id,
        payload=_payload(new_tasks=[{
            "external_key": "ignored-key",
            "goal_external_key": gkey,
            "title": "New advisory task",
            "rationale": "create it",
        }]),
    )

    async with app_db.SessionLocal() as session:
        await apply_advisory(req, session)

    async with app_db.SessionLocal() as session:
        from app.models import Task
        result = await session.execute(select(Task).where(Task.external_key == f"advisory-{adv_id}-0"))
        task = result.scalar_one_or_none()
        assert task is not None
        result = await session.execute(select(Goal).where(Goal.external_key == gkey))
        goal = result.scalar_one()
        assert task.goal_id == goal.id


@pytest.mark.asyncio
async def test_estimated_minutes_persists():
    gkey = _uid("estmin-adv-goal")
    adv_id = _uid("estmin-id")
    await _seed_goal(external_key=gkey)
    from app.services.advisory_service import apply_advisory

    req = AdvisoryConfirmRequest(
        advisory_id=adv_id,
        payload=_payload(new_tasks=[{
            "external_key": "ignored-key",
            "goal_external_key": gkey,
            "title": "Timed task",
            "estimated_minutes": 90,
            "rationale": "needs time estimate",
        }]),
    )

    async with app_db.SessionLocal() as session:
        await apply_advisory(req, session)

    async with app_db.SessionLocal() as session:
        from app.models import Task
        result = await session.execute(select(Task).where(Task.external_key == f"advisory-{adv_id}-0"))
        task = result.scalar_one()
        assert task.estimated_minutes == 90


@pytest.mark.asyncio
async def test_milestone_rename():
    gkey = _uid("rename-adv-goal")
    await _seed_goal(external_key=gkey, milestone_title="Old")
    from app.services.advisory_service import apply_advisory

    req = AdvisoryConfirmRequest(
        advisory_id=_uid("rename-id"),
        payload=_payload(milestone_adjustments=[{
            "goal_external_key": gkey,
            "title": "Old",
            "new_title": "New",
            "rationale": "renaming milestone",
        }]),
    )

    async with app_db.SessionLocal() as session:
        await apply_advisory(req, session)

    async with app_db.SessionLocal() as session:
        result = await session.execute(select(Goal).where(Goal.external_key == gkey))
        goal = result.scalar_one()
        titles = {m.title for m in goal.milestones}
        assert "New" in titles
        assert "Old" not in titles
