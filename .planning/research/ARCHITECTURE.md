# Architecture Research

**Domain:** v2.2 LLM Advisory Loop — integration into existing My Secretary (FastAPI async + SQLAlchemy 2.0 + aiosqlite + React 19)
**Researched:** 2026-06-29
**Confidence:** HIGH — based on direct reading of every relevant source module

---

## Ground Truth: Existing Architecture

Before integration design, these are verified facts from reading the actual code.

### Alembic HEAD

Current chain end: `0016_add_checkin_enabled.py` (`revision = "0016"`, `down_revision = "0015"`).
Next new migration MUST use `revision = "0017"`, `down_revision = "0016"`.

### Sync vs Async Boundary

The APScheduler jobs (`brief.py`, `guidance_service.py`) run in a thread pool and use a **sync** engine (`create_engine` + `sessionmaker`). Attempting `async def` inside an APScheduler job causes a MissingGreenlet deadlock. The verified pattern in the codebase:

```python
_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)
```

FastAPI route handlers use the **async** engine via `get_session` dependency (`AsyncSession`). The two engines share the same SQLite file; both are valid simultaneously under WAL mode.

Any new service called from APScheduler MUST be sync. Any new service called only from FastAPI routes CAN be async (and should be, to stay consistent with the route layer).

### Ingest Contract (exact shape as of 2026-06-29)

`IngestPayload` (schemas/ingest.py):
- `schema_version: Literal["1.0", "1.1"]`
- `goals: list[GoalImport]`, `tasks: list[TaskImport]`, `routines: list[RoutineImport]`, `habits: list[HabitImport]`, `updates: list[IntraDayUpdateImport]`
- All models use `extra="forbid"` — unknown fields are validation errors

`IngestPayload.model_json_schema()` is served live at `GET /api/v1/ingest/schema`.

The shared path between preview and confirm: `_exists()` in `ingest_service.py` (SELECT by `external_key`) for preview, and the `_upsert_*` functions for confirm. Both use the same `AsyncSession` dependency. No server-side pending state — client resends full payload on confirm.

### progress_pct (never stored)

`goal_service.compute_progress(goal_id, session)` runs two aggregate SQL queries (Tasks + Milestones grouped by `goal_id`). Called in `goals.router._to_read()` for every `GoalRead` response. Also duplicated as `_compute_progress_sync()` inline inside `brief.py` for the scheduler context. This duplication is intentional and must be preserved: the async version is for routes, the sync copy is for APScheduler jobs.

### Key Column Constraints (for migration design)

- `tasks`: `completed`, `completed_at`, `estimated_minutes`, `external_key`, `list_name`, `parent_list_name`, `is_habit`, `goal_id`
- `goals`: `external_key`, `status` (GoalStatus enum: active/archived/completed), `target_date`, `list_name`, `parent_list_name`, `updated_at`
- `milestones`: `done`, `target_date` — matched by title during ingest upsert (no `external_key`)
- `scheduled_blocks`: `task_id`, `date_key`, `completed`, `start_dt`, `end_dt`, `approved_at`
- `app_settings`: single row (id=1), holds all configuration knobs

---

## System Overview: v2.2 Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│  External LLM (Claude, ChatGPT, etc.)  <->  User's clipboard   │
└───────────────────────┬─────────────────────────────────────────┘
                        │  Markdown + JSON (copy/paste)
           ┌────────────┴─────────────┐
           │    [NEW] Sync Page        │  frontend/src/pages/Sync.tsx
           │  (export + advisory diff) │
           └──────────┬───────────────┘
                      │  GET /api/v1/export/bundle
                      │  POST /api/v1/ingest/preview  (existing)
                      │  POST /api/v1/ingest/confirm  (existing)
┌─────────────────────┴────────────────────────────────────────────┐
│                    FastAPI (async routes)                         │
│                                                                   │
│  [NEW] routers/export.py          [EXISTING] routers/ingest.py   │
│  GET /export/bundle               GET  /ingest/schema            │
│  -> export_service.build_bundle() POST /ingest/preview           │
│                                   POST /ingest/confirm           │
│                                                                   │
│  [EXISTING] routers/goals.py  routers/plan.py  routers/tasks.py  │
│  (read-only from export's perspective — no router changes)       │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
┌──────────────────────────────────────┴───────────────────────────┐
│                    Service Layer                                   │
│                                                                   │
│  [NEW] services/export_service.py   (ASYNC, route-only)          │
│  Aggregates: Goals+progress, Milestones, Tasks (linked),         │
│  ScheduledBlocks (recent 14 days), completed tasks (rolling 30)  │
│  Calls goal_service.compute_progress() -- reuse, no fork         │
│  Produces: ExportBundle (Pydantic) -> JSON + Markdown render     │
│                                                                   │
│  [NEW] services/snapshot_service.py (SYNC, APScheduler job)      │
│  Writes GoalProgressSnapshot rows nightly                        │
│  Reads goals + inline _compute_progress_sync (same brief.py pat) │
│                                                                   │
│  [MODIFIED] schemas/ingest.py       (schema extension)           │
│  New payload_type discriminator on IngestPayload                 │
│  New AdvisoryPayload / GoalAdjustment / MilestoneAdjustment      │
│                                                                   │
│  [MODIFIED] services/ingest_service.py                           │
│  New _apply_advisory() + _dry_run_advisory(); existing paths kept │
│                                                                   │
│  [EXISTING] services/goal_service.py -- untouched                │
│  [EXISTING] services/brief.py -- untouched                       │
│  [EXISTING] services/guidance_service.py -- untouched            │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
┌──────────────────────────────────────┴───────────────────────────┐
│                    Data Layer                                      │
│                                                                   │
│  [EXISTING] goals, milestones, tasks, scheduled_blocks, ...      │
│                                                                   │
│  [NEW] migration 0017: goal_progress_snapshots table             │
│  (append-only, keyed by goal_id + snapshotted_on date)           │
│                                                                   │
│  [NEW] migration 0018: advisory_rationale column on goals        │
│  (nullable Text -- stores latest advisory rationale per goal)    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Status | Responsibility | Key Design Constraint |
|-----------|--------|---------------|----------------------|
| `services/export_service.py` | NEW | Build the export bundle for the LLM | ASYNC (route-only); reuses `goal_service.compute_progress()`; no new DB tables needed |
| `routers/export.py` | NEW | `GET /api/v1/export/bundle` | Thin router; returns `ExportBundle` JSON + rendered Markdown |
| `GoalProgressSnapshot` model | NEW | Append-only history table | In `models/snapshot.py`; separate from `models/goal.py` to keep that file clean |
| `services/snapshot_service.py` | NEW | APScheduler nightly job; write progress snapshots | SYNC (APScheduler); inline sync progress calculation identical to `_compute_progress_sync` in `brief.py` |
| `schemas/ingest.py` | MODIFIED | Extend `IngestPayload` with advisory payload type | Discriminated union via `payload_type` field; `extra="forbid"` must remain on all models |
| `services/ingest_service.py` | MODIFIED | Handle advisory adjustments | New `_apply_advisory()` / `_dry_run_advisory()`; existing `_upsert_*` and `dry_run_import` paths untouched |
| `pages/Sync.tsx` | NEW | Export copy + advisory ingest flow | New page; reuses existing `useIngest` hook for preview/confirm; new `useExport` hook for bundle |
| `hooks/useExport.ts` | NEW | Fetch `GET /export/bundle` | Returns bundle JSON + pre-rendered Markdown for display |
| `lib/advisorPrompt.ts` | NEW | Documented advisor prompt string | Sibling to `ingestPrompt.ts`; same copy-button pattern |
| `App.tsx` | MODIFIED | Add `/sync` route | Plus one BottomNav entry |

---

## Architectural Patterns

### Pattern 1: Export Service (ASYNC, Route-Only)

**What:** A pure read service that aggregates across multiple tables into a single structured bundle, called only from a FastAPI route handler.

**Why async (not sync):** Export is triggered by a user clicking a button, not by APScheduler. It runs in FastAPI's async event loop where the existing `AsyncSession` is available. Making it sync would require a sync engine import and be inconsistent with every other read in the routes layer.

**How it avoids duplicating goal/progress logic:** Call `goal_service.compute_progress(goal_id, session)` directly -- the same function the goals router calls. Do not inline the SQL. This is the clean reuse point.

```python
# services/export_service.py
async def build_bundle(session: AsyncSession) -> ExportBundle:
    goals = (await session.execute(
        select(Goal).where(Goal.status == GoalStatus.active)
    )).scalars().all()
    goal_data = []
    for g in goals:
        progress = await goal_service.compute_progress(g.id, session)
        # collect tasks, milestones, recent blocks per goal
        goal_data.append(GoalExport(..., progress_pct=progress["pct"]))
    # collect rolling completed-task counts, snapshot history
    return ExportBundle(generated_at=datetime.now(timezone.utc), goals=goal_data, ...)
```

**What the bundle must contain for the LLM to reason well (minimum viable):**
- All active goals: title, type, target_date, description, progress_pct, milestone list (title + done + target_date)
- Per-goal linked tasks: title, priority, due_date, completed
- Recent ScheduledBlocks (last 14 days): title, date_key, start_dt, completed -- gives planned-vs-actual
- Rolling completion counts: tasks completed in the last 7/14/30 days (derived at export time, no stored table needed)
- GoalProgressSnapshot history if rows exist (for trend lines)
- `generated_at` timestamp so the LLM can reason about staleness

**Markdown render:** The export endpoint returns both a JSON field (`bundle`) and a pre-rendered `markdown` string field. The Markdown is generated by Python from the same data structures -- a pure render function in `export_service.render_markdown(bundle)`. No template engine needed; the output is deterministic and token-efficient.

### Pattern 2: Snapshot Table (Append-Only, SYNC APScheduler Job)

**What:** A nightly APScheduler job writes one row per active goal capturing the point-in-time `progress_pct`. Rows are never updated, only inserted.

**Why a snapshot table rather than deriving from completions:**

The live `progress_pct` is computed from current `Task.completed` and `Milestone.done` states. Individual `Task.completed_at` timestamps exist but they do not give goal-level progress at an arbitrary past date (a goal that gained 10 tasks on day X would change the denominator retroactively). A nightly snapshot is the simplest correct solution. It does not double-count with the live computation because:

1. The snapshot stores a COPY of `progress_pct` at capture time -- it never feeds back into `goal_service.compute_progress()`, which always runs live queries.
2. The export service reads snapshots for the "trend" section and live computation for the "current state" section. They serve different purposes.

**Schema (migration 0017, first of two):**

```sql
CREATE TABLE goal_progress_snapshots (
    id              INTEGER PRIMARY KEY,
    goal_id         INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    snapshotted_on  DATE NOT NULL,
    progress_pct    INTEGER NOT NULL,
    task_done       INTEGER NOT NULL DEFAULT 0,
    task_total      INTEGER NOT NULL DEFAULT 0,
    ms_done         INTEGER NOT NULL DEFAULT 0,
    ms_total        INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME
);
CREATE UNIQUE INDEX ix_snapshot_goal_date ON goal_progress_snapshots(goal_id, snapshotted_on);
```

The UNIQUE index on `(goal_id, snapshotted_on)` makes the job idempotent: if the Pi reboots and the job fires twice on the same day, the second insert is skipped (check before inserting).

**APScheduler registration:** Follow the exact pattern of `schedule_stall_check()` in `scheduler.py`. Register with `id="snapshot_progress"` and `replace_existing=True`. Schedule at 23:50 daily.

**Sync engine pattern (mandatory for APScheduler):**

```python
# services/snapshot_service.py
_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)

def take_daily_snapshot() -> None:
    today = date.today()
    with _Session() as s:
        goals = s.execute(select(Goal).where(Goal.status == "active")).scalars().all()
        for g in goals:
            existing = s.execute(
                select(GoalProgressSnapshot).where(
                    GoalProgressSnapshot.goal_id == g.id,
                    GoalProgressSnapshot.snapshotted_on == today
                )
            ).scalar_one_or_none()
            if existing:
                continue  # idempotent: already captured today
            pct_data = _compute_progress_sync(g.id, s)  # inline sync version
            s.add(GoalProgressSnapshot(goal_id=g.id, snapshotted_on=today, ...))
        s.commit()
```

### Pattern 3: Advisory Ingest Extension (Discriminated Union)

**What:** Extend `IngestPayload` with a `payload_type` discriminator field so the existing preview/confirm path can handle a new "advisory" payload alongside the existing "standard" payload.

**Why `payload_type` discriminator rather than a `schema_version` bump:**

A version bump (`"1.2"`) would require the backend to branch on version inside `apply_import()`, which muddles the function's responsibility. A `payload_type` field makes the distinction explicit at the Pydantic validation level. The existing `schema_version: Literal["1.0", "1.1"]` covers the data format version; `payload_type` covers the intent.

**Exact schema extension (schemas/ingest.py):**

```python
class GoalAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    external_key: str = Field(..., max_length=200)
    target_date: date | None = None          # LLM-suggested new target date
    rationale: str = Field(..., max_length=1000)  # required -- why this change

class MilestoneAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal_key: str
    title: str                               # matched by title (existing pattern)
    target_date: date | None = None
    done: bool | None = None
    rationale: str | None = Field(None, max_length=500)

class AdvisoryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0", "1.1"]
    payload_type: Literal["advisory"]
    goal_adjustments: list[GoalAdjustment] = []
    milestone_adjustments: list[MilestoneAdjustment] = []
    new_tasks: list[TaskImport] = []   # reuse existing TaskImport unchanged
    new_goals: list[GoalImport] = []   # reuse existing GoalImport unchanged

# EXISTING IngestPayload gains one new field with a default:
class IngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0", "1.1"]
    payload_type: Literal["standard"] = "standard"  # NEW -- default preserves backward compat
    goals: list[GoalImport] = []
    tasks: list[TaskImport] = []
    routines: list[RoutineImport] = []
    habits: list[HabitImport] = []
    updates: list[IntraDayUpdateImport] = []
```

**CRITICAL BACKWARD COMPAT NOTE:** Adding `payload_type: Literal["standard"] = "standard"` to `IngestPayload` with a default means all old payloads (which omit `payload_type`) parse as `"standard"`. This is safe because `extra="forbid"` prevents old clients from accidentally sending unknown fields. A regression test that sends a schema_version "1.0" payload with no `payload_type` field must pass before shipping this change.

**Where rationale is stored (migration 0018, second of two):**

Add a nullable `advisory_rationale TEXT` column to the `goals` table. When `_apply_advisory()` processes a `GoalAdjustment`, it writes `goal.advisory_rationale = adjustment.rationale` alongside any `target_date` change.

- One advisory pass can overwrite a previous rationale on the same goal -- acceptable since the user reviews the diff before confirming.
- No separate rationale history table needed for v2.2. The rationale is per-goal: "what is the LLM's current reasoning for this goal."
- `GoalRead` schema gains `advisory_rationale: str | None = None` so the frontend can display it.

**Advisory path in ingest_service.py:**

```python
async def dry_run_import(
    payload: IngestPayload | AdvisoryPayload,
    session: AsyncSession
) -> IngestPreviewResult:
    if getattr(payload, "payload_type", "standard") == "advisory":
        return await _dry_run_advisory(payload, session)
    # existing logic unchanged below
    ...

async def apply_import(
    payload: IngestPayload | AdvisoryPayload,
    session: AsyncSession
) -> IngestResult:
    if getattr(payload, "payload_type", "standard") == "advisory":
        return await _apply_advisory(payload, session)
    # existing logic unchanged below
    ...
```

`_dry_run_advisory()` returns the same `IngestPreviewResult` shape. The diffs include the rationale text via an optional `rationale` field on `EntityDiff` (additive field, `None` on standard payloads).

`_apply_advisory()` runs inside `async with session.begin()` (same pattern as existing `apply_import`). It:
1. Resolves goal rows by `external_key` (same SELECT pattern as `_exists()`)
2. Applies `target_date` changes and `advisory_rationale` to Goal rows
3. Applies milestone adjustments matched by title (same as `_upsert_goal` milestone reconciliation)
4. Calls `_upsert_goal` for `new_goals` and `_upsert_task` for `new_tasks` -- exact same functions, no fork

Full idempotency guarantee is preserved: goals and tasks matched on `external_key`, milestones matched on title.

---

## Data Flow

### Export Flow

```
User clicks "Export for LLM" on Sync page
    |
useExport.ts: GET /api/v1/export/bundle
    |
routers/export.py: async def get_bundle(session)
    |
export_service.build_bundle(session)
    +-- SELECT active Goals (with selectinload milestones, tasks)
    +-- goal_service.compute_progress(g.id, session) for each goal
    +-- SELECT ScheduledBlocks WHERE date_key >= (today - 14 days)
    +-- SELECT completed Tasks WHERE completed_at >= (today - 30 days)
    +-- SELECT GoalProgressSnapshot WHERE snapshotted_on >= (today - 90 days)
    |
ExportBundle (Pydantic) serialized to JSON
export_service.render_markdown(bundle) -> string
    |
Response: { bundle: {...}, markdown: "# My Secretary Context\n..." }
    |
Sync page: displays Markdown in <pre> block with "Copy" button
           displays raw JSON in collapsible for inspection
```

### Advisory Ingest Flow (mirrors existing Ingest page flow exactly)

```
User pastes LLM advisory JSON into Sync page textarea
    |
handlePreview(): POST /api/v1/ingest/preview with AdvisoryPayload
    |
ingest_service.dry_run_import() -> _dry_run_advisory()
    |
AdvisoryDiff displayed (goal_adjustments + new entities + rationale per change)
    |
User reviews and clicks "Confirm Advisory"
    |
handleConfirm(): POST /api/v1/ingest/confirm with AdvisoryPayload
    |
ingest_service.apply_import() -> _apply_advisory()
    +-- session.begin() atomic transaction
    |
navigate("/goals") -- same post-confirm UX as existing Ingest page
```

### Snapshot Flow (APScheduler, nightly)

```
APScheduler: daily cron at 23:50
    |
snapshot_service.take_daily_snapshot()
    +-- SYNC engine (_Session)
    +-- SELECT active Goals
    +-- For each goal: _compute_progress_sync(g.id, s)
    +-- INSERT OR SKIP into goal_progress_snapshots (UNIQUE index guards idempotency)
    +-- s.commit()
```

---

## New vs Modified Components

### Backend -- NEW files

| File | Purpose |
|------|---------|
| `backend/app/services/export_service.py` | Aggregate export bundle; render Markdown |
| `backend/app/services/snapshot_service.py` | APScheduler nightly snapshot job (SYNC) |
| `backend/app/routers/export.py` | `GET /api/v1/export/bundle` |
| `backend/app/models/snapshot.py` | `GoalProgressSnapshot` ORM model |
| `backend/migrations/versions/0017_add_goal_progress_snapshots.py` | Snapshot table |
| `backend/migrations/versions/0018_add_advisory_rationale_to_goals.py` | `advisory_rationale` column |

### Backend -- MODIFIED files

| File | Change | Risk |
|------|--------|------|
| `backend/app/schemas/ingest.py` | Add `payload_type` default to `IngestPayload`; add `AdvisoryPayload`, `GoalAdjustment`, `MilestoneAdjustment`; extend `EntityDiff` with optional `rationale` | LOW -- default preserves backward compat |
| `backend/app/services/ingest_service.py` | Add `_dry_run_advisory()` and `_apply_advisory()`; widen `dry_run_import` and `apply_import` signatures | LOW -- existing branches untouched |
| `backend/app/schemas/goal.py` | Add `advisory_rationale: str | None = None` to `GoalRead` | LOW -- additive only |
| `backend/app/scheduler.py` | Register `schedule_snapshot()` call with `id="snapshot_progress"` | LOW -- same pattern as `schedule_stall_check` |
| `backend/app/main.py` | Include `export.router`; call `schedule_snapshot()` in lifespan | LOW |

### Frontend -- NEW files

| File | Purpose |
|------|---------|
| `frontend/src/pages/Sync.tsx` | New page: export panel (top) + advisory ingest panel (bottom) |
| `frontend/src/hooks/useExport.ts` | `GET /export/bundle` -- returns `{ bundle, markdown }` |
| `frontend/src/lib/advisorPrompt.ts` | Documented advisor prompt string (sibling to `ingestPrompt.ts`) |
| `frontend/src/types/export.ts` | TypeScript types for `ExportBundle` and its nested shapes |

### Frontend -- MODIFIED files

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `/sync` route |
| `frontend/src/components/BottomNav.tsx` | Add "Sync" nav entry |
| `frontend/src/types/goal.ts` | Add `advisory_rationale?: string` to the `Goal` type |

---

## Migration Chain Guidance

Continue from HEAD `0016`. Write both migrations before running `alembic upgrade head`.

**Migration 0017** -- `goal_progress_snapshots` (new table, no batch needed):

```python
revision = "0017"
down_revision = "0016"
```

Use `op.create_table(...)` directly. Include `op.create_index("ix_snapshot_goal_date", "goal_progress_snapshots", ["goal_id", "snapshotted_on"], unique=True)`.

**Migration 0018** -- `advisory_rationale` column on `goals`:

```python
revision = "0018"
down_revision = "0017"
```

Use `op.batch_alter_table("goals")` (SQLite ALTER TABLE requirement, same as every previous migration that touched existing tables). No `server_default` needed; column is nullable.

---

## Sync vs Async Decision Reference

| Service | Called From | Must Be | Reason |
|---------|-------------|---------|--------|
| `export_service.build_bundle()` | FastAPI route | ASYNC | Uses `AsyncSession`; never called from APScheduler |
| `export_service.render_markdown()` | Same route | plain sync function | No I/O; pure string formatting |
| `snapshot_service.take_daily_snapshot()` | APScheduler | SYNC | APScheduler thread pool; MissingGreenlet deadlock if async |
| `ingest_service._apply_advisory()` | FastAPI route | ASYNC | Same session pattern as existing `apply_import` |
| `ingest_service._dry_run_advisory()` | FastAPI route | ASYNC | Same pattern as `dry_run_import` |

---

## Live-Progress vs Stored-History Tension

The only place this can go wrong: code in `export_service.py` reading `goal_progress_snapshots` for "current progress" instead of calling `goal_service.compute_progress()`.

The rule is explicit:

- **Current state** = always `goal_service.compute_progress()` (live SQL aggregation, no stored value)
- **Historical trend** = `goal_progress_snapshots` (point-in-time rows from the nightly job)

The export bundle contains BOTH: the live `progress_pct` for the LLM to see where things stand now, and the snapshot history for the LLM to see the trend. They serve different purposes and never conflict.

If snapshot rows are missing for some days (Pi was off), the trend section shows fewer data points. The export does not back-fill or estimate; it includes whatever rows exist.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Async Snapshot Service

**What people do:** Write `snapshot_service.py` with `async def take_daily_snapshot()` and an `AsyncSession`.

**Why it breaks:** APScheduler 3.x jobs run in a thread pool executor. Calling `asyncio.run()` from within that thread and then trying to reuse the existing SQLAlchemy async engine causes a `MissingGreenlet` error. The Pi's single-worker uvicorn setup makes this a guaranteed runtime crash, not a theoretical concern. Verified by the existing `guidance_service.py` and `brief.py` patterns -- they both use sync engines for exactly this reason.

**Do this instead:** Sync engine, sync sessionmaker. Inline `_compute_progress_sync()` is intentional duplication, the same pattern already present in `brief.py`.

### Anti-Pattern 2: Forking `_upsert_goal()` for Advisory

**What people do:** Create a separate `_apply_advisory_goal()` that reimplements the goal upsert logic to handle `target_date` changes.

**Why it's wrong:** Creates two paths for writing Goal rows, both of which must be kept in sync as the schema evolves.

**Do this instead:** For new goals in the advisory payload, call the existing `_upsert_goal()` directly. For adjustments to existing goals (target_date, advisory_rationale), do a SELECT by `external_key` followed by direct `setattr` -- same SELECT shape as `_exists()`, just load the row and mutate it. `_apply_advisory()` is a thin orchestrator around the existing upsert functions.

### Anti-Pattern 3: Rationale History Table

**What people do:** Create an `advisory_history` table with one row per advisory run per goal, preserving full rationale history.

**Why it's overkill for v2.2:** The user reviews diffs before confirming. Once confirmed, the current advisory rationale is what matters -- the LLM will generate new rationale on the next sync. A nullable column on `goals` is sufficient; it gets overwritten each advisory cycle.

**Do this instead:** Single `advisory_rationale` nullable Text column on the goals table. Displayed in the Goals detail view alongside `target_date` and `progress_pct`. Add a history table in a later milestone if the audit trail of advisory reasoning becomes a real need.

### Anti-Pattern 4: Reimplementing useIngest in Sync.tsx

**What people do:** Build the Sync page with its own `fetch('/api/v1/ingest/preview', ...)` calls, duplicating `useIngest.ts` logic.

**Why it's wrong:** The existing `useIngest` hook encapsulates error handling, loading state, and the preview/confirm state machine. Duplicating it creates two diverging implementations of the same contract.

**Do this instead:** `Sync.tsx` imports and calls `useIngest()` directly for the advisory confirm flow. The hook does not need to know it is being called from Sync.tsx vs Ingest.tsx.

### Anti-Pattern 5: Schema Version Bump for Advisory Payload

**What people do:** Change `schema_version` from `Literal["1.0", "1.1"]` to `Literal["1.0", "1.1", "2.0"]` to signal advisory vs standard payloads.

**Why it's wrong:** Conflates format versioning with intent discrimination. Clients cannot tell from the schema_version alone whether to expect advisory fields or standard entity arrays. Branching inside `apply_import()` on version number requires knowing the version-to-type mapping in two places.

**Do this instead:** `payload_type: Literal["standard"] | Literal["advisory"]` with a `"standard"` default. Pydantic's discriminated union resolves the type before any service code runs.

---

## Build Order (Dependency-Ordered)

Dependencies:

```
Migration 0017 (snapshots table)
    -> snapshot_service.py (needs table)
        -> scheduler registration (needs service)

Migration 0018 (advisory_rationale column)
    -> ingest schema extension (needs column to exist)
        -> ingest_service advisory functions (needs schema)
            -> Sync page advisory panel (needs endpoint)

export_service.py (needs existing models only -- no new migrations)
    -> routers/export.py (needs service)
        -> useExport.ts (needs endpoint)
            -> Sync page export panel (needs hook)

lib/advisorPrompt.ts (no dependencies -- standalone doc)
```

### Recommended Phase Sequence

**Phase 14 -- Progression Substrate**

1. Migration 0017 (`goal_progress_snapshots`)
2. `models/snapshot.py` -- `GoalProgressSnapshot` ORM model
3. `services/snapshot_service.py` -- SYNC nightly job
4. Register in `scheduler.py` + `main.py` lifespan
5. Tests: verify idempotency (double-fire same day = no duplicate row); verify snapshot values match live `compute_progress()`

Rationale: No frontend dependency. Can be shipped and accumulating data while the rest of v2.2 is built. Every day it runs builds history that Phase 15 exports. Zero risk to existing functionality.

**Phase 15 -- Context Export**

1. `services/export_service.py` -- `build_bundle()` + `render_markdown()`
2. `routers/export.py` -- `GET /export/bundle`
3. Include router in `main.py`
4. `types/export.ts` -- TypeScript types
5. `hooks/useExport.ts`
6. Sync page export panel only (no advisory yet) -- add `/sync` route to `App.tsx` and BottomNav entry
7. Tests: bundle contains live progress_pct matching goals endpoint; Markdown non-empty; snapshot rows appear in trend section when present

Rationale: Export stands alone. Delivering it first lets you validate the full LLM advisory loop manually (copy bundle, paste to LLM, read advisory response) before building the advisory ingest path. Also confirms the LLM output format before you build the schema that validates it.

**Phase 16 -- Advisory Ingest + Sync Review UI**

1. Migration 0018 (`advisory_rationale` column on goals)
2. Extend `schemas/ingest.py` -- `AdvisoryPayload`, `GoalAdjustment`, `MilestoneAdjustment`; add `payload_type` default to `IngestPayload`; extend `EntityDiff` with optional `rationale`
3. Extend `schemas/goal.py` -- `advisory_rationale: str | None = None` in `GoalRead`
4. `ingest_service._dry_run_advisory()` + `_apply_advisory()` + widen signatures
5. Backward compat regression test: existing schema_version "1.0" payload with no `payload_type` still validates as `IngestPayload`
6. Sync page advisory panel -- textarea + preview diff (with rationale display) + confirm (reusing `useIngest`)
7. `lib/advisorPrompt.ts` -- advisor prompt string; copy-button on Sync page
8. Display `advisory_rationale` in Goals detail view (Goals.tsx)
9. Tests: advisory preview shows goal_adjustments as EntityDiff with rationale; confirm applies target_date + advisory_rationale; new_tasks in advisory payload creates tasks via existing `_upsert_task`; full round-trip test (export -> mock advisory JSON -> preview -> confirm -> verify Goals)

---

## Integration Points Summary

| Existing Module | How v2.2 Touches It | Risk |
|-----------------|--------------------|----|
| `goal_service.compute_progress()` | Called directly from `export_service.build_bundle()` -- no change to function | None |
| `ingest_service.dry_run_import()` | Signature widens to `IngestPayload | AdvisoryPayload`; branch added at top | LOW |
| `ingest_service.apply_import()` | Same signature widening; existing branch untouched | LOW |
| `ingest_service._upsert_goal()` / `_upsert_task()` | Called by `_apply_advisory()` for new_goals/new_tasks -- no change to functions | None |
| `scheduler.py` | One new `schedule_snapshot()` registration function | LOW |
| `main.py` | One new router include + one new schedule call in lifespan | LOW |
| `useIngest.ts` | Used as-is from Sync.tsx -- no change | None |
| `ingestPrompt.ts` | Not changed; `advisorPrompt.ts` is a new sibling file | None |
| `Ingest.tsx` | Not changed; Sync.tsx is a new separate page | None |
| `GoalRead` schema | Additive: `advisory_rationale: str | None = None` | LOW |
| Migration chain | Two new migrations (0017, 0018) appended after 0016 HEAD | LOW |

---

## Sources

- Direct source reading: `backend/app/schemas/ingest.py`, `backend/app/services/ingest_service.py`, `backend/app/services/brief.py`, `backend/app/services/guidance_service.py`, `backend/app/services/goal_service.py`, `backend/app/models/__init__.py`, `backend/app/models/goal.py`, `backend/app/models/plan.py`, `backend/app/routers/goals.py`, `backend/app/routers/ingest.py`, `backend/app/routers/plan.py`, `backend/app/main.py`, `backend/migrations/versions/0016_add_checkin_enabled.py`
- STATE.md decisions: v2.0 roadmap ingest/planner/brief/guidance decisions; Phase 08/09/10/11/12/13 accumulated context
- PROJECT.md: validated requirements and architectural constraints

---
*Architecture research for: My Secretary v2.2 LLM Advisory Loop*
*Researched: 2026-06-29*
