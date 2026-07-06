# Phase 14: Progression Substrate - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A backend-only substrate that accumulates goal progress history so trend data
exists before the export (Phase 15) and advisory UI (Phase 16) are built.

Delivers:
1. A new `goal_progress_snapshots` table (migration `0017`) — append-only,
   point-in-time progress row per active goal.
2. A **weekly** APScheduler job (sync, `brief.py` pattern) that writes one snapshot
   row per active goal, idempotent on `(goal_id, snapshotted_on)`.
3. A monthly retention cleanup job that prunes snapshots older than 2 years.
4. An on-demand trigger endpoint `POST /api/v1/export/snapshot` (backend only —
   no UI button in this phase).

Out of scope: the Sync page UI, the export bundle, any advisory/ingest work.
Those are Phases 15–16.
</domain>

<decisions>
## Implementation Decisions

### Snapshot cadence
- **D-01:** Job runs **weekly**, per PROG-01 (not daily). One snapshot row per
  active goal per week. Rejected the research's daily-at-23:50 recommendation in
  favor of the requirement's literal "weekly" wording and week-scoped metrics.
- **D-02:** Job fires **Sunday 23:50** (local `settings.timezone`). The snapshot
  week is the preceding **Monday 00:00 → Sunday 23:59:59**.
- **D-03:** Register via a `schedule_weekly_snapshot()` function in `scheduler.py`
  mirroring `schedule_stall_check()` exactly: `CronTrigger(day_of_week="sun",
  hour=23, minute=50, timezone=settings.timezone)`, `id="snapshot_progress"`,
  `replace_existing=True`. Wire into `main.py` startup alongside `schedule_stall_check()`.

### Snapshot columns (requirement set — PROG-01)
- **D-04:** Capture exactly: `progress_pct`, `milestones_done`,
  `tasks_completed_week`, `tasks_slipped_week`. Rejected the research schema's
  cumulative `task_done/task_total/ms_done/ms_total` set.
- **D-05:** `progress_pct` = a **copy** of the live computed value at snapshot time
  (compute via the existing sync progress logic — see `brief.py::_compute_progress_sync`).
  Stored for trend only; the live `progress_pct` remains computed and is never
  overwritten or read back from snapshots as "current".
- **D-06:** `milestones_done` = **cumulative** count of the goal's milestones with
  `done == True` as of snapshot time (point-in-time, parallels `progress_pct`).
  Uses existing `Milestone.done` boolean — no `completed_at` column needed on Milestone.
- **D-07:** `tasks_completed_week` = count of the goal's tasks whose `completed_at`
  falls within the snapshot week (Mon 00:00 → Sun 23:59:59).
- **D-08:** `tasks_slipped_week` = count of the goal's tasks whose `due_date` falls
  within the snapshot week **and** that are still `completed == False` at snapshot
  time ("due in window, still open"). Point-in-time evaluation at job run.

### Table schema (migration 0017)
- **D-09:** Columns: `id` PK, `goal_id` INTEGER NOT NULL FK → `goals(id)` ON DELETE
  CASCADE, `snapshotted_on` DATE NOT NULL, `progress_pct` INTEGER NOT NULL,
  `milestones_done` INTEGER NOT NULL DEFAULT 0, `tasks_completed_week` INTEGER NOT
  NULL DEFAULT 0, `tasks_slipped_week` INTEGER NOT NULL DEFAULT 0, `created_at`
  DATETIME. NOT NULL constraints are safe — table starts empty.
- **D-10:** `CREATE UNIQUE INDEX ix_snapshot_goal_date ON goal_progress_snapshots
  (goal_id, snapshotted_on)`. This is the idempotency guard: the job checks for an
  existing row for `(goal_id, today)` and skips if present, so firing twice on the
  same day produces no duplicate (PROG-01 criterion 1).
- **D-11:** New ORM model `GoalProgressSnapshot` added to `app/models/goal.py`
  alongside `Goal`/`Milestone`. Migration is `revision="0017"`, `down_revision="0016"`,
  using `op.create_table(...)` + `op.create_index(..., unique=True)` directly.

### Retention
- **D-12:** Include a retention cleanup job **now** (in this phase). Monthly
  APScheduler job, `id="snapshot_cleanup"`, `replace_existing=True`, deletes rows
  where `snapshotted_on < today - 730 days` (~2 years). ~5-line sync function in
  `snapshot_service.py`; registered via a `schedule_snapshot_cleanup()` in
  `scheduler.py` and wired in `main.py` startup.

### On-demand trigger
- **D-13:** Phase 14 ships **backend endpoint only**: `POST /api/v1/export/snapshot`.
  No UI button — the Sync page that calls it is built in Phase 15. New router
  `app/routers/export.py` (prefix `/api/v1/export`), registered in `main.py` via
  `app.include_router(export.router)`.
- **D-14:** The endpoint runs the **same** sync snapshot function the weekly job
  calls, writing `snapshotted_on = date.today()`. Same UNIQUE-index idempotency
  applies, so an on-demand run and the weekly run on the same day coexist without
  duplicates. The endpoint may be `async def` but must offload the sync snapshot
  work appropriately (it touches the sync engine, not the async session).

### Sync/async boundary (locked by research)
- **D-15:** `snapshot_service.py` MUST be sync: module-level `_sync_url =
  database_url.replace("+aiosqlite", "")`, `create_engine`, `sessionmaker` — exactly
  the `brief.py` pattern. No `async def`, no `await`, no asyncio loop touched
  (PROG-01 criterion 2 is tested by running the function directly).

### Claude's Discretion
- Exact function/file names within the established patterns (e.g. `take_weekly_snapshot()`
  vs `snapshot_active_goals()`).
- Whether to inline a `_compute_progress_sync` helper in `snapshot_service.py` or
  import/reuse the one in `brief.py` (planner's call — but keep it sync).
- Response shape of `POST /api/v1/export/snapshot` (e.g. count of rows written).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §PROG-01, §PROG-02 — the two requirements this phase delivers
- `.planning/ROADMAP.md` "Phase 14: Progression Substrate" (lines ~288–297) — goal + 3 success criteria

### v2.2 research (architectural decisions)
- `.planning/research/ARCHITECTURE.md` §"Schema (migration 0017...)" (lines ~186–231) —
  snapshot table, idempotency, sync engine pattern. NOTE: its daily cadence and
  cumulative column set were **overridden** here (see D-01, D-04); reuse only the
  migration mechanics and sync pattern.
- `.planning/research/PITFALLS.md` (lines ~257–273) — retention policy rationale (informs D-12)

### Patterns to mirror in existing code
- `backend/app/services/brief.py` (lines 1–27) — sync engine setup + `_compute_progress_sync`
- `backend/app/services/guidance_service.py` — sibling sync-service pattern
- `backend/app/scheduler.py` `schedule_stall_check()` (lines ~91–101) — cron-job registration to copy
- `backend/app/main.py` lines 10, 17, 41–45 — scheduler import + `scheduler.start()` + startup wiring
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `brief.py::_compute_progress_sync(goal_id, session)` — already computes
  `round(done/total*100)` over tasks + milestones with a sync session. Directly
  reusable for `progress_pct` (D-05).
- `scheduler.py::schedule_stall_check()` — exact template for the weekly + cleanup
  job registration (CronTrigger, id, replace_existing, misfire_grace_time=None).
- Sync engine boilerplate (`_sync_url`/`create_engine`/`sessionmaker`) is duplicated
  in `brief.py` and `scheduler.py` — copy the same three lines into `snapshot_service.py`.

### Established Patterns
- Models: SQLAlchemy 2.0 `Mapped[...]` / `mapped_column`, `Base` from `app.db`.
  `Goal`/`Milestone` live in `app/models/goal.py`; add `GoalProgressSnapshot` there.
- Migrations: numbered `migrations/versions/00NN_*.py`, current HEAD `0016`. Next is `0017`.
- Routers: one file per domain in `app/routers/`, each exposes `router`, registered
  in `main.py` via `app.include_router(...)`. Existing `ingest.py`, `guidance.py`,
  `updates.py` are the closest siblings for an export/snapshot router.
- Tasks have `completed_at: datetime | None` (D-07) and `due_date: datetime | None` (D-08).
  `Goal.status` is the `GoalStatus` enum; "active" = `GoalStatus.active`.

### Integration Points
- `app/models/goal.py` — add `GoalProgressSnapshot` model + export from `app/models/__init__.py`.
- `migrations/versions/0017_add_goal_progress_snapshots.py` — new migration (table + unique index).
- `app/services/snapshot_service.py` — new sync service (snapshot + cleanup functions).
- `app/scheduler.py` — add `schedule_weekly_snapshot()` + `schedule_snapshot_cleanup()`.
- `app/main.py` — import + call both new schedulers in startup, next to `schedule_stall_check()`.
- `app/routers/export.py` — new router, `POST /api/v1/export/snapshot`; register in `main.py`.
</code_context>

<specifics>
## Specific Ideas

- Snapshot week boundary is Mon 00:00 → Sun 23:59:59; job fires Sun 23:50 so the
  week is essentially closed when captured.
- SQLite stores naive local datetimes (see `brief.py` comment); week-window
  comparisons on `completed_at`/`due_date` should use naive local datetimes to match.
- "Slipped" is deliberately the simplest point-in-time definition (due this week +
  still open), not a "newly became overdue" calculation.
</specifics>

<deferred>
## Deferred Ideas

- **Daily snapshot cadence + cumulative count columns** (research's original
  recommendation) — not chosen; would give smoother trend curves and delta-between-
  any-two-snapshots. Revisit only if weekly granularity proves too coarse for the
  advisory trend section in Phase 15.
- **Plan-adherence / ScheduledBlock snapshotting** (`plan_adherence_log`) — raised in
  PITFALLS.md as a separate aggregated table. Out of scope for PROG-01/PROG-02.
- **`completed_at` on Milestone** — would enable "milestones done this week" (week-scoped)
  instead of cumulative. Not needed given D-06; note if a future phase wants weekly
  milestone velocity.
- **Sync page button for on-demand snapshot** — belongs to Phase 15 (Sync page shell).
</deferred>

---

*Phase: 14-progression-substrate*
*Context gathered: 2026-06-29*
