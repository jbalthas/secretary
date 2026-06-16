# Phase 8: Goals + Ingest Backend — Research

**Researched:** 2026-06-15
**Domain:** FastAPI + SQLAlchemy 2.0 async + Alembic + Pydantic v2 — Goals/Milestones/Habits data model, versioned ingest endpoint, transactional upsert, live progress computation, celebration hooks
**Confidence:** HIGH (all findings grounded in direct codebase inspection + verified stack docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Progress is a unified ratio computed on read: `% = (completed linked tasks + done milestones) / (total linked tasks + total milestones)`. Every linked task and every milestone counts as one equal unit.
- **D-02:** Progress is never stored — always recalculated when a goal is read. A goal with zero tasks and zero milestones reports 0%.
- **D-03:** "Linked tasks" = tasks whose `goal_id` points at this goal. Habits linked to the goal also count as task units in the ratio (default: include them).
- **D-04:** A habit is a `Task` row with `recurrence_cron` set + a new `is_habit` boolean flag = True, and an optional `goal_id`. No separate Habit table.
- **D-05:** The `is_habit` flag is the only distinguisher between a habit and a plain recurring task. The ingest payload's `habits` array maps each entry onto a `Task` with `is_habit=True`.
- **D-06:** Streak tracking is out of scope for Phase 8.
- **D-07:** Match on `external_key` (nullable, unique, indexed), not title. `external_key` found → update; not found → create.
- **D-08:** On update, preserve user-edited runtime fields — never overwrite `completed`, `reminder_at`, or `enabled`. Update descriptive fields: `title`, `description`, `due_date`/`target_date`, `priority`, `recurrence_cron`, `goal_id` linkage.
- **D-09:** Commit order is goals → tasks → routines → habits inside one transaction; a mid-commit failure must leave zero new rows. Tasks/routines/habits resolve their `goal_id` from goals upserted earlier in the same transaction (match the goal by its `external_key`).
- **D-10:** Celebrate on both milestone completion (done flips False→True) and goal completion (status transitions to `completed`).
- **D-11:** Both celebrations reuse existing `PushoverClient.send()` and `TTSClient.speak()`.
- **D-12:** Celebration tone is warm + specific, naming the entity (and parent goal for milestone). Exact copy is Claude's discretion.
- **D-13:** Goal has `status` enum: `active | archived | completed`. No hard delete.
- **D-14:** Goal type is a fixed enum: `career | life | health | learning | financial`.
- **D-15:** Goal fields: `title` (required), `type` (enum), `description` (optional), `target_date` (optional), `status` (default `active`), `external_key` (nullable/unique), timestamps. Milestones: `{title, target_date (optional), done (bool)}` linked to a goal.

### Claude's Discretion

- Exact celebration copy (within the warm+specific tone of D-12).
- Whether goal auto-completes at 100% progress or requires explicit `status=completed` API action — default to explicit.
- Pydantic model structure / file layout for the ingest schema.
- How the documented LLM prompt is delivered (endpoint, static doc, or both).
- Migration internals beyond the agreed 0006/0007/0008 split.

### Deferred Ideas (OUT OF SCOPE)

- Habit streak tracking
- Goal auto-complete at 100% progress
- Per-item ingest conflict report (P3 backlog)
- Dry-run preview UI + paste/upload UI (Phase 9: INGEST-03, INGEST-05)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GOAL-01 | Create, edit, archive a goal with title, type, optional description, optional target date; archive preserves history, no hard delete | D-13/D-14/D-15; Goal model + PATCH endpoint with status enum |
| GOAL-02 | Progress % computed from linked tasks' completion; recalculated on read, not stored | D-01/D-02; `compute_progress()` service helper using unified ratio |
| GOAL-03 | Milestones (title, optional target date, done flag); milestone completion contributes to goal's tracked progress | D-01/D-03; Milestone child table; included in unified ratio denominator |
| GOAL-06 | Completing a milestone fires celebration (Google Home TTS + Pushover) reusing existing infrastructure | D-10/D-11/D-12; `celebrate.py` helper wrapping existing clients |
| INGEST-01 | `GET /api/v1/ingest/schema` returns versioned JSON schema; documented LLM prompt available | `IngestPayload.model_json_schema()` endpoint; LLM prompt in schema response or `/docs/` |
| INGEST-02 | Validate payload; return HTTP 422 with field-level errors on malformed input; `schema_version` mismatch rejected | `Literal["1.0"]` + `extra="forbid"` in Pydantic models; FastAPI surfaces 422 automatically |
| INGEST-04 | Confirm writes transactionally: goals → tasks → routines → habits; partial failure rolls back cleanly | `async with session.begin()` wrapping all upserts; `session.flush()` after goals to resolve IDs within transaction |
| INGEST-06 | Re-importing same payload is idempotent; entities matched on `external_key`; no duplicates | Select-then-update-or-create pattern per D-07/D-08; runtime fields preserved |
| INGEST-07 | Payload can create habits (recurring tasks with `is_habit=True`) linked to a goal | D-04/D-05; `habits` array in `IngestPayload` maps to Task rows; cron validated before storing |
</phase_requirements>

---

## Summary

Phase 8 is a pure backend phase that adds Goals, Milestones, and Habits as first-class DB entities and delivers a versioned, idempotent ingest endpoint. All design decisions are already locked in CONTEXT.md — this research resolves the implementation specifics: how to wire SQLAlchemy 2.0 async transactions with flush-before-commit, how to do select-then-upsert on a nullable unique column, how to map Pydantic v2 `Literal`/`extra="forbid"` to 422 responses, how to run Alembic batch migrations on existing SQLite tables, and where exactly to fire celebration hooks.

The codebase inspection reveals that the existing patterns (Task model, tasks router, brief.py sync service, pushover/TTS clients) are clean and directly mirror what Phase 8 needs. No architectural surprises were found. The main implementation complexity is concentrated in three areas: (1) the transactional ingest with flush-then-resolve, (2) the unified progress query hitting both tasks and milestones, and (3) SQLite ALTER TABLE needing `batch_alter_table`.

**Primary recommendation:** Follow the locked architecture exactly. Add `is_habit` and `external_key` to Task, add `external_key` and `goal_id` to Routine, create Goal + Milestone models, write migrations 0006→0007→0008 in dependency order, implement ingest service with `session.flush()` after goal upserts to resolve `goal.id` within the same transaction before writing tasks.

---

## Standard Stack

### Core (all already installed — zero new dependencies)

| Library | Installed Version | Purpose | Why |
|---------|------------------|---------|-----|
| FastAPI | `>=0.128,<0.129` | API framework, 422 validation | `Depends(get_session)` pattern; ValidationError → 422 is automatic |
| Pydantic v2 | bundled with FastAPI 0.128 | Schema validation, JSON Schema generation | `model_json_schema()`, `Literal`, `extra="forbid"` all built in |
| SQLAlchemy | `>=2.0,<2.1` | ORM + async sessions | `Mapped[...]`, `mapped_column`, `async with session.begin()` |
| aiosqlite | `>=0.20,<0.21` | Async SQLite driver | Required for SA 2.0 async |
| Alembic | `>=1.13,<1.14` | Schema migrations | `batch_alter_table` for SQLite ALTER |
| APScheduler | `>=3.11,<4.0` | NOT needed for Phase 8 | Celebrations fire in request context, not scheduled |

**No new packages required.** `pyproject.toml` is unchanged.

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
backend/app/
├── models/
│   ├── __init__.py          # MODIFIED: add Goal, Milestone; add goal_id/external_key/is_habit to Task; add goal_id/external_key to Routine
│   └── goal.py              # NEW: Goal, Milestone ORM models
├── schemas/
│   ├── goal.py              # NEW: GoalCreate/GoalUpdate/GoalRead/MilestoneCreate/MilestoneRead
│   └── ingest.py            # NEW: IngestPayload, GoalImport, TaskImport, RoutineImport, HabitImport, IngestResult
├── routers/
│   ├── goals.py             # NEW: CRUD + progress + milestone CRUD
│   └── ingest.py            # NEW: GET /schema, POST /confirm
├── services/
│   ├── goal_service.py      # NEW: compute_progress(goal_id, session)
│   ├── ingest_service.py    # NEW: apply_import(payload, session) — transactional upsert
│   └── celebrate.py         # NEW: fire_milestone_celebration(milestone, goal), fire_goal_celebration(goal)
migrations/versions/
├── 0006_create_goals.py     # NEW: goals + milestones tables
├── 0007_task_goal_fk.py     # NEW: ADD COLUMN goal_id, external_key, is_habit to tasks (batch_alter_table)
└── 0008_routine_goal_fk.py  # NEW: ADD COLUMN goal_id, external_key to routines (batch_alter_table)
```

### Pattern 1: SQLAlchemy 2.0 async with flush-before-commit to resolve FK within a transaction

**What:** `session.flush()` pushes pending INSERT/UPDATE SQL to the DB (within the transaction) without committing, making the new `goal.id` available for use as FK in child rows — all still inside `async with session.begin()`.

**When to use:** The ingest commit order (D-09) requires that goal rows exist with real `id` values before task/routine rows can set their `goal_id` FK. `session.flush()` after upserting goals resolves this within the same transaction, so a mid-ingest failure still leaves zero committed rows.

```python
# Source: SQLAlchemy 2.0 async docs — session.flush() in AsyncSession
async def apply_import(payload: IngestPayload, session: AsyncSession) -> IngestResult:
    async with session.begin():
        # 1. Upsert goals first
        goal_key_to_id: dict[str, int] = {}
        for g in payload.goals:
            row = await _upsert_goal(g, session)
            goal_key_to_id[g.external_key] = row.id

        # 2. Flush so goal.id is DB-assigned (still inside the transaction)
        await session.flush()

        # 3. Upsert tasks, resolving goal_id from in-memory map
        for t in payload.tasks:
            goal_id = goal_key_to_id.get(t.goal_key) if t.goal_key else None
            await _upsert_task(t, goal_id, session)

        # 4. Upsert routines
        for r in payload.routines:
            goal_id = goal_key_to_id.get(r.goal_key) if r.goal_key else None
            await _upsert_routine(r, goal_id, session)

        # 5. Upsert habits (Task rows with is_habit=True)
        for h in payload.habits:
            goal_id = goal_key_to_id.get(h.goal_key) if h.goal_key else None
            await _upsert_habit(h, goal_id, session)

        # commit() is implicit at end of async with session.begin()
```

**Key insight:** `async with session.begin()` commits on clean exit and rolls back on exception. If `_upsert_task` raises after goals are flushed but before commit, the entire transaction rolls back — zero rows in the DB. This satisfies success criterion #4.

### Pattern 2: Select-then-update-or-create upsert on nullable unique external_key

**What:** For each imported entity, SELECT by `external_key`. If found, update non-protected fields. If not found, INSERT. Do NOT use SQLite `INSERT OR REPLACE` — that issues a DELETE+INSERT which changes the row `id` and breaks FKs.

**When to use:** All four entity types (goals, tasks, routines, habits) in the ingest confirm path.

```python
# Source: SQLAlchemy 2.0 select + merge pattern
async def _upsert_goal(g: GoalImport, session: AsyncSession) -> Goal:
    result = await session.execute(
        select(Goal).where(Goal.external_key == g.external_key)
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update descriptive fields only (D-08: never overwrite status/completed)
        existing.title = g.title
        existing.description = g.description
        existing.target_date = g.target_date
        existing.type = g.type
        # existing.status is preserved — user controls archive/complete
        return existing
    else:
        row = Goal(
            external_key=g.external_key,
            title=g.title,
            description=g.description,
            target_date=g.target_date,
            type=GoalType[g.type] if isinstance(g.type, str) else g.type,
            status=GoalStatus.active,
        )
        session.add(row)
        return row  # .id will be None until flush()
```

**Why not `INSERT OR REPLACE`:** SQLite replaces the row with a new primary key. Any Task/Routine with `goal_id` pointing at the old PK becomes an orphaned FK. The select-then-update pattern preserves the existing PK.

**Why not SQLAlchemy `session.merge()`:** `merge()` does a SELECT then full-field replace, overwriting user-modified runtime fields. Manual field assignment (above) gives precise control over which fields are preserved (D-08).

**Nullable unique constraint in SQLite:** SQLite's UNIQUE constraint correctly excludes NULL values (each NULL is treated as distinct). Confirmed via SQLite documentation. Multiple rows with `external_key = NULL` is permitted and expected for manually-created entities.

### Pattern 3: Pydantic v2 versioned schema with field-level 422

**What:** `schema_version: Literal["1.0"]` as the first field in `IngestPayload`. `model_config = ConfigDict(extra="forbid")` on all ingest models.

```python
# Source: Pydantic v2 docs — Literal, extra="forbid", model_json_schema
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

class IngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"]
    goals: list[GoalImport] = []
    tasks: list[TaskImport] = []
    routines: list[RoutineImport] = []
    habits: list[HabitImport] = []

class GoalImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    title: str = Field(..., max_length=255)
    type: GoalType
    description: str | None = Field(None, max_length=2000)
    target_date: date | None = None
    milestones: list[MilestoneImport] = []

class HabitImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    goal_key: str | None = None
    title: str = Field(..., max_length=255)
    recurrence_cron: str
    priority: Priority = Priority.medium
    description: str | None = Field(None, max_length=2000)

    @field_validator("recurrence_cron")
    @classmethod
    def _validate_cron(cls, v: str) -> str:
        from apscheduler.triggers.cron import CronTrigger
        try:
            CronTrigger.from_crontab(v)
        except (ValueError, KeyError) as e:
            raise ValueError("Invalid cron expression.") from e
        return v
```

**How FastAPI surfaces 422:** FastAPI wraps Pydantic `ValidationError` automatically. When `schema_version` is `"2.0"` and `Literal["1.0"]` is the only accepted value, FastAPI returns HTTP 422 with a `detail` array containing `{"loc": ["body", "schema_version"], "msg": "...", "type": "literal_error"}`. This is automatic — no custom exception handler needed.

**`GET /api/v1/ingest/schema` endpoint:**

```python
@router.get("/schema")
async def get_schema():
    return IngestPayload.model_json_schema()
```

`model_json_schema()` returns a JSON Schema Draft 2020-12 dict. FastAPI serializes it as `application/json`. This is the entire endpoint body — no additional code.

### Pattern 4: Alembic batch_alter_table for SQLite ALTER

**What:** SQLite does not support `ALTER TABLE ... ADD COLUMN ... REFERENCES ...` with constraints in a single statement. Alembic's `batch_alter_table` context manager rewrites the table as copy + drop + rename, enabling full ALTER semantics.

**When to use:** Migrations 0007 and 0008 (adding columns to existing `tasks` and `routines` tables).

```python
# Source: Alembic docs — batch operations for SQLite
# migrations/versions/0007_task_goal_fk.py

def upgrade() -> None:
    # Create goals table first (done in 0006); this migration adds columns to tasks
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("goal_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("external_key", sa.String(200), nullable=True))
        batch_op.add_column(sa.Column("is_habit", sa.Boolean(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("estimated_minutes", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_tasks_goal_id",
            "goals",
            ["goal_id"],
            ["id"],
            ondelete="SET NULL",
        )
    # Create unique index separately (batch_alter_table can't create partial/filtered unique indexes)
    op.create_index("ix_tasks_external_key", "tasks", ["external_key"], unique=True)

def downgrade() -> None:
    op.drop_index("ix_tasks_external_key", table_name="tasks")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_goal_id", type_="foreignkey")
        batch_op.drop_column("estimated_minutes")
        batch_op.drop_column("is_habit")
        batch_op.drop_column("external_key")
        batch_op.drop_column("goal_id")
```

**Critical:** `external_key` MUST be nullable (no `NOT NULL`). Existing task rows have no `external_key`. Attempting `NOT NULL` without a `server_default` will fail on a non-empty database (PITFALLS anti-pattern 5). Confirmed by direct reading of existing DB state.

**`is_habit` needs `server_default="0"`** — it's `Boolean nullable=False`, so existing rows need a default to fill. Same pattern as `done` column in migration 0005.

**Migration 0006 (goals + milestones)** uses `op.create_table()` — no batch needed for new tables.

### Pattern 5: Live progress computation without N+1

**What:** A single async query joins tasks and milestones to compute `completed_count / total_count` without loading each row into Python individually.

```python
# Source: SQLAlchemy 2.0 async docs — scalar aggregate queries
from sqlalchemy import func, case

async def compute_progress(goal_id: int, session: AsyncSession) -> dict:
    # Query tasks linked to this goal
    task_result = await session.execute(
        select(
            func.count(Task.id).label("total"),
            func.sum(case((Task.completed == True, 1), else_=0)).label("done"),
        ).where(Task.goal_id == goal_id)
    )
    task_row = task_result.one()
    total_tasks = task_row.total or 0
    done_tasks = task_row.done or 0

    # Query milestones linked to this goal
    ms_result = await session.execute(
        select(
            func.count(Milestone.id).label("total"),
            func.sum(case((Milestone.done == True, 1), else_=0)).label("done"),
        ).where(Milestone.goal_id == goal_id)
    )
    ms_row = ms_result.one()
    total_ms = ms_row.total or 0
    done_ms = ms_row.done or 0

    total = total_tasks + total_ms
    done = done_tasks + done_ms
    pct = round(done / total * 100) if total > 0 else 0
    return {"total": total, "done": done, "pct": pct}
```

**Two queries, no N+1.** Both use aggregate SQL — only counts travel over the wire, not full row sets. At personal scale (< 100 tasks per goal), this is instantaneous.

### Pattern 6: Celebration hooks in the goals router

**What:** After a `PATCH /goals/{id}` or `PATCH /goals/{id}/milestones/{ms_id}` that transitions a field, fire the celebration synchronously from the router (same pattern as `brief.py` calling TTS).

```python
# celebrate.py — sync wrapper (NOT async) because PushoverClient and TTSClient are sync
from app.services.pushover import PushoverClient
from app.services.tts import TTSClient
import app.services.tts_settings as _tts_settings

def fire_milestone_celebration(milestone_title: str, goal_title: str) -> None:
    msg = f"Nice work — you completed \"{milestone_title}\" on your {goal_title} goal."
    PushoverClient().send(title="Milestone complete!", message=msg)
    if _tts_settings.get_tts_enabled():
        TTSClient().speak(msg)

def fire_goal_celebration(goal_title: str) -> None:
    msg = f"Congratulations! You reached your goal: {goal_title}."
    PushoverClient().send(title="Goal achieved!", message=msg)
    if _tts_settings.get_tts_enabled():
        TTSClient().speak(msg)
```

**In the router (how to trigger):**

```python
# In PATCH /goals/{id}/milestones/{ms_id}
old_done = ms.done
for k, v in body.model_dump(exclude_unset=True).items():
    setattr(ms, k, v)
await session.commit()
await session.refresh(ms)
if not old_done and ms.done:
    from starlette.concurrency import run_in_threadpool
    await run_in_threadpool(celebrate.fire_milestone_celebration, ms.title, goal.title)
```

**Why `run_in_threadpool`:** `PushoverClient` and `TTSClient` are synchronous (sync `httpx.Client`, sync pychromecast). Calling them directly in an async handler blocks the event loop. `run_in_threadpool` matches the pattern used in `webhooks.py` for `send_daily_brief`. This is the established project pattern.

**Why NOT fire from APScheduler:** Celebrations are event-driven (user action), not scheduled. They belong in the router, not the scheduler.

### Pattern 7: Goal and Milestone ORM models

The ARCHITECTURE.md draft uses `archived: bool` on Goal, but D-13 locks `status: active | archived | completed` as a single enum. The ORM must reflect D-13, not the architecture draft.

```python
# app/models/goal.py
import enum
from datetime import date, datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Date, Text, Enum as SAEnum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class GoalType(str, enum.Enum):
    career = "career"
    life = "life"
    health = "health"
    learning = "learning"
    financial = "financial"

class GoalStatus(str, enum.Enum):
    active = "active"
    archived = "archived"
    completed = "completed"

class Goal(Base):
    __tablename__ = "goals"
    id:           Mapped[int]         = mapped_column(primary_key=True)
    external_key: Mapped[str | None]  = mapped_column(String(200), unique=True, nullable=True, index=True)
    title:        Mapped[str]         = mapped_column(String(255), nullable=False)
    type:         Mapped[GoalType]    = mapped_column(SAEnum(GoalType), nullable=False)
    description:  Mapped[str | None]  = mapped_column(Text, nullable=True)
    target_date:  Mapped[date | None] = mapped_column(Date, nullable=True)
    status:       Mapped[GoalStatus]  = mapped_column(SAEnum(GoalStatus), default=GoalStatus.active, nullable=False)
    created_at:   Mapped[datetime]    = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at:   Mapped[datetime]    = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    milestones: Mapped[list["Milestone"]] = relationship("Milestone", back_populates="goal", cascade="all, delete-orphan", lazy="selectin")
    tasks:      Mapped[list["Task"]]      = relationship("Task", back_populates="goal", lazy="selectin")

class Milestone(Base):
    __tablename__ = "milestones"
    id:          Mapped[int]         = mapped_column(primary_key=True)
    goal_id:     Mapped[int]         = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    title:       Mapped[str]         = mapped_column(String(255), nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    done:        Mapped[bool]        = mapped_column(Boolean, default=False, nullable=False)

    goal: Mapped["Goal"] = relationship("Goal", back_populates="milestones")
```

**`lazy="selectin"` is required.** SQLAlchemy 2.0 async sessions prohibit implicit lazy loading (it raises `MissingGreenlet` at runtime). `selectin` loads relationships via a second SELECT, which is safe in async. Confirmed by the STACK.md research note: "Use `lazy='selectin'` on the `relationship()` because async SQLAlchemy prohibits lazy-loading in an async context."

**Milestone cascade:** `cascade="all, delete-orphan"` on Goal→Milestone means deleting a Goal also deletes its milestones. This is correct — milestones have no meaning without a parent goal.

**Task and Routine model additions:**

```python
# In app/models/__init__.py — add to Task class:
goal_id:      Mapped[int | None]  = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
external_key: Mapped[str | None]  = mapped_column(String(200), unique=True, nullable=True, index=True)
is_habit:     Mapped[bool]        = mapped_column(Boolean, default=False, nullable=False)
estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
goal:         Mapped["Goal | None"] = relationship("Goal", back_populates="tasks", lazy="selectin")

# Add to Routine class:
goal_id:      Mapped[int | None]  = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
external_key: Mapped[str | None]  = mapped_column(String(200), unique=True, nullable=True, index=True)
goal:         Mapped["Goal | None"] = relationship("Goal", back_populates="routines", lazy="selectin")
```

**`ondelete="SET NULL"` on Task and Routine:** If a goal is deleted, `goal_id` is set to NULL rather than deleting the task/routine. This preserves task history.

### Pattern 8: `PRAGMA foreign_keys = ON` enforcement

The existing `db.py` sets WAL and `busy_timeout` but does NOT set `PRAGMA foreign_keys = ON`. SQLite does not enforce FKs without this pragma. The `ondelete="SET NULL"` and `ondelete="CASCADE"` directives in ORM models are silently ignored without it.

```python
# In app/db.py — add to existing _set_sqlite_pragmas listener:
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.execute("PRAGMA foreign_keys=ON")   # ADD THIS
    cur.close()
```

This is a one-line addition to the existing listener function. The pragma applies per-connection, which is correct — it must be set on every new connection.

**Without this:** Deleting a Goal does NOT cascade-delete Milestones; setting `goal_id = NULL` on cascade-SET-NULL columns does not fire. Tests that assert FK behavior will silently pass while the DB violates referential integrity.

### Pattern 9: Schema registration in main.py

Two new routers must be registered:

```python
# In app/main.py — add to imports:
from app.routers import goals, ingest

# In lifespan function, after scheduler setup (no lifespan changes needed for these routers):

# After app = FastAPI(...):
app.include_router(goals.router)
app.include_router(ingest.router)
```

Router prefix pattern (mirrors existing):
```python
# app/routers/goals.py
router = APIRouter(prefix=f"{settings.api_prefix}/goals", tags=["goals"])

# app/routers/ingest.py
router = APIRouter(prefix=f"{settings.api_prefix}/ingest", tags=["ingest"])
```

### Anti-Patterns to Avoid

- **Using `INSERT OR REPLACE` for upsert:** Changes the row PK. Any tasks with `goal_id` pointing at the old PK become orphaned. Use select-then-update-or-create.
- **Using `session.merge()` for upsert:** Overwrites all fields including user-modified runtime fields (`completed`, `reminder_at`, `enabled`). Violates D-08.
- **Multiple `await session.commit()` calls inside ingest:** One commit per entity type means a failure mid-commit leaves partial state. Use `async with session.begin()` for a single commit covering all entity types.
- **`lazy="select"` or default lazy on Goal relationships:** Raises `MissingGreenlet` at runtime in async context. Use `lazy="selectin"` for all new relationships.
- **`NOT NULL` on `external_key` in migrations 0007/0008:** Existing rows have no `external_key`. SQLite's ALTER fails for NOT NULL columns with no default on non-empty tables. All `external_key` columns must be `nullable=True`.
- **Calling `TTSClient().speak()` or `PushoverClient().send()` directly in an async route:** Both are synchronous. Wrap in `run_in_threadpool()` to avoid blocking the event loop.
- **Adding `is_habit` as `nullable=True`:** `is_habit` should be `nullable=False` with `server_default="0"` so existing tasks are not-habits by default. A NULL `is_habit` creates ambiguous query logic.
- **Storing progress as a column:** Requires a trigger-like write on every `PATCH /tasks/{id}`. Violates D-02. Compute in `goal_service.compute_progress()` on each read.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron expression validation | Custom regex | `CronTrigger.from_crontab()` (APScheduler, already installed) | Already in `schemas/routine.py`; handles all edge cases |
| JSON Schema generation | Manual schema dict | `IngestPayload.model_json_schema()` | Pydantic v2 generates Draft 2020-12 compliant schema from the model definition |
| 422 field-level error formatting | Custom exception handler | FastAPI's built-in Pydantic integration | FastAPI converts `ValidationError` to structured 422 automatically |
| SQL upsert for nullable unique columns | Custom MERGE SQL | Select-then-update-or-create in Python | SQLite `INSERT OR REPLACE` changes PK; no native UPSERT for nullable unique |
| SQLite FK cascade enforcement | Manual cleanup queries | `PRAGMA foreign_keys=ON` + `ondelete=` on FKs | One pragma line + declarative FK options handle all cascade/SET NULL |

---

## Common Pitfalls

### Pitfall 1: MissingGreenlet on Goal list endpoint

**What goes wrong:** `GET /api/v1/goals/` fetches Goal rows. If `milestones` relationship uses default lazy loading, accessing `goal.milestones` in the response serialization triggers a lazy SELECT inside an async context. SQLAlchemy raises `MissingGreenlet: greenlet_spawn has not been called`.

**Why it happens:** Async sessions prohibit implicit lazy loading. The ORM tries to issue a second SELECT for milestones but there's no coroutine frame to await it.

**How to avoid:** Set `lazy="selectin"` on all relationships in new models. Verified: existing models (`Task`, `Routine`) have no relationships and therefore no risk; the new Goal, Milestone relationships are Phase 8 additions.

**Warning signs:** `MissingGreenlet` in logs; only happens in non-test environments if tests use sync TestClient with a different event loop behavior.

### Pitfall 2: Zero-row guarantee test is hard to write without proper injection point

**What goes wrong:** Testing that "inject a failure mid-commit leaves zero new rows" (success criterion #4) requires simulating a DB error after goals are flushed but before the transaction commits. Without a deliberate injection point, the test cannot deterministically trigger this.

**How to avoid:** In `ingest_service.py`, make `_upsert_task` (or any mid-commit step) accept an optional `_fail_after_goals` parameter (or use a module-level test hook). In tests, monkeypatch `_upsert_task` to raise after the first call. Assert that the goal count before and after equals zero delta.

```python
# Test pattern (mirrors existing monkeypatch pattern from 03-03)
def test_ingest_rollback_on_mid_commit_failure(monkeypatch):
    call_count = 0
    original = ingest_service._upsert_task
    def _fail_on_second(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise RuntimeError("simulated failure")
        return original(*args, **kwargs)
    monkeypatch.setattr(ingest_service, "_upsert_task", _fail_on_second)

    with pytest.raises(Exception):
        client.post("/api/v1/ingest/confirm", json=PAYLOAD_WITH_2_TASKS)

    # Assert zero new rows
    goals = client.get("/api/v1/goals/").json()
    assert len(goals) == 0
```

### Pitfall 3: `estimated_minutes` field is in STACK.md but not in CONTEXT.md decisions

**What goes wrong:** ARCHITECTURE.md and STACK.md both mention `Task.estimated_minutes` as a field needed for the day planner (Phase 10). CONTEXT.md does not include it in Phase 8 locked decisions. Adding it in migration 0007 silently scopes-creeps Phase 8 and the field would be unused until Phase 10.

**How to handle:** Include `estimated_minutes` in migration 0007 and the Task ORM model addition now (it's just a nullable integer column), but do NOT add it to `TaskCreate`/`TaskUpdate` schemas in Phase 8 — leave that for Phase 10 when the planner needs it. This avoids a Phase 10 migration touching the tasks table again. Document the field as Phase 10 but add the DB column in Phase 8.

**Resolution: Include `estimated_minutes` in 0007 migration as a nullable integer column.** This is a zero-risk schema-forward approach. The STACK.md explicitly calls it out as a v2.0 field.

### Pitfall 4: Model import order in `models/__init__.py` causes relationship resolution failures

**What goes wrong:** `Goal` is defined in `app/models/goal.py`, but `Task` and `Routine` are in `app/models/__init__.py`. The `relationship("Goal", ...)` string reference in Task requires that `Goal` is registered with SQLAlchemy's mapper before the relationship is resolved. Import order matters.

**How to avoid:** Import `goal.py` in `models/__init__.py` BEFORE the `Task` and `Routine` class definitions, or after — SQLAlchemy 2.0 uses string-based deferred resolution for `relationship()`, so the import must happen at module load time but the order relative to class definitions is flexible. Safe pattern: add `from app.models.goal import Goal, Milestone, GoalType, GoalStatus` at the top of `models/__init__.py` before the enum/Task/Routine definitions, similar to how `from app.models.calendar import CalendarEvent, CalendarSync` is already at the bottom.

**Simplest approach:** Put `Goal` and `Milestone` directly in `models/__init__.py` alongside Task and Routine, or add the goal module import at the bottom of the file (after Task/Routine class definitions). Either works because SQLAlchemy 2.0 resolves string `relationship()` references lazily at mapper configuration time, not at class definition time. The `from app.models.goal import ...` at the bottom (like the calendar import) is the proven pattern.

### Pitfall 5: `GoalType` enum in migration vs. Python enum discrepancy

**What goes wrong:** SQLite stores enum values as strings. Alembic migration 0006 creates the `goals` table with a `sa.Enum(...)` column. If the string values in the migration's `sa.Enum("career", "life", "health", "learning", "financial")` don't exactly match the `GoalType` enum member values in the ORM model, SQLAlchemy raises a validation error on read.

**How to avoid:** Use `SAEnum(GoalType)` in the ORM model (same pattern as `Priority` and `RoutineAction`), and in the migration use `sa.Enum("career", "life", "health", "learning", "financial", name="goaltype")`. The string literals in the migration must match the enum's `.value` attributes exactly.

### Pitfall 6: Progress computation includes milestones but GoalRead schema must surface them

**What goes wrong:** D-01 defines progress as `(done tasks + done milestones) / (total tasks + total milestones)`. If `GoalRead` doesn't include `milestones: list[MilestoneRead]`, the frontend has no way to render milestone states. Progress is a single integer, but milestone detail is needed for the goal detail view.

**How to avoid:** `GoalRead` schema includes both `progress_pct: int` (computed) AND `milestones: list[MilestoneRead]`. The goal detail endpoint loads both in a single call. The relationship `lazy="selectin"` means milestones are always co-loaded with the goal — no extra round-trip needed.

---

## Codebase Contradictions Found

The following discrepancies were found between ARCHITECTURE.md/CONTEXT.md and actual codebase state:

1. **ARCHITECTURE.md Goal model uses `archived: bool`** but **D-13 locks `status: active | archived | completed` enum**. The ORM model must use `GoalStatus` enum, not a boolean. The ARCHITECTURE.md draft is superseded by D-13.

2. **ARCHITECTURE.md lists a migration `0009_create_scheduled_blocks`** for Phase 8. Scheduled blocks are Phase 10 (Day Auto-Organize). Phase 8 only needs 0006/0007/0008.

3. **STATE.md `[v2.0 roadmap]` says migration chain is 0006/0007/0008/0009**, but also assigns `estimated_minutes` to Task in 0007. This research confirms: include `estimated_minutes` in 0007 but do not add it to schemas in Phase 8.

4. **`db.py` does NOT have `PRAGMA foreign_keys=ON`**. FK cascades (`ondelete="SET NULL"`, `ondelete="CASCADE"`) are silently unenforced without it. This must be added in Phase 8 when FKs are first introduced.

5. **`conftest.py` uses `Base.metadata.create_all`** for the test DB, not Alembic migrations. New models (Goal, Milestone) will be auto-created in tests as long as they are imported into `app/models/__init__.py` (so they register with `Base.metadata`) before `create_all` runs. No change to conftest is needed, but the import in `models/__init__.py` is required.

---

## Code Examples

### Ingest service structure

```python
# app/services/ingest_service.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Task, Routine
from app.models.goal import Goal, Milestone
from app.schemas.ingest import IngestPayload, IngestResult

async def apply_import(payload: IngestPayload, session: AsyncSession) -> IngestResult:
    created = {"goals": 0, "tasks": 0, "routines": 0, "habits": 0}
    updated = {"goals": 0, "tasks": 0, "routines": 0, "habits": 0}

    async with session.begin():
        goal_key_to_id: dict[str, int] = {}

        # Phase 1: goals + milestones
        for g in payload.goals:
            row, was_created = await _upsert_goal(g, session)
            # milestones are handled inside _upsert_goal
            session.add(row)  # no-op if existing; required for new rows
            if was_created:
                created["goals"] += 1
            else:
                updated["goals"] += 1
            goal_key_to_id[g.external_key] = row.id  # .id is None until flush()

        await session.flush()  # assigns .id to new Goal rows

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

        # Phase 4: habits (Task with is_habit=True)
        for h in payload.habits:
            goal_id = goal_key_to_id.get(h.goal_key) if h.goal_key else None
            _, was_created = await _upsert_habit(h, goal_id, session)
            (created if was_created else updated)["habits"] += 1

    return IngestResult(created=created, updated=updated)
```

### Goals router endpoint example

```python
# app/routers/goals.py (abbreviated)
from starlette.concurrency import run_in_threadpool
from app.services import celebrate

@router.patch("/{goal_id}", response_model=GoalRead)
async def update_goal(goal_id: int, body: GoalUpdate, session: AsyncSession = Depends(get_session)):
    goal = await session.get(Goal, goal_id, options=[selectinload(Goal.milestones)])
    if not goal:
        raise HTTPException(404)
    old_status = goal.status
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(goal, k, v)
    await session.commit()
    await session.refresh(goal)
    # Fire goal celebration if status transitioned to completed
    if old_status != GoalStatus.completed and goal.status == GoalStatus.completed:
        await run_in_threadpool(celebrate.fire_goal_celebration, goal.title)
    progress = await goal_service.compute_progress(goal.id, session)
    return GoalRead.model_validate({**goal.__dict__, **progress})
```

### Milestone completion endpoint

```python
@router.patch("/{goal_id}/milestones/{ms_id}", response_model=MilestoneRead)
async def update_milestone(goal_id: int, ms_id: int, body: MilestoneUpdate,
                           session: AsyncSession = Depends(get_session)):
    goal = await session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404)
    ms = await session.get(Milestone, ms_id)
    if not ms or ms.goal_id != goal_id:
        raise HTTPException(404)
    old_done = ms.done
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(ms, k, v)
    await session.commit()
    await session.refresh(ms)
    if not old_done and ms.done:
        await run_in_threadpool(celebrate.fire_milestone_celebration, ms.title, goal.title)
    return ms
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLAlchemy 1.x `Session.query()` | SQLAlchemy 2.0 `select()` + `session.execute()` | SA 2.0 (2023) | All new code must use 2.0 style; existing code already uses this |
| Pydantic v1 `orm_mode = True` | Pydantic v2 `model_config = {"from_attributes": True}` | Pydantic v2 (2023) | Already in codebase; mirror this pattern |
| Alembic `op.add_column()` on SQLite | `op.batch_alter_table()` on SQLite | Alembic 1.4+ | Required for any ALTER on existing SQLite tables |
| `session.merge()` for upsert | Select-then-update-or-create | Recommended pattern since SA 2.0 | `merge()` overwrites all fields; explicit is safer |

---

## Open Questions

1. **Should `GoalRead` include linked tasks list?**
   - What we know: CONTEXT.md specifies milestones in GoalRead (D-15). Tasks are linked by `goal_id`. Phase 9 UI needs to show them in the goal detail view.
   - What's unclear: Loading all linked tasks with a goal adds potentially many rows per request.
   - Recommendation: In Phase 8, `GoalRead` includes `milestones: list[MilestoneRead]` and `progress_pct: int` but NOT a full `tasks` list. Linked tasks are fetched separately by the goal detail endpoint (`GET /goals/{id}/tasks` or by filtering `GET /tasks?goal_id=X`). This keeps goal list fast and leaves task loading for Phase 9 when the UI actually needs it.

2. **Should the ingest endpoint require authentication?**
   - What we know: The app is Tailscale-only; no public exposure. Existing endpoints are unauthenticated. PITFALLS.md flags this as a risk.
   - What's unclear: Whether the user wants a `WEBHOOK_SECRET` pattern on ingest.
   - Recommendation: No auth on ingest in Phase 8 (consistent with all other endpoints). Note it as a Phase 9 hardening item. The PITFALLS.md concern is valid but lower priority for a Tailscale-only personal tool.

3. **Where does the LLM prompt live?**
   - CONTEXT.md marks delivery mechanism as Claude's discretion.
   - Recommendation: Embed the LLM prompt as a `llm_prompt: str` field in the `GET /ingest/schema` response alongside the JSON Schema. This makes the endpoint self-contained — one URL gives the user both the schema and the prompt to paste into their LLM.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 8 is a pure backend code + migration change. All required tools (Python 3.12, uv, aiosqlite, Alembic, SQLAlchemy, Pydantic, FastAPI, APScheduler) are already installed per `pyproject.toml`. No new packages required. Pychromecast and gTTS for celebrations are already installed. No external service dependencies beyond existing Pushover and Google Home setup.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23.x |
| Config file | None — `pyproject.toml` has no `[tool.pytest]` section; tests run with `pytest` from `backend/` directory |
| Quick run command | `cd backend && uv run pytest tests/test_goals.py tests/test_ingest.py -x` |
| Full suite command | `cd backend && uv run pytest` |

**Note:** Tests use sync `TestClient` (not async), matching the established pattern from `test_tasks.py`, `test_routines.py`, etc. The `conftest.py` creates tables via `Base.metadata.create_all` — new Goal/Milestone models must be imported in `models/__init__.py` for them to register.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GOAL-01 | Create goal with title/type/description/target_date; PATCH to archive (status=archived) | unit/integration | `pytest tests/test_goals.py::test_create_goal tests/test_goals.py::test_archive_goal -x` | Wave 0 |
| GOAL-01 | GET goals list only returns non-deleted (no hard delete) | integration | `pytest tests/test_goals.py::test_no_hard_delete -x` | Wave 0 |
| GOAL-02 | Progress % = completed tasks / total linked tasks (pure ratio) | unit | `pytest tests/test_goals.py::test_progress_tasks_only -x` | Wave 0 |
| GOAL-02 | Progress is 0% when no tasks/milestones linked | unit | `pytest tests/test_goals.py::test_progress_no_items -x` | Wave 0 |
| GOAL-03 | Milestones count in unified ratio (done milestones in numerator) | unit | `pytest tests/test_goals.py::test_progress_milestones_count -x` | Wave 0 |
| GOAL-03 | Milestone CRUD — create, read, update done=True | integration | `pytest tests/test_goals.py::test_milestone_crud -x` | Wave 0 |
| GOAL-06 | Milestone done False→True fires celebration (Pushover + TTS) | unit (monkeypatch) | `pytest tests/test_goals.py::test_milestone_celebration -x` | Wave 0 |
| GOAL-06 | Goal status→completed fires celebration | unit (monkeypatch) | `pytest tests/test_goals.py::test_goal_completion_celebration -x` | Wave 0 |
| GOAL-06 | No celebration when done was already True (idempotent) | unit | `pytest tests/test_goals.py::test_no_double_celebration -x` | Wave 0 |
| INGEST-01 | GET /ingest/schema returns dict with `schema_version`, `properties`, `required` keys | integration | `pytest tests/test_ingest.py::test_schema_endpoint -x` | Wave 0 |
| INGEST-02 | POST /ingest/confirm with wrong schema_version returns 422 | integration | `pytest tests/test_ingest.py::test_schema_version_mismatch -x` | Wave 0 |
| INGEST-02 | POST /ingest/confirm with extra field in GoalImport returns 422 | integration | `pytest tests/test_ingest.py::test_extra_field_rejected -x` | Wave 0 |
| INGEST-02 | POST /ingest/confirm with invalid cron in HabitImport returns 422 | integration | `pytest tests/test_ingest.py::test_invalid_cron_rejected -x` | Wave 0 |
| INGEST-04 | POST /ingest/confirm writes all rows in one transaction | integration | `pytest tests/test_ingest.py::test_confirm_writes_all -x` | Wave 0 |
| INGEST-04 | Injecting failure mid-commit (after goals, before tasks) leaves zero new rows | integration (monkeypatch) | `pytest tests/test_ingest.py::test_rollback_on_mid_commit_failure -x` | Wave 0 |
| INGEST-06 | Re-posting same payload creates no duplicate entities | integration | `pytest tests/test_ingest.py::test_idempotent_reimport -x` | Wave 0 |
| INGEST-06 | Re-import does not overwrite user-edited `completed` field on Task | integration | `pytest tests/test_ingest.py::test_preserves_completed_on_reimport -x` | Wave 0 |
| INGEST-07 | `habits` array creates Task rows with `is_habit=True` and `recurrence_cron` set | integration | `pytest tests/test_ingest.py::test_habits_created -x` | Wave 0 |
| INGEST-07 | Habit linked to goal_key resolves `goal_id` on Task row | integration | `pytest tests/test_ingest.py::test_habit_goal_linkage -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && uv run pytest tests/test_goals.py tests/test_ingest.py -x`
- **Per wave merge:** `cd backend && uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_goals.py` — covers GOAL-01, GOAL-02, GOAL-03, GOAL-06
- [ ] `backend/tests/test_ingest.py` — covers INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07

No new test framework or fixtures needed — existing `conftest.py` with `TestClient` + `create_test_db` fixture covers all new tests. New models (Goal, Milestone) auto-register with `Base.metadata` once imported.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `backend/app/models/__init__.py` — confirmed Task/Routine model shape, Priority/SAEnum pattern, no existing FKs
- `backend/app/db.py` — confirmed async engine, `event.listens_for` pattern, missing `foreign_keys=ON`
- `backend/app/routers/tasks.py` — confirmed router pattern, session inject, `exclude_unset=True` patch
- `backend/app/schemas/task.py`, `routine.py` — confirmed Create/Update/Read trio, `field_validator` for cron
- `backend/app/services/pushover.py`, `tts.py`, `brief.py` — confirmed sync service pattern, `_Session`, `run_in_threadpool` in `webhooks.py`
- `backend/app/main.py` — confirmed router registration, lifespan, `run_in_threadpool` usage
- `backend/migrations/versions/0005_*.py`, `0002_*.py`, `0003_*.py` — confirmed migration style (no `batch_alter_table` yet; all existing migrations are table-create or column-add on new tables)
- `backend/tests/conftest.py` — confirmed `Base.metadata.create_all` test pattern, sync `TestClient`
- `backend/pyproject.toml` — confirmed installed versions; zero new packages needed

### Primary (HIGH confidence — research docs)

- `.planning/research/ARCHITECTURE.md` — ingest router/service split, flush-then-resolve pattern, migration chain
- `.planning/research/STACK.md` — Pydantic v2 `model_json_schema`, `selectin` lazy loading requirement
- `.planning/research/PITFALLS.md` — anti-pattern 5 (NOT NULL external_key), FK enforcement pragma
- `.planning/phases/08-goals-ingest-backend/08-CONTEXT.md` — locked decisions D-01 through D-15

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new packages; all findings grounded in `pyproject.toml` and existing code
- ORM model patterns: HIGH — direct codebase reading; `lazy="selectin"` verified as required
- Alembic `batch_alter_table`: HIGH — official Alembic docs pattern for SQLite; not yet used in codebase but standard
- Transaction atomicity (flush-then-commit): HIGH — SQLAlchemy 2.0 official pattern
- Celebration trigger (run_in_threadpool): HIGH — exact pattern already in `webhooks.py`
- `PRAGMA foreign_keys=ON` gap: HIGH (confirmed absent from `db.py`)
- Progress computation (two aggregate queries): HIGH — standard SA 2.0 `func.count`/`func.sum` with `case()`

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable stack; no time-sensitive dependencies)
