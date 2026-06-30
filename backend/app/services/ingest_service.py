from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, Routine, UpdateLog
from app.models.goal import Goal, Milestone, GoalStatus
from app.models.plan import ScheduledBlock
from app.schemas.ingest import (
    IngestPayload,
    GoalImport,
    TaskImport,
    RoutineImport,
    HabitImport,
    IngestResult,
    IngestPreviewResult,
    EntityDiff,
    IntraDayUpdateImport,
    UpdateAction,
)


async def _upsert_goal(g: GoalImport, session: AsyncSession) -> tuple[Goal, bool]:
    result = await session.execute(select(Goal).where(Goal.external_key == g.external_key))
    existing = result.scalar_one_or_none()

    if existing:
        existing.title = g.title
        existing.description = g.description
        existing.target_date = g.target_date
        existing.type = g.type
        existing.list_name = g.list_name
        existing.parent_list_name = g.parent_list_name
        # existing.status is preserved — user controls archive/complete (D-08)
        # Reconcile milestones: match by title, append new ones; do NOT flip done on existing
        existing_titles = {m.title: m for m in existing.milestones}
        for mi in g.milestones:
            if mi.title not in existing_titles:
                existing.milestones.append(
                    Milestone(title=mi.title, target_date=mi.target_date, done=mi.done)
                )
        return existing, False
    else:
        row = Goal(
            external_key=g.external_key,
            title=g.title,
            type=g.type,
            description=g.description,
            target_date=g.target_date,
            list_name=g.list_name,
            parent_list_name=g.parent_list_name,
            status=GoalStatus.active,
            milestones=[
                Milestone(title=m.title, target_date=m.target_date, done=m.done)
                for m in g.milestones
            ],
        )
        session.add(row)
        return row, True


async def _upsert_task(t: TaskImport, goal_id: int | None, session: AsyncSession) -> tuple[Task, bool]:
    result = await session.execute(select(Task).where(Task.external_key == t.external_key))
    existing = result.scalar_one_or_none()

    if existing:
        existing.title = t.title
        existing.description = t.description
        existing.priority = t.priority
        existing.due_date = t.due_date
        existing.goal_id = goal_id
        existing.list_name = t.list_name
        existing.parent_list_name = t.parent_list_name
        existing.estimated_minutes = t.estimated_minutes
        # NEVER overwrite completed or reminder_at (D-08)
        return existing, False
    else:
        row = Task(
            external_key=t.external_key,
            title=t.title,
            priority=t.priority,
            due_date=t.due_date,
            description=t.description,
            goal_id=goal_id,
            list_name=t.list_name,
            parent_list_name=t.parent_list_name,
            estimated_minutes=t.estimated_minutes,
            is_habit=False,
        )
        session.add(row)
        return row, True


async def _upsert_routine(r: RoutineImport, goal_id: int | None, session: AsyncSession) -> tuple[Routine, bool]:
    result = await session.execute(select(Routine).where(Routine.external_key == r.external_key))
    existing = result.scalar_one_or_none()

    if existing:
        existing.name = r.name
        existing.cron = r.cron
        existing.action = r.action
        existing.goal_id = goal_id
        # NEVER overwrite enabled (D-08)
        return existing, False
    else:
        row = Routine(
            external_key=r.external_key,
            name=r.name,
            cron=r.cron,
            action=r.action,
            goal_id=goal_id,
        )
        session.add(row)
        return row, True


async def _upsert_habit(h: HabitImport, goal_id: int | None, session: AsyncSession) -> tuple[Task, bool]:
    result = await session.execute(select(Task).where(Task.external_key == h.external_key))
    existing = result.scalar_one_or_none()

    if existing:
        existing.title = h.title
        existing.description = h.description
        existing.priority = h.priority
        existing.recurrence_cron = h.recurrence_cron
        existing.goal_id = goal_id
        existing.is_habit = True
        existing.list_name = h.list_name
        existing.parent_list_name = h.parent_list_name
        # NEVER overwrite completed or reminder_at (D-08)
        return existing, False
    else:
        row = Task(
            external_key=h.external_key,
            title=h.title,
            priority=h.priority,
            description=h.description,
            recurrence_cron=h.recurrence_cron,
            goal_id=goal_id,
            is_habit=True,
            list_name=h.list_name,
            parent_list_name=h.parent_list_name,
        )
        session.add(row)
        return row, True


async def _apply_update(u: IntraDayUpdateImport, session: AsyncSession) -> None:
    # reschedule idempotency via UpdateLog unique update_id (stateless not safe for reschedule)
    if u.action == UpdateAction.reschedule:
        seen = await session.execute(select(UpdateLog).where(UpdateLog.update_id == u.update_id))
        if seen.scalar_one_or_none() is not None:
            return  # already applied

    if u.entity_type == "task":
        row = await session.get(Task, u.entity_id)
    else:
        row = await session.get(ScheduledBlock, u.entity_id)

    if row is None:
        return

    if u.action == UpdateAction.done:
        # stateless idempotent: only stamp completed_at on transition
        if not row.completed:
            row.completed = True
            if hasattr(row, "completed_at"):
                row.completed_at = datetime.now(timezone.utc)
    elif u.action == UpdateAction.drop:
        # stateless idempotent: dropping = mark completed/handled (no hard delete)
        # INTENTIONAL v2.1 mapping: drop reuses completed=True (no separate drop flag/column).
        # Phase 13 slipped-vs-done rollup must not treat completed=True as unambiguously "done".
        row.completed = True
    elif u.action == UpdateAction.reschedule:
        if u.reschedule_to is not None and hasattr(row, "start_dt"):
            delta = row.end_dt - row.start_dt
            row.start_dt = u.reschedule_to
            row.end_dt = u.reschedule_to + delta
        elif u.reschedule_to is not None and hasattr(row, "due_date"):
            row.due_date = u.reschedule_to
        session.add(UpdateLog(update_id=u.update_id))


async def _exists(model, external_key: str, session: AsyncSession) -> bool:
    result = await session.execute(select(model).where(model.external_key == external_key))
    return result.scalar_one_or_none() is not None


async def dry_run_import(payload: IngestPayload, session: AsyncSession) -> IngestPreviewResult:
    goals = [
        EntityDiff(external_key=g.external_key, title=g.title,
                   action="update" if await _exists(Goal, g.external_key, session) else "create")
        for g in payload.goals
    ]
    tasks = [
        EntityDiff(external_key=t.external_key, title=t.title,
                   action="update" if await _exists(Task, t.external_key, session) else "create")
        for t in payload.tasks
    ]
    routines = [
        EntityDiff(external_key=r.external_key, title=r.name,
                   action="update" if await _exists(Routine, r.external_key, session) else "create")
        for r in payload.routines
    ]
    habits = [
        EntityDiff(external_key=h.external_key, title=h.title,
                   action="update" if await _exists(Task, h.external_key, session) else "create")
        for h in payload.habits
    ]
    return IngestPreviewResult(goals=goals, tasks=tasks, routines=routines, habits=habits)


async def apply_import(payload: IngestPayload, session: AsyncSession) -> IngestResult:
    created = {"goals": 0, "tasks": 0, "routines": 0, "habits": 0}
    updated = {"goals": 0, "tasks": 0, "routines": 0, "habits": 0}

    async with session.begin():
        # Phase 1: upsert goals, collect (external_key, row) pairs for flush-then-resolve
        goal_rows: list[tuple[str, Goal]] = []
        for g in payload.goals:
            row, was_created = await _upsert_goal(g, session)
            (created if was_created else updated)["goals"] += 1
            goal_rows.append((g.external_key, row))

        # Flush so new Goal rows get DB-assigned .id values within this transaction
        await session.flush()

        # Build key->id map after flush (new rows now have real IDs)
        goal_key_to_id: dict[str, int] = {key: row.id for key, row in goal_rows}

        # Phase 2: tasks
        for t in payload.tasks:
            goal_id = goal_key_to_id.get(t.goal_key) if t.goal_key else None
            _, was_created = await _upsert_task(t, goal_id, session)
            (created if was_created else updated)["tasks"] += 1

        # Phase 3: routines
        for r in payload.routines:
            goal_id = goal_key_to_id.get(r.goal_key) if r.goal_key else None
            _, was_created = await _upsert_routine(r, goal_id, session)
            (created if was_created else updated)["routines"] += 1

        # Phase 4: habits (Task rows with is_habit=True)
        for h in payload.habits:
            goal_id = goal_key_to_id.get(h.goal_key) if h.goal_key else None
            _, was_created = await _upsert_habit(h, goal_id, session)
            (created if was_created else updated)["habits"] += 1

        # Phase 5: intra-day updates (idempotent)
        for u in payload.updates:
            await _apply_update(u, session)

    return IngestResult(created=created, updated=updated)
