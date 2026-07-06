# Phase 15: Context Export + Advisor Prompt — Research

**Researched:** 2026-06-29
**Domain:** Bundle assembly (backend Markdown generation), frontend copy-to-clipboard page, advisor system prompt authoring
**Confidence:** HIGH — all findings grounded in direct codebase inspection; no new dependencies required

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Brief format is Markdown (tables + prose), NOT a JSON data block. The "embedded JSON schema" in EXPORT-01 refers to the advisory *response* schema block in the system prompt (PROMPT-01), not the data section.
- **D-02:** Bundle header carries `generated_at` and a `session_id`.
- **D-03:** `progress_pct` is live-computed at export time via `brief.py::_compute_progress_sync` — never read from `goal_progress_snapshots` (snapshots feed the trend array only).
- **D-04:** Career- and learning-type goals ordered first in the bundle.
- **D-05:** Calendar load is per-day event counts only, never event titles (hard privacy rule).
- **D-06:** Target budget ~30k tokens.
- **D-07:** Truncation order: (1) 14-day block detail → summary counts, (2) tasks beyond top-3 per goal, (3) trend array detail. Never drop a whole goal.
- **D-08:** New route `/advisor` in `frontend/src/App.tsx` + BottomNav entry.
- **D-09:** Page contains: copy-prompt button, copy-bundle button, on-demand snapshot button (`POST /api/v1/export/snapshot`), read-only bundle preview.
- **D-10:** Mirror Ingest pattern: `useExport` hook modeled on `hooks/useIngest.ts`, page modeled on `pages/Ingest.tsx`. Clipboard via browser Clipboard API.
- **D-11:** Stateless round-trip — NO server-side export log table.
- **D-12:** Advisor system prompt instructs LLM to echo `session_id` back in its advisory JSON reply.
- **D-13:** `AppSettings.last_advisory_at` stamp is Phase 16's concern.
- **D-14:** Role framing / tone wording left to planner.
- **D-15:** Scope section MUST state advisor MAY propose new tasks (ADVISE-08: title required; optional description/due_date/priority/estimated_minutes; linked by `external_key`; required `rationale`) and MUST NOT edit/complete/delete existing tasks or change goal status/title/type.
- **D-16:** JSON schema block ships as literal `[SCHEMA BLOCK]` placeholder; regenerated from `AdvisoryPayload.model_json_schema()` at end of Phase 16.

### Claude's Discretion

- Velocity-label thresholds for `accelerating` / `steady` / `stalling` / `no_data` from last 4 weekly `progress_pct` values; degrade to `no_data` when fewer than 2 snapshots exist.
- Ordering of "top-3 active tasks" per goal — reuse next-best-task scoring if convenient, else priority + due-date.
- Exact preview styling / collapsibility; BottomNav icon + label/placement.
- Markdown table column layout and section ordering within the brief.

### Deferred Ideas (OUT OF SCOPE)

- Advisory ingest / paste-back / diff / apply — Phase 16.
- `AppSettings.last_advisory_at` "last sync: N days ago" stamp — Phase 16.
- Auto-generated JSON schema block — Phase 16 finalizes `AdvisoryPayload` and regenerates.
- Server-side export log / issued-session tracking — rejected (D-11 chose stateless).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXPORT-01 | One-action clipboard copy of complete advisor brief (Markdown); bundle header has `generated_at` + `session_id` | Backend: new `build_export_bundle()` sync fn in `export_service.py`; `GET /api/v1/export/bundle` in `export.py` router; frontend: copy button + `useExport` hook |
| EXPORT-02 | Bundle lists each active goal: title, type, target_date + days remaining, live `progress_pct`, milestones, top-3 active tasks (title/priority/due date), overdue count | Data: `Goal` + `Milestone` models (goal.py); `Task` model (__init__.py); `_compute_progress_sync` from brief.py |
| EXPORT-03 | 14-day planned-vs-actual block summary (planned / completed / slipped) from `ScheduledBlock` | Data: `ScheduledBlock` model (plan.py) — `date_key`, `completed`, `task_id`; "slipped" = not-completed in window |
| EXPORT-04 | Per-goal 4-week progress trend + velocity label (`accelerating`/`steady`/`stalling`/`no_data`) | Data: `GoalProgressSnapshot` (goal.py) — `snapshotted_on`, `progress_pct`; last 4 weekly rows per goal ordered by date |
| EXPORT-05 | 7-day calendar load as per-day event counts only (no titles) + stalled-goals list | Data: `CalendarEvent` (calendar.py) — `start_dt`, `start_date`, `cancelled`; `guidance_service.get_stalled_goals()` drop-in |
| EXPORT-06 | Career- and learning-type goals ordered first | Logic: sort by `goal.type in {career, learning}` descending before rendering bundle |
| PROMPT-01 | Advisor system prompt copyable from Sync page: role framing, in/out-of-scope, `[SCHEMA BLOCK]` placeholder, example payload, notes guidance | Deliverable: `frontend/src/lib/advisorPrompt.ts`; flagged as pending Phase 16 schema injection |
</phase_requirements>

---

## Summary

Phase 15 wires together five already-built subsystems into a single copyable advisor brief. Every data source it reads already exists: `_compute_progress_sync` (brief.py), `get_stalled_goals` (guidance_service.py), `GoalProgressSnapshot` (goal.py, Phase 14), `ScheduledBlock` (plan.py), and `CalendarEvent` (calendar.py). No new ORM models, no new migrations, no new Python or npm packages are required.

The backend work is one new sync service file (`export_service.py`) that assembles a Markdown string, and one new endpoint (`GET /api/v1/export/bundle`) added to the existing `export.py` router. The endpoint is sync (`def`) and runs in FastAPI's thread pool — identical to the `trigger_snapshot` endpoint already there. The frontend work is a `useExport` hook (modeled character-for-character on `useIngest.ts`), an `Advisor.tsx` page (modeled on `Ingest.tsx`), a static `advisorPrompt.ts` file, and two wiring changes (`App.tsx` route + `BottomNav.tsx` nav entry).

**Primary recommendation:** Implement `export_service.py` as a pure sync function returning a Markdown string, keep all DB queries inside a single `_Session()` context, and expose it via a `GET` endpoint on the existing export router. The frontend mirrors the Ingest page exactly.

---

## Standard Stack

No new dependencies. Everything below already exists in the project.

### Core (backend)
| Asset | Where | Role in Phase 15 |
|-------|-------|-----------------|
| `brief.py::_compute_progress_sync(goal_id, session)` | `backend/app/services/brief.py:16` | Live `progress_pct` per goal (D-03) |
| `guidance_service.get_stalled_goals(threshold_days)` | `backend/app/services/guidance_service.py:26` | Stalled-goals section (EXPORT-05) |
| `GoalProgressSnapshot` | `backend/app/models/goal.py:62` | 4-week trend rows (EXPORT-04) |
| `ScheduledBlock` | `backend/app/models/plan.py:10` | 14-day block summary (EXPORT-03) |
| `CalendarEvent` | `backend/app/models/calendar.py:39` | 7-day calendar load (EXPORT-05) |
| `Goal`, `Milestone`, `GoalType` | `backend/app/models/goal.py:8,50,8` | Goal section (EXPORT-02, EXPORT-06) |
| `Task` | `backend/app/models/__init__.py:14` | Top-3 tasks, overdue count (EXPORT-02) |
| `export.py` router | `backend/app/routers/export.py` | Add bundle endpoint alongside snapshot |
| `snapshot_service.py` | `backend/app/services/snapshot_service.py` | On-demand snapshot already wired |

### Core (frontend)
| Asset | Where | Role in Phase 15 |
|-------|-------|-----------------|
| `useIngest.ts` | `frontend/src/hooks/useIngest.ts` | Template for `useExport.ts` |
| `Ingest.tsx` | `frontend/src/pages/Ingest.tsx` | Template for `Advisor.tsx` |
| `ingestPrompt.ts` | `frontend/src/lib/ingestPrompt.ts` | Template for `advisorPrompt.ts` |
| `App.tsx` | `frontend/src/App.tsx` | Add `/advisor` route |
| `BottomNav.tsx` | `frontend/src/components/BottomNav.tsx` | Add Sync nav entry |
| Browser Clipboard API | native | `navigator.clipboard.writeText()` — already used in Ingest.tsx |

---

## Architecture Patterns

### Recommended File Layout (new files only)

```
backend/app/services/export_service.py     ← new: bundle assembly (sync)
backend/app/schemas/export.py              ← extend: add BundleResponse schema
backend/app/routers/export.py              ← extend: add GET /bundle endpoint
backend/tests/test_export.py               ← new: bundle assembly + endpoint tests

frontend/src/hooks/useExport.ts            ← new: fetch + loading state
frontend/src/pages/Advisor.tsx             ← new: Sync page shell
frontend/src/lib/advisorPrompt.ts          ← new: documented system prompt
```

### Pattern 1: Sync Service for Bundle Assembly

The bundle service MUST be sync, following the `brief.py` / `guidance_service.py` pattern:

```python
# Source: backend/app/services/brief.py:11-13 (confirmed pattern)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings as app_settings

_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)

def build_export_bundle() -> str:
    with _Session() as s:
        # all queries here
        ...
    return markdown_string
```

**Why sync:** APScheduler and FastAPI thread pool both handle sync functions correctly. An async function in this pattern would deadlock under APScheduler (established project constraint, see STATE.md `[v2.0 roadmap]`).

### Pattern 2: `def` Endpoint on Existing Router

```python
# Source: backend/app/routers/export.py (confirmed pattern)
@router.get("/bundle")
def get_export_bundle() -> BundleResponse:
    markdown = export_service.build_export_bundle()
    return BundleResponse(markdown=markdown)
```

FastAPI threadpools sync `def` endpoints automatically. The snapshot endpoint already uses this exact pattern.

### Pattern 3: `useExport` Hook (mirror useIngest.ts exactly)

```typescript
// Source: frontend/src/hooks/useIngest.ts (confirmed pattern)
export function useExport() {
  const [bundle, setBundle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchBundle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/export/bundle");
      if (res.ok) {
        const data = await res.json();
        setBundle(data.markdown);
      } else {
        setError(`Failed to load bundle (HTTP ${res.status}).`);
      }
    } catch {
      setError("Failed to load bundle — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return { bundle, loading, error, fetchBundle };
}
```

### Pattern 4: Clipboard Copy (already proven in Ingest.tsx)

```typescript
// Source: frontend/src/pages/Ingest.tsx:44-48 (confirmed)
const [copied, setCopied] = useState(false);

async function handleCopy() {
  await navigator.clipboard.writeText(textToCopy);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}
```

Two separate copy buttons (prompt, bundle) each get their own `copied` state boolean.

### Pattern 5: BottomNav Entry

```typescript
// Source: frontend/src/components/BottomNav.tsx (confirmed pattern)
// Current icons: Calendar, ListTodo, Target, CalendarCheck, Settings
// Add: Bot or BrainCircuit from lucide-react for "Sync" nav entry
<NavLink to="/advisor" style={({ isActive }) => ({
  ...tabStyle,
  color: isActive ? "var(--accent)" : "var(--text-secondary)",
})}>
  <Bot size={22} />
  Sync
</NavLink>
```

BottomNav currently has 5 entries; adding a 6th makes each tab narrower. Planner should decide whether to replace an existing low-use entry or accept the 6-tab layout.

### Pattern 6: `advisorPrompt.ts` Static Export

```typescript
// Source: frontend/src/lib/ingestPrompt.ts (confirmed template)
export const ADVISOR_PROMPT = `[role framing]
...
[SCHEMA BLOCK]
...`;
```

The `[SCHEMA BLOCK]` placeholder is a literal string in the TypeScript source. Phase 16 does a one-line find-replace to inject `AdvisoryPayload.model_json_schema()` output.

### Anti-Patterns to Avoid

- **Async bundle service:** Do not use `async def` or `await` in `export_service.py`. This pattern deadlocks under APScheduler (see `[v2.0 roadmap]` in STATE.md).
- **Reading `progress_pct` from snapshots as "current":** Snapshots are trend-only (D-03). Always call `_compute_progress_sync` at export time.
- **Including event titles in calendar load:** Hard privacy rule (D-05). Only per-day `COUNT(*)` goes into the bundle.
- **New Alembic migration:** Phase 15 is stateless (D-11). No new tables. Alembic HEAD stays at `0017`.
- **Server-side LLM calls:** CI guard in place — `grep -r "anthropic\|openai\|litellm" backend/app/` must return zero. Do not import or call any LLM library.
- **New Python/npm packages:** Zero new dependencies (v2.2 hard constraint). All token estimation uses plain string length (`len(text) // 4` approximation is sufficient for a 30k-token target check — no tiktoken needed).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live `progress_pct` | Custom task/milestone count query | `_compute_progress_sync(goal_id, session)` from `brief.py` | Already correct, tested, handles 0-total case |
| Stalled-goals list | Custom "no completions" query | `guidance_service.get_stalled_goals(threshold_days)` | Already correct, tested, respects is_habit exclusion |
| Clipboard copy | Custom clipboard wrapper | `navigator.clipboard.writeText()` | Already used in `Ingest.tsx`; no wrapper needed |
| Hook boilerplate | Custom fetch state manager | Mirror `useIngest.ts` exactly | Loading/error state pattern already established |
| Token counting | tiktoken or any tokenizer library | `len(markdown) // 4` for budget check | Approximate is fine; no new dependency |

---

## Data Source Map

### EXPORT-02: Goal Section

**Query:** All `Goal` rows where `status == "active"`, ordered career/learning first (D-04/D-06).

**Per goal fields:**
- `goal.title`, `goal.type.value`, `goal.target_date`
- Days remaining: `(goal.target_date - date.today()).days` (None-safe)
- `progress_pct`: call `_compute_progress_sync(goal.id, session)` — NOT from snapshots
- Milestones: `goal.milestones` (lazy="selectin", already loaded)
- Top-3 active tasks: filter `goal.tasks` where `not t.completed`, sort by priority descending then `due_date` ascending (None last), take first 3
- Overdue count: count `goal.tasks` where `not t.completed and t.due_date is not None and t.due_date < now`

**Priority sort key** (from `brief.py:90`):
```python
_priority_rank = {"high": 3, "medium": 2, "low": 1}
```

**Type ordering** (D-04/D-06 — career/learning first):
```python
PRIORITY_TYPES = {"career", "learning"}
goals.sort(key=lambda g: (g.type.value not in PRIORITY_TYPES, g.target_date is None, g.target_date))
```

### EXPORT-03: 14-Day Planned-vs-Actual Block Summary

**Query:** `ScheduledBlock` where `date_key` between today-14 days and today (14-day window).

**ScheduledBlock fields** (confirmed from `backend/app/models/plan.py`):
- `date_key: str` — "YYYY-MM-DD", indexed
- `completed: bool` — True if user marked the block done
- `task_id: int | None` — links to a task (SET NULL on delete)
- `title: str` — block title (not exported for privacy)
- `start_dt`, `end_dt` — UtcDateTime

**Derivation:**
- `planned` = total `ScheduledBlock` count in window
- `completed` = count where `block.completed == True`
- `slipped` = count where `block.completed == False` (and `date_key < today` to exclude future blocks)

**Important:** "Slipped" blocks are past blocks not marked done. Future blocks in the 14-day window (within today's date) are not slipped — they're still upcoming.

### EXPORT-04: 4-Week Progress Trend + Velocity Label

**Query:** For each active goal, fetch `GoalProgressSnapshot` rows ordered by `snapshotted_on` DESC, limit 4.

**GoalProgressSnapshot fields** (confirmed from `backend/app/models/goal.py:62`):
- `goal_id: int`
- `snapshotted_on: date`
- `progress_pct: int`
- (Other fields — `milestones_done`, `tasks_completed_week`, `tasks_slipped_week` — not used in trend)

**Velocity label algorithm** (Claude's Discretion — proposed default):
```
snapshots = last 4 weekly progress_pct values, oldest→newest
if len(snapshots) < 2: label = "no_data"
elif snapshots[-1] - snapshots[0] >= 10: label = "accelerating"
elif snapshots[-1] - snapshots[0] <= -5: label = "stalling"
else: label = "steady"
```
Thresholds (+10 pct points across 4 weeks = accelerating, -5 or worse = stalling) are a sensible default for an engineer-focused personal secretary. Planner may adjust.

**Degrade gracefully:** If a goal has zero snapshots, trend = [] and label = "no_data". Phase 14 wires up the on-demand snapshot button on this same page, so the user can generate initial data immediately.

### EXPORT-05: 7-Day Calendar Load

**Query:** `CalendarEvent` where `cancelled == False` and event falls within today through today+6.

**CalendarEvent fields** (confirmed from `backend/app/models/calendar.py:39`):
- `start_dt: datetime | None` — UTC, UtcDateTime type (always tz-aware on read)
- `start_date: str | None` — "YYYY-MM-DD" for all-day events
- `all_day: bool`
- `cancelled: bool`
- `title: str` — **NEVER exported** (D-05, hard privacy rule)

**Per-day count:** Group by date, count events. For timed events use `start_dt.date()`, for all-day use `start_date`.

**Stalled goals:** Call `guidance_service.get_stalled_goals()` directly — returns a list of `Goal` objects. Extract only `goal.title` for the bundle (no other fields needed).

### EXPORT-01: Bundle Header

```python
import uuid
from datetime import datetime, timezone

session_id = str(uuid.uuid4())
generated_at = datetime.now(timezone.utc).isoformat()
```

`session_id` is a fresh UUID4 on every bundle request. It is not persisted (D-11).

---

## Token Budget Strategy

**30k token target** (D-06) with ~4 chars/token approximation → ~120k characters budget.

For a single-user personal secretary with a handful of active goals, the untruncated bundle will typically be well under 30k tokens. Truncation is a safety valve, not the common path.

**Truncation order** (D-07):
1. If bundle exceeds budget: collapse 14-day block detail to just the three count numbers (no per-day breakdown if one was added)
2. If still over: cap tasks per goal at 3 (already the default)
3. If still over: truncate trend array to 2 most recent values

**Implementation:** Compute `len(markdown) // 4` after assembly; if > 30000, apply truncation steps in order and reassemble.

---

## Advisor System Prompt Structure (PROMPT-01)

The prompt is a TypeScript string constant in `frontend/src/lib/advisorPrompt.ts`. Key sections:

1. **Role framing** — "You are a career and engineering advisor for Jack. Your 4-week planning horizon prioritizes career and learning goals."
2. **In-scope list** — Adjust `target_date` and `priority_rank` on goals; adjust milestone `target_date`, `done`, `title`; propose NEW tasks (ADVISE-08 scope)
3. **Out-of-scope list** — Do NOT: create goals, change goal status/title/type, edit/complete/delete existing tasks
4. **New-task creation scope** (ADVISE-08, D-15) — May propose tasks with: `title` (required), optional `description`/`due_date`/`priority`/`estimated_minutes`, linked to a goal by `external_key`, with required `rationale`
5. **`[SCHEMA BLOCK]` placeholder** — literal text; Phase 16 replaces with `AdvisoryPayload.model_json_schema()` output
6. **Example payload** — must include at least one new-task item (D-15)
7. **`notes` field guidance** — free-text top-level field surfaced to user before confirm; never written to goal/milestone entities
8. **`session_id` echo instruction** — LLM must echo the `session_id` from the bundle header back in its advisory JSON reply (D-12)

**Phase 16 deferred update:** One-line replacement of `[SCHEMA BLOCK]` with actual schema. Plan must flag this explicitly.

---

## Common Pitfalls

### Pitfall 1: Reading CalendarEvent date for non-all-day events
**What goes wrong:** Querying `CalendarEvent.start_date` for timed events — it is `None` for non-all-day events. Use `start_dt` (UTC, tz-aware via UtcDateTime) for timed events.
**How to avoid:** Branch on `event.all_day`: if True use `start_date`; else use `start_dt.date()` (after converting UTC → local if needed, or just use UTC date for a 7-day window).
**Warning signs:** All-day events missing from calendar load count.

### Pitfall 2: Lazy-loading `goal.tasks` inside a closed session
**What goes wrong:** Accessing `goal.tasks` after the `_Session()` context manager exits raises `DetachedInstanceError`.
**How to avoid:** All `goal.tasks`, `goal.milestones` accesses must happen **inside** the `with _Session() as s:` block. The `lazy="selectin"` on both relationships (confirmed in goal.py) means they are auto-loaded when the Goal is fetched — but only while the session is open.
**Warning signs:** `DetachedInstanceError` on first run; works in unit tests with fixtures but fails in integration.

### Pitfall 3: Mixing UTC and naive datetimes for "slipped block" detection
**What goes wrong:** `ScheduledBlock.start_dt` uses `UtcDateTime` (always tz-aware UTC). `date_key` is a plain `"YYYY-MM-DD"` string. Comparing `date_key < date.today().isoformat()` is safe and preferred — avoids timezone conversion entirely for the 14-day window.
**How to avoid:** Use `date_key` for date comparisons on `ScheduledBlock`; use `start_dt` only if sub-day precision is needed (it is not for this summary).

### Pitfall 4: `progress_pct` from snapshots instead of live compute
**What goes wrong:** Using `GoalProgressSnapshot.progress_pct` as the current progress — it is a historical point-in-time value and may be up to a week stale.
**How to avoid:** D-03 is explicit: call `_compute_progress_sync(goal.id, session)` at export time. Snapshots are only used for the trend array (EXPORT-04).

### Pitfall 5: BottomNav 6th tab layout break on narrow screens
**What goes wrong:** Adding a 6th tab to a 5-tab BottomNav without checking the `flex: 1` layout causes tabs to overflow on 320px-wide screens.
**How to avoid:** Either replace an existing low-use tab (e.g., move Ingest under Settings), or verify layout at 320px minimum width. Planner to decide.

### Pitfall 6: `[SCHEMA BLOCK]` placeholder being hand-written
**What goes wrong:** Developer writes a partial or incorrect schema by hand instead of leaving the literal `[SCHEMA BLOCK]` string.
**How to avoid:** The placeholder is intentional. Leave it as-is. Phase 16's last task is a one-line replacement with the auto-generated schema.

---

## Code Examples

### Bundle Assembly Skeleton

```python
# backend/app/services/export_service.py
# Pattern: mirrors brief.py and guidance_service.py exactly

import uuid
from datetime import datetime, date, timezone, timedelta
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from app.config import settings as app_settings
from app.services.brief import _compute_progress_sync

_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)

PRIORITY_TYPES = {"career", "learning"}
PRIORITY_RANK = {"high": 3, "medium": 2, "low": 1}

def build_export_bundle() -> dict:
    """Returns dict with 'markdown', 'session_id', 'generated_at'."""
    from app.models.goal import Goal, GoalProgressSnapshot, GoalStatus
    from app.models import Task
    from app.models.plan import ScheduledBlock
    from app.models.calendar import CalendarEvent

    session_id = str(uuid.uuid4())
    generated_at = datetime.now(timezone.utc).isoformat()
    today = date.today()

    with _Session() as s:
        goals = s.scalars(
            select(Goal).where(Goal.status == GoalStatus.active)
        ).all()
        goals = sorted(goals, key=lambda g: (
            g.type.value not in PRIORITY_TYPES,
            g.target_date is None,
            g.target_date,
        ))

        # Build sections inside session (lazy="selectin" needs open session)
        goal_sections = [_render_goal(g, today, s) for g in goals]

        # 14-day block summary (EXPORT-03)
        window_start = (today - timedelta(days=14)).isoformat()
        window_today = today.isoformat()
        blocks = s.scalars(
            select(ScheduledBlock).where(
                ScheduledBlock.date_key >= window_start,
                ScheduledBlock.date_key <= window_today,
            )
        ).all()
        block_section = _render_blocks(blocks, today)

        # 7-day calendar load (EXPORT-05)
        cal_section = _render_calendar(s, today)

        # Stalled goals (EXPORT-05) — reuse existing service
        from app.services.guidance_service import _find_stalled_goals
        stalled = _find_stalled_goals(s, 7)
        stalled_section = _render_stalled(stalled)

    lines = [
        f"# Advisor Brief",
        f"generated_at: {generated_at}  session_id: {session_id}",
        "",
        "## Goals",
        *goal_sections,
        "",
        "## 14-Day Block Summary",
        block_section,
        "",
        "## 7-Day Calendar Load",
        cal_section,
        "",
        "## Stalled Goals",
        stalled_section,
    ]
    markdown = "\n".join(lines)
    return {"markdown": markdown, "session_id": session_id, "generated_at": generated_at}
```

Note: `_find_stalled_goals(session, threshold)` is the private helper in `guidance_service.py` that takes an existing session — reusing it avoids opening a second session. The public `get_stalled_goals()` opens its own session; using the private helper is preferred when already inside a session context.

### Velocity Label Computation

```python
def _velocity_label(snapshots: list) -> str:
    """snapshots: list of GoalProgressSnapshot ordered oldest→newest."""
    if len(snapshots) < 2:
        return "no_data"
    delta = snapshots[-1].progress_pct - snapshots[0].progress_pct
    if delta >= 10:
        return "accelerating"
    if delta <= -5:
        return "stalling"
    return "steady"
```

### Slipped Block Derivation

```python
def _render_blocks(blocks: list, today: date) -> str:
    today_str = today.isoformat()
    planned = len(blocks)
    completed = sum(1 for b in blocks if b.completed)
    # Only past blocks can be "slipped"; future blocks in window are upcoming
    slipped = sum(1 for b in blocks if not b.completed and b.date_key < today_str)
    return f"| Metric | Count |\n|--------|-------|\n| Planned | {planned} |\n| Completed | {completed} |\n| Slipped | {slipped} |"
```

### Schema Response

```python
# backend/app/schemas/export.py — extend existing file
from pydantic import BaseModel

class SnapshotResponse(BaseModel):
    created: int
    skipped: int

class BundleResponse(BaseModel):
    markdown: str
    session_id: str
    generated_at: str
```

### Router Extension

```python
# backend/app/routers/export.py — add alongside existing snapshot endpoint
from app.schemas.export import SnapshotResponse, BundleResponse
from app.services import snapshot_service, export_service

@router.get("/bundle")
def get_export_bundle() -> BundleResponse:
    result = export_service.build_export_bundle()
    return BundleResponse(**result)
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 15 is purely code changes. All dependencies (Python stdlib `uuid`, existing SQLAlchemy models, existing React patterns) are already installed and in use.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | `backend/pytest.ini` or `pyproject.toml` |
| Quick run command | `cd backend && python -m pytest tests/test_export.py -x -q` |
| Full suite command | `cd backend && python -m pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXPORT-01 | `GET /api/v1/export/bundle` returns 200 with `markdown`, `session_id`, `generated_at` | unit (TestClient) | `pytest tests/test_export.py::test_bundle_endpoint -x` | ❌ Wave 0 |
| EXPORT-02 | Bundle markdown contains goal title, type, target_date, progress_pct, milestones, top-3 tasks, overdue count | unit (mock DB) | `pytest tests/test_export.py::test_bundle_contains_goal_section -x` | ❌ Wave 0 |
| EXPORT-03 | Block summary counts planned/completed/slipped correctly | unit (mock blocks) | `pytest tests/test_export.py::test_block_summary -x` | ❌ Wave 0 |
| EXPORT-04 | Velocity label logic: <2 snapshots → no_data; +10 pct → accelerating; -5 pct → stalling | unit (pure fn) | `pytest tests/test_export.py::test_velocity_label -x` | ❌ Wave 0 |
| EXPORT-05 | Calendar section has per-day counts, no titles; stalled goals list present | unit (mock DB) | `pytest tests/test_export.py::test_calendar_section_privacy -x` | ❌ Wave 0 |
| EXPORT-06 | Career/learning goals appear before other types in bundle | unit (mock DB) | `pytest tests/test_export.py::test_goal_ordering -x` | ❌ Wave 0 |
| PROMPT-01 | `ADVISOR_PROMPT` constant exported from `advisorPrompt.ts`, contains `[SCHEMA BLOCK]` and session_id instruction | manual / lint | inspect file | ❌ Wave 0 |

**CI guard test** (locked hard constraint):
```
pytest tests/test_export.py::test_no_llm_imports -x
```
Verifies `grep -r "anthropic\|openai\|litellm" backend/app/` returns zero.

### Sampling Rate
- **Per task commit:** `cd backend && python -m pytest tests/test_export.py -x -q`
- **Per wave merge:** `cd backend && python -m pytest -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_export.py` — all EXPORT-01..06 tests (7 test functions above)
- [ ] `frontend/src/lib/advisorPrompt.ts` — file must exist with `[SCHEMA BLOCK]` before Advisor.tsx imports it

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| async service for DB-reading background work | sync service (`create_engine` / `sessionmaker`) | Established constraint since Phase 5; APScheduler + async = deadlock |
| Separate session per sub-query | Single `_Session()` context, all queries inside | Avoids `DetachedInstanceError` on lazy-loaded relationships |

---

## Open Questions

1. **BottomNav 6th tab vs. replacement**
   - What we know: BottomNav currently has 5 entries (Today, Tasks, Goals, Organize, Settings); adding a 6th narrows each tab.
   - What's unclear: Whether Organize or Ingest could be demoted/merged.
   - Recommendation: Add as 6th tab initially; decide whether to merge after seeing the layout. The Ingest page has low daily-use frequency and could potentially move under Settings.

2. **`_find_stalled_goals` vs. `get_stalled_goals` inside bundle service**
   - What we know: `get_stalled_goals()` opens its own `_Session()`; `_find_stalled_goals(session, threshold)` reuses an existing session.
   - What's unclear: Whether calling the private helper across module boundary is acceptable.
   - Recommendation: Import `_find_stalled_goals` from `guidance_service` directly. It is already tested via `test_guidance.py`. Avoids opening a second connection.

3. **Threshold for velocity labels**
   - What we know: The decision document leaves this to Claude's discretion.
   - Recommendation: ±10/±5 percentage points across a 4-snapshot window (see Code Examples). Flag thresholds as a named constant `ACCEL_THRESHOLD = 10` / `STALL_THRESHOLD = -5` so they are easy to tune.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `backend/app/services/brief.py` — confirmed sync engine pattern, `_compute_progress_sync` signature
- Direct inspection of `backend/app/services/guidance_service.py` — confirmed `get_stalled_goals` and `_find_stalled_goals` signatures and return types
- Direct inspection of `backend/app/models/goal.py` — confirmed `GoalProgressSnapshot` schema, `Goal`/`Milestone` fields, `GoalType` enum values
- Direct inspection of `backend/app/models/plan.py` — confirmed `ScheduledBlock` fields (`date_key`, `completed`)
- Direct inspection of `backend/app/models/calendar.py` — confirmed `CalendarEvent` fields (`start_dt` as UtcDateTime, `start_date`, `all_day`, `cancelled`, `title`)
- Direct inspection of `backend/app/models/__init__.py` — confirmed `Task` fields (`priority`, `due_date`, `completed`, `completed_at`, `goal_id`, `is_habit`)
- Direct inspection of `backend/app/routers/export.py` — confirmed existing router prefix, snapshot endpoint shape
- Direct inspection of `backend/app/schemas/export.py` — confirmed `SnapshotResponse` model; `BundleResponse` does not yet exist
- Direct inspection of `frontend/src/hooks/useIngest.ts` — confirmed hook pattern (loading state, error handling, 422 parsing)
- Direct inspection of `frontend/src/pages/Ingest.tsx` — confirmed page pattern (copy button, preview, confirm flow)
- Direct inspection of `frontend/src/lib/ingestPrompt.ts` — confirmed `INGEST_PROMPT` export pattern as TypeScript string constant
- Direct inspection of `frontend/src/App.tsx` — confirmed react-router route structure; no `/advisor` route yet
- Direct inspection of `frontend/src/components/BottomNav.tsx` — confirmed 5-tab layout, NavLink pattern, lucide-react icons
- Direct inspection of `backend/app/services/snapshot_service.py` — confirmed how Phase 14 uses `_compute_progress_sync` from `brief.py`
- Direct inspection of `backend/app/main.py` — confirmed `export.router` already registered; no new registration needed
- Direct inspection of `backend/tests/test_snapshots.py` — confirmed test pattern (session fixture, TestClient monkeypatching)
- Alembic migration directory scan — confirmed HEAD is `0017`; Phase 15 needs no new migration

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all assets confirmed by direct code inspection
- Architecture patterns: HIGH — every pattern is a direct copy or minor extension of existing code
- Data source map: HIGH — all model fields confirmed in source; all query shapes match existing service patterns
- Pitfalls: HIGH — derived from known project constraints (STATE.md) and model field inspection, not speculation

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (stable codebase; no external dependencies)
