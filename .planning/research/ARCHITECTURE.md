# Architecture Research

**Domain:** v2.0 feature integration into existing FastAPI + SQLAlchemy + React personal secretary app
**Researched:** 2026-06-15
**Confidence:** HIGH (based on direct codebase inspection)

---

## Existing Architecture (Ground Truth from Codebase Inspection)

### Backend file layout

```
backend/app/
├── main.py              # FastAPI app, lifespan, router registration
├── config.py            # pydantic-settings Settings singleton
├── db.py                # async engine, SessionLocal, Base, get_session dep
├── scheduler.py         # APScheduler singleton + job helpers
│                        # (upsert_reminder, schedule_routine, schedule_daily_brief,
│                        #  schedule_calendar_sync, remove_reminder, remove_routine)
├── models/
│   ├── __init__.py      # Task, AppSettings, Routine, Priority, RoutineAction
│   └── calendar.py      # CalendarEvent, CalendarSync
├── schemas/
│   ├── task.py          # TaskCreate / TaskUpdate / TaskRead
│   ├── routine.py
│   ├── event.py
│   ├── settings.py      # BriefTimeRead / BriefTimeUpdate
│   └── tts.py
├── routers/
│   ├── tasks.py         # CRUD + reminder side-effects
│   ├── routines.py      # CRUD + scheduler side-effects
│   ├── events.py        # read + patch(done)
│   ├── auth.py          # Google OAuth flow
│   ├── calendar_status.py
│   ├── settings.py      # brief-time read/write
│   ├── tts.py           # ad-hoc TTS trigger
│   └── webhooks.py      # secret-guarded /webhooks/brief
└── services/
    ├── brief.py         # build_brief_body/speech, send_daily_brief (sync, uses own _Session)
    ├── sync.py          # Google Calendar incremental sync (sync)
    ├── oauth.py         # token refresh helpers
    ├── pushover.py      # PushoverClient
    ├── tts.py           # TTSClient (pychromecast + gTTS)
    └── tts_settings.py  # reads tts_enabled from DB (sync)

backend/migrations/versions/   ← Alembic chain, HEAD is 0005
├── fb2466e21e43_init.py
├── 8f8f43ed5ce5_add_calendar_events_and_calendar_sync.py
├── 0002_add_tasks_table.py
├── 0003_add_app_settings_and_routines.py
├── 0004_add_tts_enabled.py
└── 0005_add_done_to_calendar_events.py    ← current HEAD
```

### Frontend file layout

```
frontend/src/
├── App.tsx              # BrowserRouter, Routes: /today /tasks /settings
├── pages/
│   ├── Today.tsx        # useTasks + useCalendarEvents → buildAgenda → AgendaItem list
│   ├── Tasks.tsx        # full task CRUD + TaskDrawer
│   └── Settings.tsx     # brief time, TTS toggle, Google Home
├── components/
│   ├── AgendaItem.tsx   # renders one agenda row (task or event)
│   ├── BottomNav.tsx    # /today /tasks /settings tabs
│   ├── TaskDrawer.tsx
│   ├── RoutineDrawer.tsx
│   └── FAB.tsx
├── hooks/
│   ├── useTasks.ts
│   ├── useCalendarEvents.ts
│   ├── useRoutines.ts
│   ├── useBriefSettings.ts
│   └── useGoogleHome.ts
├── lib/
│   └── agenda.ts        # buildAgenda / buildWeekAgenda — pure merge function
└── types/
    ├── task.ts          # Task, AgendaItem types
    ├── calendar.ts
    └── routine.ts
```

### Key architectural facts that v2.0 must respect

- All router handlers are **async** and receive `AsyncSession` via `Depends(get_session)`.
- `brief.py`, `sync.py`, and `tts_settings.py` are **sync** services that build their own sync SQLAlchemy sessions (`create_engine` + `sessionmaker`). APScheduler runs them in a thread pool via `run_in_threadpool` or direct call. This pattern must be followed for any code called from the scheduler.
- There is **no** `Base.metadata.create_all()` anywhere. Tables exist only via Alembic migrations. New models require a new migration file — the table will not exist in any environment (test, Pi) until the migration runs.
- Current Alembic HEAD is `0005`. Every new migration must set `down_revision = '0005'` (or the migration immediately preceding it in the chain).
- `brief.py::build_brief_body` and `build_brief_speech` are the composition points for the daily brief. v2.0 guidance output plugs in here.
- `agenda.ts::buildAgenda` is the frontend composition point for Today view. v2.0 plan blocks can be surfaced here or in a new page.

---

## v2.0 Integration Architecture

### System overview after v2.0

```
┌──────────────────────────────────────────────────────────────────────┐
│  React SPA                                                           │
│                                                                      │
│  EXISTING pages:  /today   /tasks   /settings                        │
│  NEW pages:       /goals   /organize   /ingest                       │
│                                                                      │
│  BottomNav adds: Goals tab                                           │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS (Tailscale / nginx)
┌───────────────────────────▼──────────────────────────────────────────┐
│  FastAPI                                                             │
│                                                                      │
│  EXISTING (unchanged):                                               │
│  tasks  routines  events  auth  calendar_status  settings            │
│  tts  webhooks                                                       │
│                                                                      │
│  NEW ROUTERS:                                                        │
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ /ingest    │  │ /goals   │  │ /plan        │  │ /guidance     │  │
│  │ preview    │  │ CRUD     │  │ propose      │  │ summary       │  │
│  │ confirm    │  │ progress │  │ approve      │  │               │  │
│  └─────┬──────┘  └────┬─────┘  └──────┬───────┘  └───────┬───────┘  │
│        │              │               │                   │          │
│  ┌─────▼──────────────▼───────────────▼───────────────────▼───────┐  │
│  │  NEW SERVICES                                                   │  │
│  │  ingest_service.py  goal_service.py  planner_service.py        │  │
│  │  guidance_service.py                                            │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  MODIFIED SERVICES:                                                  │
│  brief.py — appends goal_summary from guidance_service              │
│  scheduler.py — adds schedule_guidance_check() job                  │
└──────────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────────┐
│  SQLite WAL                                                          │
│                                                                      │
│  EXISTING: tasks  routines  app_settings  calendar_events            │
│            calendar_sync  apscheduler_jobs                           │
│                                                                      │
│  NEW (via Alembic, in chain order):                                  │
│  0006: goals table                                                   │
│  0007: goal_id + external_key columns added to tasks                 │
│  0008: goal_id + external_key columns added to routines              │
│  0009: scheduled_blocks table                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 1. Ingest: Router + Service Split, Versioning, Preview-then-Commit, Upsert

### Router: `app/routers/ingest.py` (NEW)

Two endpoints only:

```
POST /api/v1/ingest/preview   → IngestPreview   (no DB writes, read-only)
POST /api/v1/ingest/confirm   → IngestResult    (transactional write)
```

Both accept the same `IngestPayload` body. The preview is pure computation; confirm is the transactional apply. The client resends the full payload on confirm — no session state is kept server-side between calls. This avoids a pending-import table and a cleanup job.

### Service: `app/services/ingest_service.py` (NEW)

Two public functions, one private shared resolution step:

```python
async def preview_import(payload: IngestPayload, session: AsyncSession) -> IngestPreview:
    return await _resolve(payload, session, dry_run=True)

async def apply_import(payload: IngestPayload, session: AsyncSession) -> IngestResult:
    async with session.begin():
        return await _resolve(payload, session, dry_run=False)

async def _resolve(payload, session, dry_run: bool):
    # 1. look up existing goals by external_key
    # 2. look up existing tasks by external_key
    # 3. look up existing routines by external_key
    # 4. if dry_run: return diff; else: write upserts
```

Sharing `_resolve` ensures the preview diff is identical to what confirm writes. No drift risk.

### Payload schema and versioning: `app/schemas/ingest.py` (NEW)

```python
class IngestPayload(BaseModel):
    schema_version: Literal["1.0"]   # Pydantic rejects unknown versions with 422 before service runs
    goals: list[GoalImport] = []
    tasks: list[TaskImport] = []
    routines: list[RoutineImport] = []

class GoalImport(BaseModel):
    external_key: str          # stable slug, e.g. "learn-guitar-2026"
    title: str
    description: str | None = None
    target_date: date | None = None

class TaskImport(BaseModel):
    external_key: str          # e.g. "learn-guitar-2026/practice-chords"
    goal_key: str | None = None
    title: str
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    recurrence_cron: str | None = None

class RoutineImport(BaseModel):
    external_key: str
    goal_key: str | None = None
    name: str
    cron: str
    action: RoutineAction = RoutineAction.send_daily_brief
```

`schema_version` as `Literal["1.0"]` means Pydantic's 422 handler rejects payload from a future version automatically. When v1.1 is needed, extend to `Literal["1.0", "1.1"]` and branch inside the service.

### Upsert / idempotency semantics

Match on `external_key`, not title. This is a stable key the LLM produces; re-importing the same payload must be safe to do multiple times.

Resolution rules:
- `external_key` found in DB → **update** changed fields. Do NOT overwrite user-set fields: `completed`, `reminder_at`, `enabled`.
- `external_key` not found → **create**.
- Record in DB but absent from payload → **leave unchanged** (no deletions on import).

Write order inside the transaction: goals first (so `goal_id` FK is resolvable), then tasks, then routines.

### Preview response shape: `IngestPreview`

```python
class IngestPreview(BaseModel):
    goals_to_create: list[GoalImport]
    goals_to_update: list[GoalImport]
    tasks_to_create: list[TaskImport]
    tasks_to_update: list[TaskImport]
    routines_to_create: list[RoutineImport]
    routines_to_update: list[RoutineImport]
    warnings: list[str]   # unknown goal_keys, invalid cron expressions, etc.
```

Frontend renders a summary ("3 goals, 12 tasks, 2 routines — 1 already exists and will be updated"). User confirms by reposting the same payload to `/ingest/confirm`.

---

## 2. Goals: Data Model, Relationships, Progress

### Model: `app/models/goal.py` (NEW)

```python
class Goal(Base):
    __tablename__ = "goals"
    id:           Mapped[int]       = mapped_column(primary_key=True)
    external_key: Mapped[str|None]  = mapped_column(String(200), unique=True, nullable=True, index=True)
    title:        Mapped[str]       = mapped_column(String(255), nullable=False)
    description:  Mapped[str|None]  = mapped_column(Text, nullable=True)
    target_date:  Mapped[date|None] = mapped_column(Date, nullable=True)
    archived:     Mapped[bool]      = mapped_column(Boolean, default=False)
    created_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:   Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tasks:    Mapped[list["Task"]]    = relationship("Task", back_populates="goal", lazy="select")
    routines: Mapped[list["Routine"]] = relationship("Routine", back_populates="goal", lazy="select")
```

`external_key` is nullable so manually-created goals (from the UI, not ingest) don't need one. The `unique=True` constraint with nullable values works correctly in SQLite (NULLs are not compared by the unique constraint).

### Changes to existing models (ORM additions, NOT new files)

In `app/models/__init__.py` — add to `Task` ORM class:

```python
goal_id:      Mapped[int|None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
external_key: Mapped[str|None] = mapped_column(String(200), unique=True, nullable=True, index=True)
goal:         Mapped["Goal"|None] = relationship("Goal", back_populates="tasks")
```

In `app/models/__init__.py` — add to `Routine` ORM class:

```python
goal_id:      Mapped[int|None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
external_key: Mapped[str|None] = mapped_column(String(200), unique=True, nullable=True, index=True)
goal:         Mapped["Goal"|None] = relationship("Goal", back_populates="routines")
```

### Progress: derived on read, not stored

`app/services/goal_service.py::compute_progress(goal_id, session)` returns:

```python
class GoalProgress(BaseModel):
    total_tasks: int
    completed_tasks: int
    pct: int             # 0-100
    overdue_count: int
    next_due: datetime | None
```

Computed by querying `tasks WHERE goal_id = X`. No cached column — avoids stale values and the extra write on every task patch. SQLite at personal scale makes this free.

### Migration ordering (Alembic chain)

```
0005 (current HEAD)
  └── 0006: CREATE TABLE goals
        └── 0007: ALTER TABLE tasks ADD COLUMN goal_id, external_key
              └── 0008: ALTER TABLE routines ADD COLUMN goal_id, external_key
                    └── 0009: CREATE TABLE scheduled_blocks
```

0007 must follow 0006 because the FK references `goals.id`. 0008 is independent of 0009 but both depend on 0007 existing first for cleanliness. Run `alembic upgrade head` once after all four migration files are written.

### Router: `app/routers/goals.py` (NEW)

```
GET    /api/v1/goals/              → list[GoalRead]
POST   /api/v1/goals/              → GoalRead
GET    /api/v1/goals/{id}          → GoalRead
PATCH  /api/v1/goals/{id}          → GoalRead
DELETE /api/v1/goals/{id}          → 204
GET    /api/v1/goals/{id}/progress → GoalProgress
```

---

## 3. Day Planner: Pure Service, Proposed vs. Committed Blocks

### Where it lives: `app/services/planner_service.py` (NEW)

A **pure deterministic function** — no I/O, no async, no DB calls:

```python
def propose_day_plan(
    tasks: list[Task],
    events: list[CalendarEvent],
    target_date: date,
    work_start: time = time(9, 0),
    work_end: time = time(18, 0),
    default_block_minutes: int = 30,
) -> list[ProposedBlock]:
    # 1. Build fixed-event timeline from CalendarEvent records for target_date
    # 2. Find gaps between fixed events within the work window
    # 3. Assign pending tasks (sorted priority → due_date) into gaps
    # 4. Return list[ProposedBlock] — no DB write ever
```

Being pure means it is trivially unit-testable with no database or async context.

### Router: `app/routers/plan.py` (NEW)

```
GET  /api/v1/plan/propose?date=YYYY-MM-DD  → list[ProposedBlock]   (pure fn, no DB write)
POST /api/v1/plan/approve                  → list[ScheduledBlock]  (writes approved blocks)
GET  /api/v1/plan/blocks?date=YYYY-MM-DD   → list[ScheduledBlock]  (reads committed blocks)
DELETE /api/v1/plan/blocks/{id}            → 204
```

`GET /plan/propose` fetches tasks and events from the DB inside the router (async session), calls the pure service function, returns the result. No write happens.

### Two representations: proposed vs. committed

**ProposedBlock** — transient, never persisted. Lives only in the API response:

```python
class ProposedBlock(BaseModel):
    task_id: int | None      # None for buffer/break slots
    title: str
    start_dt: datetime
    end_dt: datetime
    source: Literal["task", "buffer"]
```

**ScheduledBlock** — persisted. Model in `app/models/plan.py` (NEW):

```python
class ScheduledBlock(Base):
    __tablename__ = "scheduled_blocks"
    id:          Mapped[int]        = mapped_column(primary_key=True)
    task_id:     Mapped[int|None]   = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    title:       Mapped[str]        = mapped_column(String(255))
    start_dt:    Mapped[datetime]   = mapped_column(DateTime(timezone=True))
    end_dt:      Mapped[datetime]   = mapped_column(DateTime(timezone=True))
    date_key:    Mapped[str]        = mapped_column(String(10), index=True)   # "YYYY-MM-DD"
    approved_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
```

`date_key` (indexed) lets `GET /plan/blocks?date=X` query by day without datetime range arithmetic.

`POST /plan/approve` receives the user-edited list of ProposedBlocks. Inside one transaction: delete existing ScheduledBlock rows for that date, then insert the approved set. The user may have removed, reordered, or added buffer slots — the approve endpoint accepts whatever the user submitted, not just the output of propose.

### Frontend integration

**`Today.tsx` (MODIFIED):** Add a `GET /api/v1/plan/blocks?date=today` fetch alongside the existing tasks and events fetches. Pass blocks as a third argument into `buildAgenda`. Committed blocks render in the timeline — if they have a `task_id`, they look like existing task items.

**`agenda.ts::buildAgenda` (MODIFIED):** Accept an optional `blocks: ScheduledBlock[]` parameter. Inject them into the timed items list. A block without a `task_id` renders as a buffer slot (distinct style).

**New page `/organize` (NEW):** Renders the propose → review → approve flow. Fetches propose on load, lets user drag/remove blocks, then submits to approve.

---

## 4. Guidance: Plugging into the Existing Daily Brief

### Composition point: `app/services/brief.py` (MODIFIED)

`build_brief_body()` and `build_brief_speech()` are the two functions to modify. Both currently end with a `lines` list. Extend each to call `guidance_service.build_goal_summary()` and append the result:

```python
# At the end of build_brief_body(), before the final join:
goal_summary = guidance_service.build_goal_summary()
if goal_summary:
    lines.append("")
    lines.extend(goal_summary)
```

No other changes to `brief.py`. The brief remains one function, one output.

### New service: `app/services/guidance_service.py` (NEW)

Sync function — same pattern as `brief.py` (uses `create_engine` + `sessionmaker` directly, NOT `AsyncSession`):

```python
_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)

def build_goal_summary() -> list[str]:
    """
    Returns plain-text lines describing active goal status.
    Called from brief.py (sync context, runs in APScheduler thread pool).
    Examples:
      "Goals: Learn Guitar — 3 of 10 tasks done (30%)"
      "Overdue: Practice scales was due yesterday"
    """

def build_guidance_summary() -> GuidanceSummary:
    """
    Called from the /guidance/summary endpoint (via run_in_threadpool).
    Returns structured goal progress for the frontend.
    """
```

This must stay sync to match the existing pattern. Making it async would require `asyncio.run()` inside a thread that may already have a running event loop — a known deadlock path.

### New router: `app/routers/guidance.py` (NEW)

```
GET /api/v1/guidance/summary   → GuidanceSummary
```

The router calls `build_guidance_summary()` via `run_in_threadpool` (same pattern as `webhooks.py` calling `send_daily_brief`).

### Proactive nudges via scheduler

Extend `app/scheduler.py` with a new function `schedule_guidance_check()`. The job runs daily (or on an interval) and calls a sync function that checks: goals with overdue tasks, goals with no tasks assigned, days where no blocks are approved. If thresholds are met, fires a Pushover notification. Registered in `main.py` lifespan alongside the existing `schedule_daily_brief` call.

---

## Component Classification: New vs. Modified

### NEW — create from scratch

| File | Type |
|------|------|
| `app/models/goal.py` | Model |
| `app/models/plan.py` | Model (ScheduledBlock) |
| `app/schemas/ingest.py` | Schema |
| `app/schemas/goal.py` | Schema |
| `app/schemas/plan.py` | Schema |
| `app/routers/ingest.py` | Router |
| `app/routers/goals.py` | Router |
| `app/routers/plan.py` | Router |
| `app/routers/guidance.py` | Router |
| `app/services/ingest_service.py` | Service |
| `app/services/goal_service.py` | Service |
| `app/services/planner_service.py` | Service (pure fn) |
| `app/services/guidance_service.py` | Service (sync) |
| `migrations/versions/0006_create_goals.py` | Migration |
| `migrations/versions/0007_task_goal_fk.py` | Migration |
| `migrations/versions/0008_routine_goal_fk.py` | Migration |
| `migrations/versions/0009_create_scheduled_blocks.py` | Migration |
| `frontend/src/pages/Goals.tsx` | Frontend page |
| `frontend/src/pages/Organize.tsx` | Frontend page |
| `frontend/src/pages/Ingest.tsx` | Frontend page |
| `frontend/src/hooks/useGoals.ts` | Hook |
| `frontend/src/hooks/usePlan.ts` | Hook |
| `frontend/src/hooks/useGuidance.ts` | Hook |
| `frontend/src/types/goal.ts` | Type |
| `frontend/src/types/plan.ts` | Type |

### MODIFIED — targeted additions only

| File | What changes |
|------|--------------|
| `app/models/__init__.py` | Add Goal + ScheduledBlock imports; add `goal_id` + `external_key` + relationship to Task and Routine ORM classes |
| `app/main.py` | Register 4 new routers: `ingest`, `goals`, `plan`, `guidance` |
| `app/services/brief.py` | Call `guidance_service.build_goal_summary()` and append result in `build_brief_body` and `build_brief_speech` |
| `app/scheduler.py` | Add `schedule_guidance_check()` |
| `frontend/src/App.tsx` | Add routes for `/goals`, `/organize`, `/ingest` |
| `frontend/src/components/BottomNav.tsx` | Add Goals tab |
| `frontend/src/pages/Today.tsx` | Fetch plan blocks, pass to buildAgenda |
| `frontend/src/lib/agenda.ts` | Accept optional `ScheduledBlock[]` param in buildAgenda |

---

## Data Flows

### Ingest flow

```
User pastes LLM JSON into Ingest.tsx
  → POST /api/v1/ingest/preview
      → ingest_service._resolve(payload, session, dry_run=True)
          → SELECT goals WHERE external_key IN (...)
          → SELECT tasks WHERE external_key IN (...)
          → SELECT routines WHERE external_key IN (...)
          → returns diff (no writes)
      → IngestPreview response
  → UI shows: "3 goals to create, 1 task to update, 0 routines to change"
  → User clicks Confirm
  → POST /api/v1/ingest/confirm (same payload, client resends)
      → ingest_service._resolve(payload, session, dry_run=False)
          → session.begin()
          → UPSERT goals (external_key match) — goals first
          → UPSERT tasks (external_key match, resolve goal_id from goals upserted above)
          → UPSERT routines (external_key match, resolve goal_id)
          → commit
      → IngestResult (created/updated counts)
```

### Day planner flow

```
User opens Organize.tsx
  → GET /api/v1/plan/propose?date=2026-06-16
      → fetch tasks WHERE completed=False from DB
      → fetch events WHERE date_key='2026-06-16' from DB
      → planner_service.propose_day_plan(tasks, events, date)  ← pure fn, no DB
      → list[ProposedBlock] response
  → UI renders draggable time-block list
  → User removes 2 blocks, reorders 1
  → POST /api/v1/plan/approve {date: ..., blocks: [...]}
      → DELETE ScheduledBlock WHERE date_key='2026-06-16'
      → INSERT approved blocks
      → list[ScheduledBlock] response
  → Today.tsx fetches GET /api/v1/plan/blocks?date=today
      → merges into buildAgenda alongside tasks and events
```

### Brief augmentation flow

```
APScheduler fires send_daily_brief() [sync, APScheduler thread pool]
  → build_brief_body()
      → query tasks for today (existing)
      → query events for today (existing)
      → guidance_service.build_goal_summary()   ← NEW (sync, same _Session pattern)
      → concatenate all sections
  → PushoverClient().send(body)
  → if TTS enabled: build_brief_speech() [same structure] → TTSClient().speak()
```

---

## Build Order (Dependency-Aware)

### Phase 8 — Goals + Ingest

Build first. Every other v2.0 feature either depends on Goal rows existing or is independent enough to build concurrently.

1. Write migrations 0006, 0007, 0008 (goals table, then FK columns on tasks, then FK columns on routines). Run `alembic upgrade head` to validate the chain before writing any service code.
2. `app/models/goal.py` — Goal ORM model
3. Update `app/models/__init__.py` — add `goal_id`, `external_key`, relationships to Task and Routine
4. `app/schemas/goal.py`, `app/services/goal_service.py`, `app/routers/goals.py` — Goals CRUD
5. Register goals router in `main.py`
6. `app/schemas/ingest.py`, `app/services/ingest_service.py`, `app/routers/ingest.py` — Ingest
7. Register ingest router in `main.py`
8. Frontend: `useGoals`, `Goals.tsx`, `Ingest.tsx`, BottomNav + routes in App.tsx

### Phase 9 — Day Planner

Depends on: tasks and events exist (Phases 1-4). `goal_id` on tasks is nullable so planner works before any goals are populated.

1. Write migration 0009 (scheduled_blocks). `alembic upgrade head`.
2. `app/models/plan.py` — ScheduledBlock ORM model; import in `models/__init__.py`
3. `app/services/planner_service.py` — pure propose function. Write unit tests first (no DB needed).
4. `app/schemas/plan.py` — ProposedBlock, ScheduledBlock schemas
5. `app/routers/plan.py` — propose + approve + read + delete endpoints
6. Register plan router in `main.py`
7. Frontend: `usePlan`, `Organize.tsx`
8. Modify `Today.tsx` and `agenda.ts` to surface committed blocks in the timeline

### Phase 10 — Guidance

Depends on: goals + progress (Phase 8). Day planner is optional (nudges about un-blocked tasks can be deferred).

1. `app/services/guidance_service.py` — sync, mirrors brief.py pattern
2. Modify `app/services/brief.py` — append goal summary to body and speech
3. `app/routers/guidance.py` — `GET /guidance/summary`
4. Register guidance router in `main.py`
5. Extend `app/scheduler.py` — `schedule_guidance_check()`
6. Extend `main.py` lifespan — call `schedule_guidance_check()`
7. Frontend: `useGuidance`, goal-progress display in `Goals.tsx`

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing ingest state server-side between preview and confirm

**What it looks like:** A `pending_imports` table; preview writes a row and returns a token; confirm looks up the token.

**Why it's wrong:** Adds a table, a cleanup job for stale rows, and a race if the user refreshes. The payload is small (personal JSON).

**Do this instead:** Client resends the full payload on confirm. `_resolve()` is fast on personal-scale SQLite data. No server state needed.

### Anti-Pattern 2: Caching goal progress in a column

**What it looks like:** `Goal.completed_task_count` updated every time a task is patched.

**Why it's wrong:** Requires a second write on every `PATCH /tasks/{id}`, adds a consistency hazard, and adds a trigger-like dependency between two models.

**Do this instead:** Derive progress in `goal_service.compute_progress()` on each read. Free at personal scale.

### Anti-Pattern 3: Auto-committing the proposed day plan

**What it looks like:** `GET /plan/propose` writes ScheduledBlock rows immediately.

**Why it's wrong:** Violates the suggest-then-approve contract stated in the project requirements. User has no chance to review or edit.

**Do this instead:** `GET /plan/propose` is read-only (pure function, no DB write). Only `POST /plan/approve` writes.

### Anti-Pattern 4: Making guidance_service async and calling it from brief.py

**What it looks like:** `async def build_goal_summary()` called inside the sync `build_brief_body()`.

**Why it's wrong:** `brief.py` runs in APScheduler's thread pool. Calling `asyncio.run()` inside a thread that already has a running event loop causes a deadlock or RuntimeError.

**Do this instead:** `guidance_service.build_goal_summary()` is sync, uses the same `create_engine` + `sessionmaker` pattern already in `brief.py` and `tts_settings.py`.

### Anti-Pattern 5: Adding external_key as NOT NULL to existing tables

**What it looks like:** Migration 0007 defines `external_key TEXT NOT NULL` on the tasks table.

**Why it's wrong:** Existing task rows have no external_key. SQLite's ALTER TABLE with a NOT NULL column that has no default will fail on a non-empty database.

**Do this instead:** `external_key` is nullable. Unique constraint on nullable columns in SQLite correctly excludes NULL values from uniqueness checks. Only ingest-created records carry an external_key; manually created records leave it NULL.

---

## Integration Points Summary

| New Component | Integrates With | Integration Method |
|---------------|-----------------|-------------------|
| `ingest_service.py` | `Goal`, `Task`, `Routine` models | Async SQLAlchemy upserts in shared session |
| `goal_service.py` | `Task` model | Queries `task.goal_id` in async session |
| `planner_service.py` | `Task`, `CalendarEvent` ORM objects | Pure function — receives ORM objects, returns Pydantic models |
| `guidance_service.py` | `Goal`, `Task` models | Sync `_Session` (same pattern as `brief.py`) |
| `brief.py` (modified) | `guidance_service` | Sync call to `build_goal_summary()` |
| `Today.tsx` (modified) | `GET /api/v1/plan/blocks` | Third fetch alongside existing tasks+events |
| `agenda.ts` (modified) | `ScheduledBlock[]` | Optional third param, merged into timed items |
| `scheduler.py` (modified) | `guidance_service` | New `schedule_guidance_check()` job, sync in thread pool |

---

*Architecture research for: My Secretary v2.0 (Ingest, Organize, Guide)*
*Researched: 2026-06-15*
