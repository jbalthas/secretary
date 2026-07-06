import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSettings, AdvisoryLog
from app.models.goal import Goal, Milestone
from app.schemas.advisory import (
    AdvisoryPayload,
    AdvisoryConfirmRequest,
    AdvisoryPreviewResult,
    AdvisoryResult,
    AdvisoryEntityDiff,
    AdvisoryFieldChange,
)
from app.schemas.ingest import TaskImport
from app.services import ingest_service


async def dry_run_advisory(payload: AdvisoryPayload, session: AsyncSession) -> AdvisoryPreviewResult:
    """Build a field-level diff for the advisory payload. Read-only — NO writes."""
    goals: list[AdvisoryEntityDiff] = []
    for a in payload.goal_adjustments:
        result = await session.execute(select(Goal).where(Goal.external_key == a.external_key))
        goal = result.scalar_one_or_none()
        if goal is None:
            raise ValueError(f"unknown goal external_key: {a.external_key}")

        fields: list[AdvisoryFieldChange] = []
        if a.target_date is not None:
            fields.append(AdvisoryFieldChange(field="target_date", old=goal.target_date, new=a.target_date))
        if a.priority_rank is not None:
            fields.append(AdvisoryFieldChange(field="priority_rank", old=goal.priority_rank, new=a.priority_rank))

        goals.append(AdvisoryEntityDiff(
            external_key=a.external_key,
            title=goal.title,
            action="update",
            rationale=a.rationale,
            fields=fields,
        ))

    milestones: list[AdvisoryEntityDiff] = []
    for m in payload.milestone_adjustments:
        result = await session.execute(select(Goal).where(Goal.external_key == m.goal_external_key))
        goal = result.scalar_one_or_none()
        if goal is None:
            raise ValueError(f"unknown goal external_key: {m.goal_external_key}")

        result = await session.execute(
            select(Milestone).where(Milestone.goal_id == goal.id, Milestone.title == m.title)
        )
        ms = result.scalar_one_or_none()
        if ms is None:
            raise ValueError(f"unknown milestone: {m.goal_external_key}/{m.title}")

        fields = []
        if m.new_title is not None:
            fields.append(AdvisoryFieldChange(field="title", old=ms.title, new=m.new_title))
        if m.target_date is not None:
            fields.append(AdvisoryFieldChange(field="target_date", old=ms.target_date, new=m.target_date))
        if m.done is not None:
            fields.append(AdvisoryFieldChange(field="done", old=ms.done, new=m.done))

        milestones.append(AdvisoryEntityDiff(
            external_key=f"{m.goal_external_key}/{m.title}",
            title=ms.title,
            action="update",
            rationale=m.rationale,
            fields=fields,
        ))

    new_tasks: list[AdvisoryEntityDiff] = []
    for i, t in enumerate(payload.new_tasks):
        result = await session.execute(select(Goal).where(Goal.external_key == t.goal_external_key))
        goal = result.scalar_one_or_none()
        if goal is None:
            raise ValueError(f"unknown goal external_key: {t.goal_external_key}")

        fields = [AdvisoryFieldChange(field="title", old=None, new=t.title)]
        if t.description is not None:
            fields.append(AdvisoryFieldChange(field="description", old=None, new=t.description))
        if t.priority is not None:
            fields.append(AdvisoryFieldChange(field="priority", old=None, new=t.priority))
        if t.due_date is not None:
            fields.append(AdvisoryFieldChange(field="due_date", old=None, new=t.due_date))
        if t.estimated_minutes is not None:
            fields.append(AdvisoryFieldChange(field="estimated_minutes", old=None, new=t.estimated_minutes))

        new_tasks.append(AdvisoryEntityDiff(
            external_key=f"advisory-PREVIEW-{i}",
            title=t.title,
            action="create",
            rationale=t.rationale,
            fields=fields,
        ))

    return AdvisoryPreviewResult(
        goals=goals,
        milestones=milestones,
        new_tasks=new_tasks,
        notes=payload.notes,
        session_id=payload.session_id,
        generated_at=payload.generated_at,
    )


async def apply_advisory(req: AdvisoryConfirmRequest, session: AsyncSession) -> AdvisoryResult:
    """Apply the advisory payload atomically. Idempotent on advisory_id."""
    seen = await session.execute(select(AdvisoryLog).where(AdvisoryLog.advisory_id == req.advisory_id))
    existing_log = seen.scalar_one_or_none()
    if existing_log is not None:
        return AdvisoryResult(**json.loads(existing_log.result_json), replayed=True)

    # The idempotency SELECT above autobegins the session's transaction; close it
    # out so `session.begin()` below starts a fresh, single transaction for the apply.
    await session.rollback()

    async with session.begin():
        created = {"goals": 0, "milestones": 0, "tasks": 0}
        updated = {"goals": 0, "milestones": 0, "tasks": 0}

        # GOALS
        goal_key_to_id: dict[str, int] = {}
        for a in req.payload.goal_adjustments:
            result = await session.execute(select(Goal).where(Goal.external_key == a.external_key))
            g = result.scalar_one_or_none()
            if g is None:
                raise ValueError(f"unknown goal external_key: {a.external_key}")
            if a.target_date is not None:
                g.target_date = a.target_date
            if a.priority_rank is not None:
                g.priority_rank = a.priority_rank
            updated["goals"] += 1
            goal_key_to_id[a.external_key] = g.id

        await session.flush()

        async def _resolve_goal_id(external_key: str) -> int:
            if external_key in goal_key_to_id:
                return goal_key_to_id[external_key]
            result = await session.execute(select(Goal).where(Goal.external_key == external_key))
            g = result.scalar_one_or_none()
            if g is None:
                raise ValueError(f"unknown goal external_key: {external_key}")
            goal_key_to_id[external_key] = g.id
            return g.id

        # MILESTONES
        for m in req.payload.milestone_adjustments:
            goal_id = await _resolve_goal_id(m.goal_external_key)
            result = await session.execute(
                select(Milestone).where(Milestone.goal_id == goal_id, Milestone.title == m.title)
            )
            ms = result.scalar_one_or_none()
            if ms is None:
                raise ValueError(f"unknown milestone: {m.goal_external_key}/{m.title}")
            if m.new_title is not None:
                ms.title = m.new_title
            if m.target_date is not None:
                ms.target_date = m.target_date
            if m.done is not None:
                ms.done = m.done
            updated["milestones"] += 1

        # NEW TASKS (reuse _upsert_task, no fork)
        for i, t in enumerate(req.payload.new_tasks):
            goal_id = await _resolve_goal_id(t.goal_external_key)
            ti = TaskImport(
                external_key=f"advisory-{req.advisory_id}-{i}",
                goal_key=t.goal_external_key,
                title=t.title,
                priority=t.priority or "medium",
                due_date=t.due_date,
                description=t.description,
                estimated_minutes=t.estimated_minutes,
            )
            _, was_created = await ingest_service._upsert_task(ti, goal_id, session)
            (created if was_created else updated)["tasks"] += 1

        # STAMP last_advisory_at
        settings_row = await session.get(AppSettings, 1)
        if settings_row is None:
            settings_row = AppSettings(id=1, last_advisory_at=datetime.now(timezone.utc))
            session.add(settings_row)
        else:
            settings_row.last_advisory_at = datetime.now(timezone.utc)

        result = AdvisoryResult(created=created, updated=updated, advisory_id=req.advisory_id, replayed=False)
        session.add(AdvisoryLog(
            advisory_id=req.advisory_id,
            result_json=result.model_dump_json(exclude={"replayed"}),
        ))

    # payload.notes is DISPLAY-ONLY (read in dry_run_advisory's response) — NEVER assigned here.
    return result
