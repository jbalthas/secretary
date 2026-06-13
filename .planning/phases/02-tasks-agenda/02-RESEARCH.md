# Phase 2: Tasks & Agenda - Research

**Researched:** 2026-06-12
**Domain:** FastAPI CRUD, SQLAlchemy async, React 19 SPA with routing, mobile-first UI
**Confidence:** HIGH

## Summary

Phase 2 builds the first real user-facing feature on top of the Phase 1 skeleton. The backend work is straightforward CRUD over SQLAlchemy async with one new table (`tasks`). The frontend work is the heavier lift: React Router, bottom nav, a task list with filter/sort, a slide-in drawer form, and an agenda view that merges tasks with hardcoded placeholder events.

The existing infrastructure is clean and prescriptive. `db.py` exports `get_session` and `Base`; `main.py` is a bare FastAPI instance with `app.include_router()` not yet called. The Alembic init migration is a no-op, so the Task table migration will be the first real schema DDL. The frontend is a blank `App.tsx` — no router, no styles, nothing — so this phase owns the full SPA shell.

Key complexity areas: (1) recurring tasks — the cron string needs to be stored but APScheduler job registration is deferred to Phase 3, so Phase 2 only needs to persist it; (2) the agenda merge — pure frontend logic sorting tasks-with-due-time alongside hardcoded placeholder events; (3) optimistic UI for checkbox toggling per the UI spec.

**Primary recommendation:** Build backend first (model → migration → router), then frontend SPA shell (router + nav), then task list, then drawer form, then agenda view. Each unit is independently testable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Compact rows (one row per task) — not cards, not grouped headers
- **D-02:** Each row shows: title, priority badge, due date, completion checkbox, description preview, reminder indicator, recurrence indicator
- **D-03:** Filter by status via Pending / Completed tabs at top; sort by due date or priority via dropdown
- **D-04:** Slide-in drawer from the right — task list stays visible behind it
- **D-05:** Drawer shows title + priority + due date up front; description, reminder, recurrence are collapsible/expandable
- **D-06:** Task creation triggered by a floating action button (FAB) fixed at bottom-right
- **D-07:** Chronological merged list — tasks and events in a single timeline sorted by time
- **D-08:** All-day tasks appear at the top of the agenda list
- **D-09:** Each agenda item shows: title + priority + time (if set) — same compact style as task list
- **D-10:** Phase 2 calendar events are hardcoded sample data ("Team standup 9am", "Lunch 12pm") — real sync in Phase 4
- **D-11:** Bottom nav bar with two tabs: "Today" (agenda) and "Tasks" (task list)
- **D-12:** Default view on app open is Today's agenda

### Claude's Discretion
- Color / styling choices for priority badges (high=red, medium=yellow, low=grey is a reasonable default)
- Empty state illustrations / copy for task list and agenda
- Exact drawer animation style (slide vs fade)
- Recurring task UI (cron expression input vs friendly picker — pick what's simpler to implement)
- Mobile responsiveness implementation details

### Deferred Ideas (OUT OF SCOPE)
- Search / full-text task search
- Drag-to-reorder tasks
- Task attachments / files
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TASK-01 | User can create a task with title, optional description, optional due date, and priority (high/medium/low) | SQLAlchemy Task model + POST /tasks; drawer form with always-visible title/priority/due-date |
| TASK-02 | User can edit any field of an existing task | PUT /tasks/{id}; drawer opens pre-filled when row is tapped |
| TASK-03 | User can mark a task complete | PATCH /tasks/{id} with `{completed: true}`; optimistic checkbox per UI spec |
| TASK-04 | User can delete a task | DELETE /tasks/{id}; confirm dialog in drawer, optimistic row removal |
| TASK-05 | User can attach a reminder time to a task (notification delivery in Phase 3) | `reminder_at` datetime column stored; APScheduler job registration deferred to Phase 3 |
| TASK-06 | User can create a recurring task (daily/weekly/custom cron); re-appears after completion | `recurrence_cron` TEXT column stored; re-spawn logic deferred to Phase 3; UI: friendly picker + raw cron input |
| TASK-07 | Task list filterable by pending/completed, sortable by due date and priority | Frontend-only: filter by `completed` field, sort by `due_date` or `priority` on in-memory list |
| CAL-05 | Today's agenda shows tasks (with due dates) and calendar events merged and sorted by time | Frontend merge: today's tasks with `due_date` = today + hardcoded placeholder events; sort by time |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.128.x | API framework (already installed) | Project decision |
| SQLAlchemy | 2.0.x async | ORM (already installed) | Project decision |
| aiosqlite | 0.20.x | Async SQLite driver (already installed) | Project decision |
| Alembic | 1.13.x | Schema migration (already installed) | Project decision |
| React | 19.2.x | UI (already installed) | Project decision |
| react-router-dom | 7.x | Client-side routing | Standard React routing; v7 unifies the loader/action model; minimal for SPA use |
| lucide-react | latest | Icons | Already specified in UI-SPEC.md |

### New Dependencies to Install
```bash
# Frontend
cd frontend && npm install react-router-dom lucide-react

# Backend — no new packages needed for Phase 2
```

**Version verification (2026-06-12):**
- react-router-dom: 7.x is current stable (React Router v7 merged with Remix)
- lucide-react: 0.x, actively maintained, MIT

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-router-dom | TanStack Router | TanStack is type-safer but heavier setup; overkill for 2-tab SPA |
| lucide-react | heroicons | Both fine; lucide already specified in UI spec |
| Pydantic schemas in-line | separate schemas/ file | Schemas file is cleaner at scale; this phase has one resource |

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
backend/app/
├── models/
│   └── __init__.py          # Add Task model here (existing file, currently empty)
├── routers/
│   └── tasks.py             # New: CRUD router for /tasks
├── schemas/
│   └── task.py              # New: Pydantic request/response schemas
├── main.py                  # Add include_router(tasks.router)

backend/migrations/versions/
└── XXXX_add_tasks_table.py  # New Alembic migration

frontend/src/
├── pages/
│   ├── Today.tsx            # New: agenda view
│   └── Tasks.tsx            # New: task list view
├── components/
│   ├── BottomNav.tsx        # New: bottom nav bar
│   ├── TaskRow.tsx          # New: compact row component
│   ├── TaskDrawer.tsx       # New: slide-in form drawer
│   ├── AgendaItem.tsx       # New: agenda row (task or placeholder event)
│   └── FAB.tsx              # New: floating action button
├── hooks/
│   └── useTasks.ts          # New: fetch/mutate tasks via fetch API
├── types/
│   └── task.ts              # New: Task TypeScript interface
└── App.tsx                  # Replace stub with router + BottomNav shell
```

### Pattern 1: SQLAlchemy Async Model

```python
# backend/app/models/__init__.py
import enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

class Priority(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[Priority] = mapped_column(SAEnum(Priority), default=Priority.medium)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recurrence_cron: Mapped[str | None] = mapped_column(String(100), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
```

### Pattern 2: FastAPI Async Router

```python
# backend/app/routers/tasks.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_session
from app.models import Task
from app.schemas.task import TaskCreate, TaskUpdate, TaskRead
from app.config import settings

router = APIRouter(prefix=f"{settings.api_prefix}/tasks", tags=["tasks"])

@router.get("/", response_model=list[TaskRead])
async def list_tasks(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Task).order_by(Task.created_at.desc()))
    return result.scalars().all()

@router.post("/", response_model=TaskRead, status_code=201)
async def create_task(body: TaskCreate, session: AsyncSession = Depends(get_session)):
    task = Task(**body.model_dump())
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task

@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(task_id: int, body: TaskUpdate, session: AsyncSession = Depends(get_session)):
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    await session.commit()
    await session.refresh(task)
    return task

@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: int, session: AsyncSession = Depends(get_session)):
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(404)
    await session.delete(task)
    await session.commit()
```

### Pattern 3: Pydantic Schemas (exclude_unset for partial PATCH)

```python
# backend/app/schemas/task.py
from pydantic import BaseModel
from datetime import datetime
from app.models import Priority

class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    reminder_at: datetime | None = None
    recurrence_cron: str | None = None

class TaskUpdate(TaskCreate):
    title: str | None = None
    completed: bool | None = None

class TaskRead(TaskCreate):
    id: int
    completed: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
```

### Pattern 4: React Router SPA Shell

```tsx
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Today from './pages/Today'
import Tasks from './pages/Tasks'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ paddingBottom: '56px' }}>  {/* nav bar height */}
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/tasks" element={<Tasks />} />
        </Routes>
      </div>
      <BottomNav />
    </BrowserRouter>
  )
}
```

### Pattern 5: Optimistic Checkbox Toggle

```tsx
// In TaskRow.tsx — optimistic complete toggle
const [localCompleted, setLocalCompleted] = useState(task.completed)

async function handleToggle() {
  setLocalCompleted(prev => !prev)  // optimistic
  try {
    await patchTask(task.id, { completed: !localCompleted })
  } catch {
    setLocalCompleted(prev => !prev)  // revert
    setError("Couldn't save — try again")
  }
}
```

### Pattern 6: Agenda Merge (Frontend Only, Phase 2)

```ts
// Today.tsx — merge tasks + hardcoded placeholders
const PLACEHOLDER_EVENTS = [
  { id: 'evt-1', title: 'Team standup', time: '09:00', isEvent: true },
  { id: 'evt-2', title: 'Lunch', time: '12:00', isEvent: true },
]

function buildAgenda(tasks: Task[]): AgendaItem[] {
  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = tasks.filter(t => !t.completed && t.due_date?.startsWith(today))
  const allDayTasks = todayTasks.filter(t => !t.due_date?.includes('T'))
  const timedTasks = todayTasks.filter(t => t.due_date?.includes('T'))
  const timedItems = [...timedTasks.map(toAgendaItem), ...PLACEHOLDER_EVENTS]
  timedItems.sort((a, b) => a.time.localeCompare(b.time))
  return [...allDayTasks.map(toAgendaItem), ...timedItems]
}
```

### Anti-Patterns to Avoid
- **Passing `AsyncSession` directly to other functions instead of using `Depends`:** SQLAlchemy async sessions are not thread-safe and have strict lifecycle requirements. Always get them via FastAPI's `Depends(get_session)`.
- **Using `session.execute(select(...))` then calling `.all()` on a non-scalars result:** Always call `.scalars().all()` to unwrap the Row wrapper.
- **`datetime.utcnow()` deprecated in Python 3.12+:** Use `datetime.now(timezone.utc)` instead.
- **Forgetting `expire_on_commit=False` in async sessions:** Already set in `db.py`; don't recreate a session factory without it or post-commit attribute access will fail.
- **CSS `position: fixed` bottom nav without `padding-bottom` on content:** The nav overlaps content. Add `padding-bottom: 56px` to the scroll container.
- **Storing `due_date` as a bare date string:** Store as `DateTime(timezone=True)` ISO 8601 with time component. The agenda sort requires a time value; all-day tasks store date + T00:00:00Z.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side routing | Custom hash-router | react-router-dom | Route matching, history API, nested routes — 200+ edge cases |
| Cron expression validation | Regex check | Store as-is, validate in Phase 3 when APScheduler parses it | APScheduler already validates on `add_job()`; no duplicate logic needed |
| Date formatting | strftime gymnastics | `Intl.DateTimeFormat` (browser native) | Handles locale, timezone, 12h/24h — no library needed |
| Focus trap in drawer | Manual tabIndex tracking | CSS + a few lines of JS with `querySelectorAll('[tabindex]')` | Simple enough here; full focus-trap library overkill for one drawer |

**Key insight:** The heaviest UI patterns (drawer, tabs, filter) are 30–50 line components at this scale. No component library needed — the UI spec is prescriptive enough to implement directly.

---

## Common Pitfalls

### Pitfall 1: Alembic autogenerate misses the Task model
**What goes wrong:** `alembic revision --autogenerate` produces an empty migration.
**Why it happens:** Alembic's `env.py` must import `Base` (and therefore `Task`) before calling `Base.metadata`. If `models/__init__.py` is empty and nothing imports it, autogenerate sees no tables.
**How to avoid:** In `backend/migrations/env.py`, ensure `from app.models import Base` is called (and that `Task` is imported somewhere in `app.models`). The existing env.py already imports Base — just make sure `Task` is defined in `app/models/__init__.py` before running the migration.
**Warning signs:** Generated migration file has empty `upgrade()`.

### Pitfall 2: SQLite stores datetimes as strings
**What goes wrong:** `DateTime(timezone=True)` in SQLAlchemy with SQLite does not enforce timezone storage. Datetimes come back as naive UTC strings.
**Why it happens:** SQLite has no native datetime type; SQLAlchemy serializes to ISO 8601 string.
**How to avoid:** Always work in UTC on the backend. Return ISO 8601 strings to the frontend and parse with `new Date()`. Never compare datetime strings lexicographically after timezone conversion.
**Warning signs:** Agenda sort order wrong; filter for "today" returning wrong tasks.

### Pitfall 3: React Router v7 import paths changed
**What goes wrong:** `import { useHistory } from 'react-router-dom'` throws at runtime.
**Why it happens:** React Router v7 removed `useHistory` in favour of `useNavigate`.
**How to avoid:** Use `useNavigate` for programmatic navigation, `useLocation` for current path, `NavLink` for nav items with active state.
**Warning signs:** Build succeeds (TypeScript may not catch it) but runtime error on navigation.

### Pitfall 4: PATCH with Pydantic missing `exclude_unset=True`
**What goes wrong:** Editing only the title resets `due_date` and other fields to `None`.
**Why it happens:** `body.model_dump()` includes all fields, including unset optional ones as `None`.
**How to avoid:** Always use `body.model_dump(exclude_unset=True)` in PATCH handlers.
**Warning signs:** Fields reset to null after partial update.

### Pitfall 5: `datetime.utcnow()` produces deprecation warnings in Python 3.12
**What goes wrong:** SQLAlchemy `default=datetime.utcnow` logs deprecation warnings.
**Why it happens:** `datetime.utcnow()` is deprecated since Python 3.12.
**How to avoid:** Use `default=lambda: datetime.now(timezone.utc)` in column definitions.

### Pitfall 6: React `useState` with async fetch — stale state on fast interactions
**What goes wrong:** Completing a task then immediately creating another causes the list to flash or show stale data.
**Why it happens:** Two concurrent state updates collide.
**How to avoid:** After any mutation (create/update/delete), re-fetch the task list from the API. A simple `refetch()` pattern in `useTasks.ts` is sufficient — no need for optimistic list management beyond the checkbox toggle.

---

## Code Examples

### Alembic migration for tasks table

```python
# backend/migrations/versions/XXXX_add_tasks_table.py
def upgrade() -> None:
    op.create_table(
        'tasks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('priority', sa.String(10), nullable=False, server_default='medium'),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminder_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('recurrence_cron', sa.String(100), nullable=True),
        sa.Column('completed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
```

### useTasks hook pattern

```ts
// frontend/src/hooks/useTasks.ts
const API = '/api/v1/tasks'

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])

  async function refresh() {
    const res = await fetch(API)
    setTasks(await res.json())
  }

  async function createTask(body: TaskCreate) {
    await fetch(API, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) })
    await refresh()
  }

  async function patchTask(id: number, body: Partial<Task>) {
    await fetch(`${API}/${id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) })
    await refresh()
  }

  async function deleteTask(id: number) {
    await fetch(`${API}/${id}`, { method: 'DELETE' })
    await refresh()
  }

  useEffect(() => { refresh() }, [])

  return { tasks, refresh, createTask, patchTask, deleteTask }
}
```

### Drawer slide-in CSS

```css
.drawer {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 85vw; max-width: 400px;
  background: #1e293b;
  transform: translateX(100%);
  transition: transform 250ms cubic-bezier(0.0, 0.0, 0.2, 1);
  z-index: 100;
}
.drawer.open {
  transform: translateX(0);
}
.backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  opacity: 0;
  transition: opacity 250ms ease-out;
  pointer-events: none;
}
.backdrop.open {
  opacity: 1;
  pointer-events: all;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-router` v5 `useHistory` | `useNavigate` (v6+) | React Router v6, 2021 | Breaking rename |
| `datetime.utcnow()` | `datetime.now(timezone.utc)` | Python 3.12 | DeprecationWarning |
| SQLAlchemy `Column(Integer, ...)` | `Mapped[int] = mapped_column(...)` | SQLAlchemy 2.0 | New typed style; old style still works but less idiomatic |
| `response_model=` + `.from_orm()` | `model_config = {"from_attributes": True}` | Pydantic v2 | `from_orm` removed |

---

## Open Questions

1. **How does Vite dev server proxy API calls during development?**
   - What we know: FastAPI runs on port 8000; Vite on 5173
   - What's unclear: Is a `vite.config.ts` proxy set up from Phase 1?
   - Recommendation: Add `server.proxy` to vite.config.ts pointing `/api` to `http://localhost:8000`; planner should include this as a Wave 0 task

2. **Does the existing test infra support async endpoint tests?**
   - What we know: `pytest-asyncio` and `httpx` are in dev dependencies; `TestClient` used in health test (sync)
   - What's unclear: Whether `pytest-asyncio` asyncio mode is configured
   - Recommendation: Task router tests can use sync `TestClient` (same as health test); no async test config needed for simple CRUD

---

## Environment Availability

Step 2.6: No new external services required. Phase 2 is code-only (new DB table, new API endpoints, new frontend components). All required tools (Python 3.12, uv, Node 22, npm) were verified operational in Phase 1.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x |
| Config file | `backend/pyproject.toml` (no `[tool.pytest]` section yet — see Wave 0) |
| Quick run command | `cd backend && uv run pytest tests/ -x -q` |
| Full suite command | `cd backend && uv run pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-01 | POST /tasks creates task with all fields | unit | `uv run pytest tests/test_tasks.py::test_create_task -x` | ❌ Wave 0 |
| TASK-02 | PATCH /tasks/{id} updates any field | unit | `uv run pytest tests/test_tasks.py::test_update_task -x` | ❌ Wave 0 |
| TASK-03 | PATCH /tasks/{id} with completed=true | unit | `uv run pytest tests/test_tasks.py::test_complete_task -x` | ❌ Wave 0 |
| TASK-04 | DELETE /tasks/{id} removes task | unit | `uv run pytest tests/test_tasks.py::test_delete_task -x` | ❌ Wave 0 |
| TASK-05 | POST /tasks with reminder_at stores value | unit | `uv run pytest tests/test_tasks.py::test_task_reminder_stored -x` | ❌ Wave 0 |
| TASK-06 | POST /tasks with recurrence_cron stores value | unit | `uv run pytest tests/test_tasks.py::test_task_recurrence_stored -x` | ❌ Wave 0 |
| TASK-07 | GET /tasks returns all tasks (client sorts/filters) | unit | `uv run pytest tests/test_tasks.py::test_list_tasks -x` | ❌ Wave 0 |
| CAL-05 | Today view merges tasks + placeholder events | manual | Phone browser: open Today tab, verify merged list | — |

**Note:** CAL-05 is frontend-only merge logic with hardcoded data. Manual gate test is the gate: create a task with today's due date, open Today tab, verify it appears interleaved with placeholder events.

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/ -x -q`
- **Per wave merge:** `cd backend && uv run pytest tests/ -v`
- **Phase gate:** Full suite green + manual phone gate test before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_tasks.py` — covers TASK-01 through TASK-07
- [ ] `backend/pyproject.toml` `[tool.pytest.ini_options]` — add `asyncio_mode = "auto"` if async fixtures needed
- [ ] `frontend/vite.config.ts` proxy — add `/api` → `http://localhost:8000` for dev

---

## Sources

### Primary (HIGH confidence)
- FastAPI official docs — router patterns, Depends injection, PATCH with exclude_unset
- SQLAlchemy 2.0 official docs — mapped_column, AsyncSession, async engine
- React Router v7 official docs — BrowserRouter, Routes, NavLink, useNavigate
- Project CLAUDE.md — authoritative stack versions
- Phase 1 codebase (directly read) — db.py, main.py, config.py, pyproject.toml

### Secondary (MEDIUM confidence)
- React Router v7 changelog — useHistory removal, useNavigate introduction (well-documented, widely verified)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed or confirmed in package.json; react-router-dom v7 is current stable
- Architecture: HIGH — patterns derived directly from existing codebase + official SQLAlchemy/FastAPI docs
- Pitfalls: HIGH — SQLite datetime behaviour and Pydantic v2 patterns are well-documented and directly relevant

**Research date:** 2026-06-12
**Valid until:** 2026-09-12 (stable ecosystem, no fast-moving dependencies)
