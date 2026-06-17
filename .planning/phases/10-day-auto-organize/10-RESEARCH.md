# Phase 10: Day Auto-Organize — Research

**Researched:** 2026-06-17
**Domain:** Interval-fill day planner, propose/approve/re-plan flow, ScheduledBlock persistence, staleness detection, Settings extension, React Organize page
**Confidence:** HIGH (grounded entirely in direct codebase inspection; no new libraries introduced)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Candidate task pool = tasks due today + overdue (past-due, still pending). Pressing-work set.
- **D-02:** Backfill remaining free time with other pending tasks (not yet due, or no due date) once due/overdue tasks are placed. Backfill still ordered by priority → due-date proximity. User can remove in review.
- **D-03:** Habits excluded — `is_habit` tasks are NOT scheduled as blocks.
- **D-04:** Ordering within each tier is priority → due-date proximity.
- **D-05:** `work_start` / `work_end` added to `AppSettings` (defaults 9:00 / 18:00), editable on Settings page.
- **D-06:** Pack blocks back-to-back — no auto-inserted buffers/breaks.
- **D-07:** Place-if-fits-else-skip — full `estimated_minutes` (default 30) must fit in gap; no truncation or splitting.
- **D-08:** First Approve for a date commits. Subsequent naked Approve for the same date is HTTP 409.
- **D-09:** Explicit Re-plan replaces committed plan (delete-then-insert). Mechanism is Claude's discretion.
- **D-10:** Revisiting Organize for an already-approved date loads committed blocks in an "already approved" state with a Re-plan button.
- **D-11:** Unplaced tasks appear in a distinct "Didn't fit" list on Organize page.
- **D-12:** Fully-booked day → propose returns no blocks; Organize shows "No free time today — your calendar is full."
- **D-13:** Staleness warning per-block: names conflicting event title; detected on read (compare committed blocks against current events).
- **D-14:** Edit affordances: remove, reorder (up/down tap buttons, NOT drag-drop), adjust start/duration.

### Claude's Discretion
- Exact mechanism for re-plan signal on approve (flag, `?replace=true`, or separate `/plan/replan` endpoint).
- Best-fit vs. first-fit gap assignment (default to first-fit by chronological gap).
- Exact visual styling of staleness badge, "Didn't fit" list, block rendering in Today.
- Whether `GET /plan/propose` excludes already-passed gaps for today (recommended: yes).
- Schema/field layout for `ProposedBlock` / `ScheduledBlock` beyond ARCHITECTURE.md §3.

### Deferred Ideas (OUT OF SCOPE)
- Scheduling habits into the day plan.
- Auto-inserted buffers/breaks between blocks.
- Splitting or truncating long tasks across gaps.
- Google Calendar write-back of approved blocks.
- Multi-day / week planning.
- Voice / Google Home "organize my day" trigger.
- Goal-urgency weighting in task ordering.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAN-01 | User can request a proposed plan for the current day — planner treats synced calendar events as fixed blocks, finds free intervals, fills them with pending tasks ordered by priority and due date, sized from `estimated_minutes` (default 30) | Gap-finding algorithm, task candidate pool, ordering sort keys — all resolved below |
| PLAN-02 | User can review the proposed plan and accept/edit/reject blocks before anything commits; approved plan stored locally and rendered in Today view (no Google Calendar write in v2.0) | Propose/approve/re-plan flow, ScheduledBlock model, 0009 migration, Today.tsx integration — all resolved below |
</phase_requirements>

---

## Summary

Phase 10 is a self-contained feature built entirely on the existing stack: no new Python packages and no new frontend libraries are needed. The backend adds one Alembic migration (0009), one model, one schema file, one service (pure function), one router, and targeted extensions to `AppSettings`, its schema, and its router. The frontend adds one page, one hook, one type file, and targeted modifications to `agenda.ts`, `Today.tsx`, `AgendaItem.tsx`, `App.tsx`, and `BottomNav.tsx`.

Every gray area left open in CONTEXT.md is resolved here. The planner can write task-level plans directly from this document without further investigation.

**Primary recommendation:** Implement the planner as a pure deterministic Python function (`planner_service.propose_day_plan`) that receives ORM objects and returns Pydantic models with no side effects. Signal re-plan intent via a separate `POST /plan/replan` endpoint (cleaner than a query flag on approve; keeps the approve endpoint semantically simple). Exclude past gaps for today-only proposals.

---

## Standard Stack

No new packages. All v2.0 requirements are met by the already-installed stack.

| Layer | Library | Version (installed) | Role in Phase 10 |
|-------|---------|--------------------|--------------------|
| Backend | FastAPI + Pydantic v2 | 0.128.x / v2 | Plan router + schemas |
| Backend | SQLAlchemy 2.0 async | 2.0.x | ScheduledBlock model + async queries |
| Backend | Alembic | 1.13.x | Migration 0009 |
| Backend | aiosqlite | 0.20.x | SQLite async driver |
| Frontend | React 19 | 19.2.x | Organize page + Today integration |
| Frontend | Vite 8 | 8.x | Build tool |

**Installation delta:** None. Zero new packages.

---

## Architecture Patterns

### File Map: What Gets Created vs Modified

**NEW — create from scratch:**

```
backend/app/models/plan.py             ← ScheduledBlock ORM model
backend/app/schemas/plan.py            ← ProposedBlock + ApproveRequest + ScheduledBlockRead schemas
backend/app/services/planner_service.py ← pure propose_day_plan function (no DB, no async)
backend/app/routers/plan.py            ← 5 endpoints
backend/migrations/versions/0009_create_scheduled_blocks.py
frontend/src/pages/Organize.tsx        ← review/edit/approve flow
frontend/src/hooks/usePlan.ts          ← data-fetching hook
frontend/src/types/plan.ts             ← ScheduledBlock + ProposedBlock TS types
```

**MODIFIED — targeted additions only:**

```
backend/app/models/__init__.py         ← add work_start/work_end to AppSettings; import ScheduledBlock
backend/app/schemas/settings.py        ← add WorkHoursRead/WorkHoursUpdate
backend/app/routers/settings.py        ← add GET/PUT /settings/work-hours
backend/app/main.py                    ← include plan router
frontend/src/lib/agenda.ts             ← buildDayItems/buildWeekAgenda accept optional blocks param
frontend/src/pages/Today.tsx           ← fetch plan blocks + staleness badge
frontend/src/components/AgendaItem.tsx ← block/stale styling variants
frontend/src/App.tsx                   ← add /organize route
frontend/src/components/BottomNav.tsx  ← add Organize tab
```

### Recommended Project Structure (additions only)

```
backend/app/
├── models/
│   └── plan.py          ← ScheduledBlock
├── schemas/
│   └── plan.py          ← ProposedBlock, ApproveRequest, ScheduledBlockRead
├── services/
│   └── planner_service.py  ← pure fn, no imports from app.db
└── routers/
    └── plan.py          ← /plan/* endpoints

frontend/src/
├── pages/
│   └── Organize.tsx
├── hooks/
│   └── usePlan.ts
└── types/
    └── plan.ts
```

---

## Resolved Gray Areas

### 1. Free-Interval / Gap-Finding Algorithm

**Implementation (pure Python, O(n log n)):**

```python
# Source: ARCHITECTURE.md §3 + CONTEXT.md D-05..D-07
def _find_gaps(
    events: list[CalendarEvent],
    work_start: time,
    work_end: time,
    target_date: date,
    now: datetime | None = None,  # for "exclude past gaps" on today
) -> list[tuple[datetime, datetime]]:
    """
    Returns list of (gap_start, gap_end) UTC datetimes within the work window.
    All-day events (all_day=True, no start_dt) are skipped — context only.
    Multi-day events that span target_date and have start_dt are treated as
    full-day blockers only if they have start_dt/end_dt; all_day=True ones skip.
    """
    tz = ZoneInfo(SYSTEM_TZ)  # read from settings or os.environ["TZ"]

    ws = datetime.combine(target_date, work_start, tzinfo=tz).astimezone(timezone.utc)
    we = datetime.combine(target_date, work_end, tzinfo=tz).astimezone(timezone.utc)

    # Exclude past gaps when proposing for today
    if now is not None and now.date() == target_date:
        ws = max(ws, now)

    # Fixed blockers: only timed events (all_day=False, start_dt/end_dt not None)
    blockers = sorted(
        [(e.start_dt, e.end_dt) for e in events
         if not e.all_day and e.start_dt and e.end_dt
         and e.start_dt < we and e.end_dt > ws],
        key=lambda x: x[0],
    )

    gaps = []
    cursor = ws
    for bstart, bend in blockers:
        bstart = max(bstart, ws)
        bend = min(bend, we)
        if bstart > cursor:
            gaps.append((cursor, bstart))
        cursor = max(cursor, bend)
    if cursor < we:
        gaps.append((cursor, we))

    return gaps
```

**Key decisions confirmed:**
- All-day events: `all_day=True` in `CalendarEvent` model → skip entirely as blockers (PITFALLS.md §8, CONTEXT.md D-01 "context only"). Existing `CalendarEvent.all_day` field is accurate.
- Past gaps: excluded when `target_date == today` (Claude's discretion, recommended yes).
- First-fit chronological: assign task to the first gap with capacity. No best-fit needed.

**Task packing (first-fit, place-if-fits-else-skip):**

```python
def _pack_tasks(
    sorted_tasks: list[Task],
    gaps: list[tuple[datetime, datetime]],
    default_minutes: int = 30,
) -> tuple[list[ProposedBlock], list[Task]]:
    """Returns (placed_blocks, unplaced_tasks)."""
    gap_cursors = list(gaps)  # mutable copy of (cursor, end) pairs
    placed: list[ProposedBlock] = []
    unplaced: list[Task] = []

    for task in sorted_tasks:
        duration = timedelta(minutes=task.estimated_minutes or default_minutes)
        scheduled = False
        for i, (cursor, end) in enumerate(gap_cursors):
            if end - cursor >= duration:
                block_start = cursor
                block_end = cursor + duration
                placed.append(ProposedBlock(
                    task_id=task.id,
                    title=task.title,
                    start_dt=block_start,
                    end_dt=block_end,
                ))
                gap_cursors[i] = (block_end, end)
                scheduled = True
                break
        if not scheduled:
            unplaced.append(task)

    return placed, unplaced
```

### 2. Task Candidate Pool and Sort Keys

**Query (async, in router before calling pure service):**

```python
# Source: models/__init__.py inspection + CONTEXT.md D-01..D-04
from sqlalchemy import select, or_, and_, case

today = date.today()
today_start = datetime.combine(today, time.min, tzinfo=timezone.utc)
tomorrow_start = datetime.combine(today + timedelta(days=1), time.min, tzinfo=timezone.utc)

stmt = (
    select(Task)
    .where(
        Task.completed == False,
        Task.is_habit == False,
    )
)
tasks = (await session.execute(stmt)).scalars().all()
```

**Sort key (Python-side sort — avoids SQL complexity for a personal-scale dataset):**

```python
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}

def _priority_sort_key(task: Task) -> tuple:
    """
    Tier 0 = due today or overdue (pressing).
    Tier 1 = backfill (future due date or no due date).
    Within tier: priority (high=0) then due-date proximity (sooner=lower value).
    """
    today = date.today()
    due = task.due_date.date() if task.due_date else None

    tier = 0 if (due is not None and due <= today) else 1
    prio = PRIORITY_ORDER.get(task.priority.value, 1)
    # For proximity: None due → put last within tier (use far-future sentinel)
    proximity = (due - today).days if due is not None else 9999

    return (tier, prio, proximity)

sorted_tasks = sorted(tasks, key=_priority_sort_key)
```

This implements D-01 (pressing first), D-02 (backfill after), D-04 (priority → due-date proximity within tier), D-03 (habits excluded via query filter).

### 3. Idempotent Approve / Re-plan: Recommended Mechanism

**Decision: separate `/plan/replan` endpoint (not `?replace=true` flag).**

Rationale: `POST /plan/approve` is a semantically clear "first commit" action. A `?replace=true` query param on a POST is non-standard and easy to hit accidentally. A dedicated `/plan/replan` endpoint makes the intent explicit in the frontend UI and in logs. The behavior from D-08/D-09 is fully honored.

**Five endpoints:**

```
GET    /api/v1/plan/propose?date=YYYY-MM-DD  → ProposedDayPlan  (pure fn, never writes)
POST   /api/v1/plan/approve                  → list[ScheduledBlockRead]  (first commit only; 409 if exists)
POST   /api/v1/plan/replan                   → list[ScheduledBlockRead]  (delete-then-insert; always succeeds)
GET    /api/v1/plan/blocks?date=YYYY-MM-DD   → list[ScheduledBlockRead]  (reads committed blocks + staleness)
DELETE /api/v1/plan/blocks/{id}              → 204
```

**Approve endpoint body:**

```python
class ApproveRequest(BaseModel):
    date: date                    # "YYYY-MM-DD"
    blocks: list[ProposedBlock]   # user-edited list from Organize page
```

**Approve logic:**

```python
@router.post("/approve", response_model=list[ScheduledBlockRead], status_code=201)
async def approve_plan(body: ApproveRequest, session: AsyncSession = Depends(get_session)):
    date_key = body.date.isoformat()
    existing = (await session.execute(
        select(ScheduledBlock).where(ScheduledBlock.date_key == date_key).limit(1)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, detail=f"A plan for {date_key} already exists. Use /plan/replan to replace it.")
    return await _write_blocks(body, session)

@router.post("/replan", response_model=list[ScheduledBlockRead], status_code=200)
async def replan(body: ApproveRequest, session: AsyncSession = Depends(get_session)):
    date_key = body.date.isoformat()
    await session.execute(delete(ScheduledBlock).where(ScheduledBlock.date_key == date_key))
    return await _write_blocks(body, session)

async def _write_blocks(body: ApproveRequest, session: AsyncSession) -> list[ScheduledBlock]:
    date_key = body.date.isoformat()
    now = datetime.now(timezone.utc)
    rows = [
        ScheduledBlock(
            task_id=b.task_id,
            title=b.title,
            start_dt=b.start_dt,
            end_dt=b.end_dt,
            date_key=date_key,
            approved_at=now,
        )
        for b in body.blocks
    ]
    session.add_all(rows)
    await session.commit()
    for r in rows:
        await session.refresh(r)
    return rows
```

### 4. Read-Only Propose Guarantee

**How to guarantee it at the code level:**

`planner_service.py` must import nothing from `app.db` and have no async functions. The module-level imports are:

```python
# planner_service.py — ONLY these imports allowed
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from app.models import Task
from app.models.calendar import CalendarEvent
from app.schemas.plan import ProposedBlock, ProposedDayPlan
```

The router loads data (async), calls the pure function, returns the result. The function has no DB access path.

**How to verify in tests:** Monkeypatch `app.db.get_session` to raise `RuntimeError("DB called in propose!")`. Call `GET /plan/propose`. If the test passes (no RuntimeError), the guarantee holds. This is the concrete test for ROADMAP criterion 2.

**ProposedDayPlan schema (includes unplaced tasks — D-11):**

```python
class ProposedBlock(BaseModel):
    task_id: int | None      # None if future buffer-slot feature added
    title: str
    start_dt: datetime
    end_dt: datetime

class ProposedDayPlan(BaseModel):
    date: date
    blocks: list[ProposedBlock]
    unplaced_task_ids: list[int]   # task IDs that didn't fit any gap (D-11)
    fully_booked: bool             # True when gaps list is empty (D-12)
```

### 5. Staleness Detection

**Where it runs:** Backend, inside `GET /plan/blocks` response enrichment. The frontend fetches `/plan/blocks?date=YYYY-MM-DD` and gets back blocks already annotated with conflict info. No client-side comparison needed.

**Overlap test:**

```python
def _is_stale(block: ScheduledBlock, events: list[CalendarEvent]) -> str | None:
    """Returns conflicting event title or None."""
    for e in events:
        if e.all_day or not e.start_dt or not e.end_dt:
            continue
        # Overlap: two intervals overlap if start_A < end_B and start_B < end_A
        if block.start_dt < e.end_dt and e.start_dt < block.end_dt:
            return e.title
    return None
```

**ScheduledBlockRead schema (with staleness):**

```python
class ScheduledBlockRead(BaseModel):
    id: int
    task_id: int | None
    title: str
    start_dt: datetime
    end_dt: datetime
    date_key: str
    approved_at: datetime
    conflict_with: str | None = None  # populated on read if stale (D-13)
    model_config = {"from_attributes": True}
```

**GET /plan/blocks router logic:**

```python
@router.get("/blocks", response_model=list[ScheduledBlockRead])
async def get_blocks(date: str, session: AsyncSession = Depends(get_session)):
    blocks = (await session.execute(
        select(ScheduledBlock).where(ScheduledBlock.date_key == date)
        .order_by(ScheduledBlock.start_dt)
    )).scalars().all()

    # Fetch current events for staleness check
    target = date_fromisoformat(date)
    events = await _fetch_events_for_date(target, session)

    result = []
    for b in blocks:
        conflict = _is_stale(b, events)
        read = ScheduledBlockRead.model_validate(b)
        read.conflict_with = conflict
        result.append(read)
    return result
```

### 6. Data Model

**ScheduledBlock ORM model (`backend/app/models/plan.py`):**

```python
# Source: ARCHITECTURE.md §3 + CONTEXT.md code_context
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base
from app.models.calendar import UtcDateTime


class ScheduledBlock(Base):
    __tablename__ = "scheduled_blocks"

    id:          Mapped[int]          = mapped_column(primary_key=True)
    task_id:     Mapped[int | None]   = mapped_column(
                     ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    title:       Mapped[str]          = mapped_column(String(255), nullable=False)
    start_dt:    Mapped[datetime]     = mapped_column(UtcDateTime, nullable=False)
    end_dt:      Mapped[datetime]     = mapped_column(UtcDateTime, nullable=False)
    date_key:    Mapped[str]          = mapped_column(String(10), index=True)  # "YYYY-MM-DD"
    approved_at: Mapped[datetime]     = mapped_column(
                     UtcDateTime, default=lambda: datetime.now(timezone.utc))
```

**Use `UtcDateTime` (imported from `app.models.calendar`) for `start_dt`, `end_dt`, `approved_at`** — this is the established pattern in the codebase. Do not use bare `DateTime(timezone=True)`.

Import in `models/__init__.py`:
```python
from app.models.plan import ScheduledBlock  # noqa: E402,F401
```

### 7. Alembic Migration 0009

```python
# migrations/versions/0009_create_scheduled_blocks.py
revision = '0009'
down_revision = '0008'  # current HEAD confirmed from filesystem inspection

def upgrade() -> None:
    op.create_table(
        "scheduled_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(),
                  sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("start_dt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_dt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_key", sa.String(10), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scheduled_blocks_date_key", "scheduled_blocks", ["date_key"])
```

**Note:** Alembic HEAD is `0008` (confirmed by directory listing of `backend/migrations/versions/`). Set `down_revision = '0008'`.

### 8. AppSettings Extension (D-05)

**Model addition** (`models/__init__.py`, inside `AppSettings`):
```python
work_start_hour:   Mapped[int] = mapped_column(Integer, default=9)
work_start_minute: Mapped[int] = mapped_column(Integer, default=0)
work_end_hour:     Mapped[int] = mapped_column(Integer, default=18)
work_end_minute:   Mapped[int] = mapped_column(Integer, default=0)
```

Store as hour/minute integers matching the `brief_hour`/`brief_minute` pattern already in `AppSettings`. Do not store as `TIME` columns (avoids SQLite type complexity and is consistent with existing code).

**Migration:** Add these four columns to the existing migration 0009, or create a separate small migration. Recommended: include in 0009 since both are Phase 10 additions and `app_settings` ALTER via `batch_alter_table` is the established pattern (PITFALLS.md §14, Phase 08-02 note in STATE.md).

```python
# Inside 0009 upgrade(), after creating scheduled_blocks:
with op.batch_alter_table("app_settings") as batch_op:
    batch_op.add_column(sa.Column("work_start_hour", sa.Integer(), nullable=True))
    batch_op.add_column(sa.Column("work_start_minute", sa.Integer(), nullable=True))
    batch_op.add_column(sa.Column("work_end_hour", sa.Integer(), nullable=True))
    batch_op.add_column(sa.Column("work_end_minute", sa.Integer(), nullable=True))
```

Use `nullable=True` (not `server_default`) to avoid SQLite NOT NULL constraint issues on existing rows — then let SQLAlchemy defaults handle new rows.

**Schema additions** (`schemas/settings.py`):
```python
class WorkHoursRead(BaseModel):
    work_start: str   # "HH:MM"
    work_end: str     # "HH:MM"
    model_config = {"from_attributes": True}

class WorkHoursUpdate(BaseModel):
    work_start: str = Field(pattern=r"^\d{2}:\d{2}$")
    work_end: str   = Field(pattern=r"^\d{2}:\d{2}$")
```

**Router additions** (`routers/settings.py`):
```python
@router.get("/work-hours", response_model=WorkHoursRead)
async def get_work_hours(session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    sh = cfg.work_start_hour if cfg else 9
    sm = cfg.work_start_minute if cfg else 0
    eh = cfg.work_end_hour if cfg else 18
    em = cfg.work_end_minute if cfg else 0
    return WorkHoursRead(
        work_start=f"{sh:02d}:{sm:02d}",
        work_end=f"{eh:02d}:{em:02d}",
    )

@router.put("/work-hours", response_model=WorkHoursRead)
async def set_work_hours(body: WorkHoursUpdate, session: AsyncSession = Depends(get_session)):
    sh, sm = map(int, body.work_start.split(":"))
    eh, em = map(int, body.work_end.split(":"))
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, work_start_hour=sh, work_start_minute=sm,
                          work_end_hour=eh, work_end_minute=em)
        session.add(cfg)
    else:
        cfg.work_start_hour = sh; cfg.work_start_minute = sm
        cfg.work_end_hour = eh;   cfg.work_end_minute = em
    await session.commit()
    return WorkHoursRead(work_start=body.work_start, work_end=body.work_end)
```

### 9. Frontend Architecture

**`frontend/src/types/plan.ts` (new):**
```typescript
export interface ProposedBlock {
  task_id: number | null;
  title: string;
  start_dt: string;  // ISO UTC
  end_dt: string;
}

export interface ProposedDayPlan {
  date: string;             // YYYY-MM-DD
  blocks: ProposedBlock[];
  unplaced_task_ids: number[];
  fully_booked: boolean;
}

export interface ScheduledBlock {
  id: number;
  task_id: number | null;
  title: string;
  start_dt: string;
  end_dt: string;
  date_key: string;
  approved_at: string;
  conflict_with: string | null;
}
```

**`frontend/src/hooks/usePlan.ts` (new) — mirrors `useTasks.ts` pattern:**
```typescript
const API = "/api/v1/plan";

export function usePlan(dateKey: string) {
  const [blocks, setBlocks] = useState<ScheduledBlock[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchBlocks() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/blocks?date=${dateKey}`);
      setBlocks(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }

  async function propose(date: string): Promise<ProposedDayPlan | null> {
    const res = await fetch(`${API}/propose?date=${date}`);
    return res.ok ? await res.json() : null;
  }

  async function approve(date: string, blocks: ProposedBlock[]): Promise<ScheduledBlock[] | null> {
    const res = await fetch(`${API}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, blocks }),
    });
    if (res.status === 409) throw new Error("already_approved");
    return res.ok ? await res.json() : null;
  }

  async function replan(date: string, blocks: ProposedBlock[]): Promise<ScheduledBlock[]> {
    const res = await fetch(`${API}/replan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, blocks }),
    });
    return await res.json();
  }

  async function deleteBlock(id: number) {
    await fetch(`${API}/blocks/${id}`, { method: "DELETE" });
    await fetchBlocks();
  }

  useEffect(() => { fetchBlocks(); }, [dateKey]);

  return { blocks, loading, fetchBlocks, propose, approve, replan, deleteBlock };
}
```

**`frontend/src/lib/agenda.ts` modification:**

`buildDayItems` accepts an optional `blocks: ScheduledBlock[]` third parameter. Blocks are injected into the `timedItems` list as `AgendaItem` entries with `isBlock: true` and `conflict_with` set. No changes to the function signature for `buildWeekAgenda` (blocks only show for today in Today.tsx, not the week view — or pass `[]` for non-today days).

```typescript
// Add to AgendaItem in types/task.ts:
export interface AgendaItem {
  // ... existing fields ...
  isBlock?: boolean;
  conflict_with?: string | null;
  blockId?: number;
}
```

```typescript
// Inside buildDayItems, before the timedItems sort:
for (const b of (blocks ?? [])) {
  const d = new Date(b.start_dt);
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  timedItems.push({
    id: `block-${b.id}`,
    title: b.title,
    time,
    priority: null,
    isEvent: false,
    isBlock: true,
    completed: false,
    blockId: b.id,
    conflict_with: b.conflict_with,
  });
}
```

**`Today.tsx` modifications:**
- Add `usePlan(todayKey)` alongside `useTasks()` and `useCalendarEvents()`.
- Pass `blocks` to `buildDayItems` (today only; week view other days get `[]`).
- `AgendaItem` with `conflict_with !== null` shows staleness badge.

**`Organize.tsx` state machine:**

```
State:
  "loading"       → fetching existing blocks for date
  "approved"      → committed blocks exist → show them + Re-plan button (D-10)
  "proposing"     → GET /plan/propose in flight
  "editing"       → user has proposal, can remove/reorder/adjust
  "fully_booked"  → no blocks, fully_booked=true → show "No free time" message (D-12)
  "saving"        → POST /plan/approve in flight (button disabled)
  "done"          → successfully approved
```

**Reorder buttons (D-14 — tap, not drag):**
Each block row has Up/Down buttons. Clicking swaps the block with its neighbor in local state. On Approve, the user-ordered list is submitted verbatim. No library needed — a simple array index swap.

```typescript
function moveBlock(index: number, direction: -1 | 1) {
  setBlocks(prev => {
    const next = [...prev];
    const target = index + direction;
    if (target < 0 || target >= next.length) return prev;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}
```

**BottomNav addition:** Add an Organize tab. Recommended icon from `lucide-react`: `CalendarCheck` or `LayoutList`.

**App.tsx addition:**
```typescript
import Organize from "./pages/Organize";
// Inside Routes:
<Route path="/organize" element={<Organize />} />
```

### 10. Timezone Handling

**Problem:** `work_start`/`work_end` are local times (e.g., "9:00 AM user's timezone"). The Pi may not be in the user's timezone. Converting to UTC requires knowing the target timezone.

**Resolution:** Use the Pi system timezone (`os.environ.get("TZ")` or `time.tzname[0]`). The STATE.md open question ("user_timezone as explicit DB setting vs. relying on Pi system tz — decide in Phase 10") is resolved here as: **rely on Pi system timezone via `ZoneInfo`**. This avoids a new settings field. Recommendation: use `datetime.now().astimezone().tzname()` to get the local tz at plan time, or read `ZoneInfo(os.environ.get("TZ", "UTC"))`.

**UTC storage is already established:** `UtcDateTime` TypeDecorator in `calendar.py` handles this; `ScheduledBlock.start_dt` / `end_dt` use the same decorator.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interval overlap detection | Custom geometry | Standard `a.start < b.end and b.start < a.end` | One line; proven correct |
| Scheduling solver | ILP/greedy optimizer | Hand-rolled first-fit greedy | O(n log n), deterministic, no library; correct for personal use |
| Time-zone conversion | Custom offset math | `datetime.combine(..., tzinfo=ZoneInfo(...))` + `.astimezone(UTC)` | stdlib; handles DST |
| JSON schema for API | jsonschema lib | Pydantic v2 already installed | Already on stack |
| Frontend data fetching | tanstack-query | Existing fetch hook pattern | No new deps mid-project |
| Drag-drop reorder | react-beautiful-dnd | Simple index-swap + Up/Down buttons | D-14 explicitly prohibits drag; phone touch is unreliable |
| Block rendering in Today | Separate component | Extend `AgendaItem` with `isBlock` variant | Consistent styling; minimal new code |

---

## Common Pitfalls

### Pitfall 1: All-Day Events as Time Blockers
**What goes wrong:** `CalendarEvent.all_day=True` rows have `start_dt=None`, `end_dt=None`. Accessing `e.start_dt` without null-checking causes `AttributeError`; treating `None` as midnight-to-midnight blocks all free time.
**How to avoid:** Filter before gap-finding: `if not e.all_day and e.start_dt and e.end_dt`. The `CalendarEvent` model already has `all_day: Mapped[bool]`. This is confirmed by direct inspection of `backend/app/models/calendar.py`.
**Warning signs:** `propose` returns zero free intervals even when calendar shows only all-day events.

### Pitfall 2: Migration Column Nullability on Existing `app_settings` Row
**What goes wrong:** `app_settings` table already has one row (id=1). Adding `NOT NULL` columns (or `server_default` on SQLite via `batch_alter_table`) can fail on non-empty tables.
**How to avoid:** Add `work_start_hour` etc. as `nullable=True` (no server default). SQLAlchemy model default kicks in for new rows; existing rows get NULL which the router handles by returning 9/18 defaults.
**Pattern established:** Phase 08-02 note in STATE.md: "batch_alter_table required for SQLite ALTER on existing tables".

### Pitfall 3: Double-Approve Race Condition
**What goes wrong:** Approve button clicked twice before the first response. Two concurrent POSTs both pass the "existing check" before either commits.
**How to avoid:** Disable the Approve button on first click (`isSubmitting = true`). Backend also enforces: the 409 check runs inside the router handler — SQLite WAL mode and single uvicorn worker mean concurrent requests are serialized in practice. But the UI guard is the primary defense.

### Pitfall 4: `planner_service.py` Accidentally Importing from `app.db`
**What goes wrong:** A developer adds a helper import that transitively pulls in `app.db`, breaking the pure-function guarantee. The test passes because the monkeypatch isn't strict enough.
**How to avoid:** Keep `planner_service.py` imports restricted to stdlib and ORM model types (passed in, not queried). Add a test that imports the module and asserts `"app.db"` is not in `sys.modules` after import.

### Pitfall 5: Stale Block Comparison Using Local Time
**What goes wrong:** `ScheduledBlock.start_dt` is UTC. A calendar event's `start_dt` is also UTC (via `UtcDateTime`). If either is compared naive, the overlap test gives wrong results.
**How to avoid:** Both sides of `_is_stale` are tz-aware UTC datetimes (the `UtcDateTime` decorator ensures this on read). No conversion needed — compare directly.

### Pitfall 6: "Didn't Fit" List Not Hydrated with Task Titles
**What goes wrong:** `ProposedDayPlan.unplaced_task_ids` is a list of integers. The frontend must display titles, so it needs to join against the tasks it already has loaded.
**How to avoid:** The Organize page already has access to tasks via `useTasks()`. Map `unplaced_task_ids → task.title` client-side. No API change needed.

### Pitfall 7: Re-plan Losing User's Edit Position
**What goes wrong:** User approves, then clicks Re-plan. Re-plan calls `GET /plan/propose` again (fresh proposal), discarding any manual edits the user made pre-approval.
**How to avoid:** This is the intended behavior (Re-plan = fresh start). The Re-plan button label and a confirmation prompt ("Re-plan will replace your approved plan. Continue?") set expectations.

---

## Code Examples

### Gap-finding with past-gap exclusion

```python
# Source: synthesized from models/calendar.py + CONTEXT.md D-05/D-07
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

def propose_day_plan(
    tasks: list[Task],
    events: list[CalendarEvent],
    target_date: date,
    work_start: time = time(9, 0),
    work_end: time = time(18, 0),
    default_block_minutes: int = 30,
    now: datetime | None = None,     # inject for testing; default = datetime.now(UTC)
    local_tz: str = "UTC",
) -> ProposedDayPlan:
    if now is None:
        now = datetime.now(timezone.utc)

    gaps = _find_gaps(events, work_start, work_end, target_date, now, local_tz)
    fully_booked = len(gaps) == 0

    sorted_tasks = sorted(
        [t for t in tasks if not t.completed and not t.is_habit],
        key=_priority_sort_key,
    )

    if fully_booked:
        return ProposedDayPlan(
            date=target_date, blocks=[], unplaced_task_ids=[t.id for t in sorted_tasks],
            fully_booked=True,
        )

    placed, unplaced = _pack_tasks(sorted_tasks, gaps, default_block_minutes)
    return ProposedDayPlan(
        date=target_date,
        blocks=placed,
        unplaced_task_ids=[t.id for t in unplaced],
        fully_booked=False,
    )
```

### Router: GET /plan/propose (read-only guarantee enforced by structure)

```python
# Source: pattern from routers/tasks.py + ARCHITECTURE.md §3
@router.get("/propose", response_model=ProposedDayPlan)
async def propose(date_str: str = Query(alias="date"), session: AsyncSession = Depends(get_session)):
    target_date = date.fromisoformat(date_str)

    # Load data (async — only reads)
    tasks_result = await session.execute(select(Task).where(Task.completed == False))
    tasks = tasks_result.scalars().all()

    events_result = await session.execute(
        select(CalendarEvent).where(
            CalendarEvent.cancelled == False,
            or_(
                CalendarEvent.start_date == date_str,
                and_(
                    CalendarEvent.start_dt >= datetime.combine(target_date, time.min, tzinfo=timezone.utc),
                    CalendarEvent.start_dt < datetime.combine(target_date + timedelta(days=1), time.min, tzinfo=timezone.utc),
                )
            )
        )
    )
    events = events_result.scalars().all()

    # Load work window from settings
    cfg = await session.get(AppSettings, 1)
    ws = time(cfg.work_start_hour or 9, cfg.work_start_minute or 0)
    we = time(cfg.work_end_hour or 18, cfg.work_end_minute or 0)

    # Pure function — no DB access inside
    return planner_service.propose_day_plan(
        tasks=tasks, events=events, target_date=target_date,
        work_start=ws, work_end=we,
    )
    # No session.commit(), session.add(), or any write. FastAPI commits nothing.
```

### Organize.tsx — already-approved state (D-10)

```tsx
// Source: CONTEXT.md D-10 + hook pattern from useTasks.ts
const todayKey = new Date().toISOString().slice(0, 10);
const { blocks: committedBlocks, loading, propose, approve, replan } = usePlan(todayKey);
const [state, setState] = useState<"loading" | "approved" | "editing" | ...>("loading");

useEffect(() => {
  if (!loading) {
    setState(committedBlocks.length > 0 ? "approved" : "proposing");
    if (committedBlocks.length === 0) triggerPropose();
  }
}, [loading, committedBlocks]);

// In render:
if (state === "approved") {
  return (
    <>
      <p>Plan approved for today.</p>
      {committedBlocks.map(b => <BlockRow key={b.id} block={b} />)}
      <button onClick={() => setState("editing_replan")}>Re-plan</button>
    </>
  );
}
```

### AgendaItem.tsx — block and stale badge variant

```tsx
// Add to existing AgendaItem render, using existing inline-style pattern:
{item.isBlock && (
  <span style={{
    fontSize: 11, background: "var(--accent)", color: "#fff",
    borderRadius: 4, padding: "1px 5px", flexShrink: 0,
  }}>
    Planned
  </span>
)}
{item.conflict_with && (
  <span style={{
    fontSize: 11, background: "var(--destructive, #ef4444)", color: "#fff",
    borderRadius: 4, padding: "1px 5px", flexShrink: 0,
  }} title={`Conflicts with: ${item.conflict_with}`}>
    ! {item.conflict_with}
  </span>
)}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| ARCHITECTURE.md §3: delete-then-insert on every approve | D-08/D-09: first approve commits; re-plan replaces | 409 on naive re-approve; explicit Re-plan UX |
| Hardcoded 9:00/18:00 work window | AppSettings work_start/work_end (D-05) | User-configurable from Settings page |
| No "didn't fit" surface | `unplaced_task_ids` in ProposedDayPlan (D-11) | User sees dropped tasks explicitly |
| Drag-drop reorder | Up/Down tap buttons (D-14) | Reliable on phone browser |
| Vague "plan is stale" banner | Per-block `conflict_with` field (D-13) | Names the specific conflicting event |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (existing) + React Testing Library (not yet used; no frontend tests needed for this phase) |
| Backend config | `backend/pytest.ini` or `pyproject.toml [tool.pytest]` (existing) |
| Quick run | `cd backend && pytest tests/test_plan.py -x` |
| Full suite | `cd backend && pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAN-01 | All-day events are not blockers | unit | `pytest tests/test_plan.py::test_all_day_event_not_a_blocker -x` | No — Wave 0 |
| PLAN-01 | Blocks sized from estimated_minutes (default 30) | unit | `pytest tests/test_plan.py::test_block_sized_from_estimated_minutes -x` | No — Wave 0 |
| PLAN-01 | Tasks ordered by priority then due-date proximity | unit | `pytest tests/test_plan.py::test_task_ordering -x` | No — Wave 0 |
| PLAN-01 | Habits excluded from proposal | unit | `pytest tests/test_plan.py::test_habits_excluded -x` | No — Wave 0 |
| PLAN-01 | Place-if-fits-else-skip (no truncation) | unit | `pytest tests/test_plan.py::test_place_if_fits_else_skip -x` | No — Wave 0 |
| PLAN-01 | Fully-booked day returns no blocks | unit | `pytest tests/test_plan.py::test_fully_booked_day -x` | No — Wave 0 |
| PLAN-01 | Past gaps excluded for today | unit | `pytest tests/test_plan.py::test_past_gaps_excluded -x` | No — Wave 0 |
| PLAN-02 | GET /plan/propose writes nothing to DB | integration | `pytest tests/test_plan.py::test_propose_is_read_only -x` | No — Wave 0 |
| PLAN-02 | POST /plan/approve returns 409 on second call | integration | `pytest tests/test_plan.py::test_approve_idempotent_409 -x` | No — Wave 0 |
| PLAN-02 | POST /plan/replan replaces existing plan | integration | `pytest tests/test_plan.py::test_replan_replaces -x` | No — Wave 0 |
| PLAN-02 | Staleness: conflicting event after approve surfaces in GET /blocks | integration | `pytest tests/test_plan.py::test_staleness_detection -x` | No — Wave 0 |
| PLAN-02 | DELETE /plan/blocks/{id} removes block | integration | `pytest tests/test_plan.py::test_delete_block -x` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/test_plan.py -x`
- **Per wave merge:** `pytest` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_plan.py` — all 12 named tests above (red before service exists)
- [ ] Confirm `backend/tests/conftest.py` async test client covers the plan router (check existing conftest for TestClient pattern — STATE.md: "Sync TestClient (not async) for test stubs")

---

## Open Questions

1. **Timezone for work window conversion**
   - What we know: Pi system tz is the implicit zone. STATE.md flags this as "decide in Phase 10."
   - Recommendation: Read `ZoneInfo(os.environ.get("TZ", "UTC"))` in `planner_service.propose_day_plan`. If TZ env var is not set, the Pi runs UTC and 9:00/18:00 is UTC (acceptable for personal use).
   - Planner should document this assumption in a comment and ensure the work_start/work_end Settings page shows a note about the Pi's configured timezone.

2. **Events fetch scope for /plan/propose**
   - What we know: `events/today` fetches today's events only. The propose endpoint needs to accept a target `date` param, which may be tomorrow or a future date.
   - Recommendation: The plan router fetches events independently (not via the events router) using the same `start_date == date_str OR (start_dt >= day_start AND start_dt < day_end)` pattern from `events.py`. Confirm this is the right approach before planning the router plan.

3. **Today.tsx weekly view: blocks on non-today days**
   - What we know: `buildWeekAgenda` renders 7 days. Blocks could theoretically exist for future days too.
   - Recommendation: For Phase 10 scope (PLAN-01/02 say "current day"), only fetch blocks for today. Pass `[]` for all other days in `buildWeekAgenda`. Future phases can extend.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 10 is purely code/config changes. No new external tools, services, or CLIs are introduced. The existing backend (Python 3.12, FastAPI, SQLAlchemy, aiosqlite, Alembic) and frontend (Node 22, React 19, Vite 8) are already running.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `backend/app/models/__init__.py`, `backend/app/models/calendar.py`, `backend/app/models/goal.py`, `backend/app/routers/tasks.py`, `backend/app/routers/events.py`, `backend/app/routers/settings.py`, `backend/app/schemas/settings.py`, `backend/app/main.py`
- Direct codebase inspection: `frontend/src/lib/agenda.ts`, `frontend/src/types/task.ts`, `frontend/src/hooks/useTasks.ts`, `frontend/src/hooks/useCalendarEvents.ts`, `frontend/src/components/AgendaItem.tsx`, `frontend/src/components/BottomNav.tsx`, `frontend/src/pages/Today.tsx`, `frontend/src/App.tsx`
- Direct codebase inspection: migration chain HEAD confirmed at `0008` from `backend/migrations/versions/`
- `.planning/research/ARCHITECTURE.md` §3 — plan service signature, ProposedBlock/ScheduledBlock shapes, endpoint list, migration name, frontend integration
- `.planning/research/PITFALLS.md` — Pitfalls 8 (all-day events), 9 (DST/UTC), 11 (staleness), 12 (double-commit), 14 (Alembic ordering)
- `.planning/research/STACK.md` — confirmed no new packages needed; hand-rolled greedy planner is the established choice
- `.planning/phases/10-day-auto-organize/10-CONTEXT.md` — all decisions D-01 through D-14

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase decisions confirming `batch_alter_table` for SQLite ALTER, sync TestClient pattern, Alembic migration chain from 0005→0008

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all confirmed from codebase inspection
- Architecture patterns: HIGH — all patterns directly verified in existing router/model/hook files
- Algorithm (gap-finding, packing): HIGH — standard interval arithmetic, O(n log n), no novel CS
- AppSettings extension: HIGH — `brief_hour`/`brief_minute` pattern directly inspected and mirrored
- Pitfalls: HIGH — grounded in codebase inspection + pre-existing PITFALLS.md analysis
- Frontend patterns: HIGH — `useTasks.ts`, `AgendaItem.tsx`, `agenda.ts` all directly inspected

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable stack — no fast-moving dependencies)
