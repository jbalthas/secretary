# Phase 9: Goals + Ingest UI — Research

**Researched:** 2026-06-16
**Domain:** React 19 + Vite 8 SPA — new Goals page, GoalDrawer, IngestPage, goal dropdown in existing drawers, and small FastAPI backend additions (ingest preview endpoint + routine goal_id schema)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Goals becomes a 4th bottom-nav tab (Today / Tasks / Goals / Settings). Reuse the existing BottomNav NavLink pattern + a lucide icon (e.g. `Target` / `Flag`).

**D-02:** The Ingest page lives at its own route (e.g. `/ingest`), not a nav tab, reached via an "Import" button on the Goals page.

**D-03:** Full goal CRUD in the UI — create / edit / archive goals via a drawer + FAB, mirroring the Tasks page pattern. Archive = `PATCH /goals/{id}` with `status=archived` (no hard delete). Manual create uses `POST /goals` (requires `title` + `type` enum; `external_key` omitted for manual goals).

**D-04:** Goal create/edit form fields: `title` (required), `type` (enum: career|life|health|learning|financial), `description` (optional), `target_date` (optional). Status is managed via archive/complete actions, not a free field.

**D-05:** Milestones are add + toggle-done in goal detail. Done checkbox calls `PATCH /goals/{id}/milestones/{ms_id}` with `done=true`. "Add milestone" calls `POST /goals/{id}/milestones`.

**D-06:** Goal detail layout: progress bar/percent at top, then milestones list (done checkboxes + add), then linked tasks list (each tappable to open TaskDrawer).

**D-07:** Both tasks and routines get a goal dropdown. Task drawer is backend-ready. Routine linking requires a small backend touch: add `goal_id` to `RoutineCreate` / `RoutineUpdate` / `RoutineRead` and wire through routine router.

**D-08:** Dropdown lists active goals only, plus a "No goal" (unlink) option.

**D-09:** Input supports both paste (textarea) and `.json` file upload. Upload reads file text into the same payload pipeline as paste.

**D-10:** Dry-run preview shows a full per-entity list. Add `POST /api/v1/ingest/preview` that returns each goal / task / routine / habit with a create-vs-update badge. UI renders a grouped, scrollable diff.

**D-11:** Confirm posts the same payload to the existing `POST /ingest/confirm`. Confirm button is disabled on submit to prevent double-commit.

**D-12:** Ingest page surfaces the documented LLM prompt + schema with a copy-to-clipboard button.

**D-13:** Validation errors (HTTP 422) render as a readable field-level list — parse FastAPI's `detail[]` (loc + msg) into entries like `tasks[2].due_date: invalid datetime`.

### Claude's Discretion

- Exact `POST /ingest/preview` response shape — design during planning; must share matching logic with confirm to avoid drift.
- Where the documented LLM prompt is stored/served (static frontend constant vs a `GET /ingest/prompt` endpoint vs a repo doc rendered in the UI) — pick the simplest that fits the SPA + fetch pattern.
- Goal-card visual treatment (progress bar style, type badge) and the goals empty state.
- Icon choices for the Goals tab and Import button.
- Whether routine→goal dropdown reuses a shared `<GoalSelect>` component with the task drawer (likely yes).

### Deferred Ideas (OUT OF SCOPE)

- Routine→goal tagging split to follow-up if backend touch proves too large (default: include it).
- Habit-specific UI (separate habit management, streaks).
- Goal auto-complete at 100% progress.
- Per-item ingest conflict resolution UI.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GOAL-04 | User can view all goals in a dedicated Goals view and drill into a goal detail showing its milestones, linked tasks, and progress | Goals page + GoalDrawer/Detail using existing `GET /goals/` and `GET /goals/{id}`; progress_pct already in GoalRead |
| GOAL-05 | User can link a task to a goal from the task form (goal dropdown); routines can also be tagged to a goal | TaskDrawer already carries goal_id in TaskCreate; RoutineCreate/Update/Read need goal_id added (small schema + router touch); shared GoalSelect component |
| INGEST-03 | User can preview an import (dry-run) and see exactly what will be created vs. updated (counts + per-entity diff) before anything is written | New `POST /ingest/preview` endpoint needed; preview logic reuses _upsert_* matching without session.commit(); response shape design is Claude's discretion |
| INGEST-05 | User can submit a payload by pasting JSON into a textarea OR uploading a `.json` file from the web UI | Ingest page with textarea + file input; FileReader API reads `.json` file into the same JSON pipeline; no binary handling needed |
</phase_requirements>

---

## Summary

Phase 9 is a front-end-heavy phase with one small backend addition (preview endpoint) and one minor schema touch (routine goal_id). The backend is entirely healthy — 20 tests pass across `test_goals.py` and `test_ingest.py`. All the data endpoints this UI needs are already implemented and verified.

The frontend work follows a clear, established pattern. `Tasks.tsx` + `TaskDrawer.tsx` + `useTasks.ts` form the exact template to replicate for Goals. The CSS already has every class needed (`.page`, `.drawer`, `.backdrop`, `.confirm-modal-overlay`, `.btn-save`, `.segmented-control`, `.empty-state`, `.fab`). The only new CSS needed is a progress bar and possibly a type-badge color variant.

The ingest preview endpoint is the one net-new backend feature. Its implementation is mechanical: extract the `external_key` lookup from each `_upsert_*` helper into a read-only `_resolve_*` function, run those in a read-only transaction (or no transaction at all — just a `SELECT` per entity), collect create-vs-update badges, and return a structured diff. No DB writes. The client re-sends the full payload on confirm (stateless, per ARCHITECTURE.md locked decision).

**Primary recommendation:** Build in this order — backend additions first (preview endpoint + routine schema), then frontend in parallel-friendly pieces: types/hooks, GoalSelect shared component, GoalDrawer, Goals page + routing, TaskDrawer goal dropdown, RoutineDrawer goal dropdown, Ingest page.

---

## Standard Stack

### Core (already installed, no new dependencies)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| React | 19.2.x | UI component tree | Already in use |
| Vite | 8.x | Build + dev server | Already in use |
| react-router-dom | existing | Route registration, NavLink | Already in use — BottomNav uses NavLink with isActive |
| lucide-react | existing | Icons | Already in use — Calendar, ListTodo, Settings |
| FastAPI | 0.128.x | Backend API | Already in use |
| Pydantic v2 | bundled | Request/response validation | Already in use |
| SQLAlchemy 2.0 async | 2.0.x | ORM | Already in use |

### No new packages required

All tooling is in place. The phase requires:
- Zero new npm packages
- Zero new Python packages

**Verification:** `backend/pyproject.toml` and `frontend/package.json` already cover everything needed.

---

## Architecture Patterns

### Recommended New File Layout

```
backend/app/
├── routers/
│   └── ingest.py              # add POST /preview route
├── schemas/
│   ├── ingest.py              # add IngestPreviewResult + per-entity diff schema
│   └── routine.py             # add goal_id to RoutineCreate/Update/Read
├── services/
│   └── ingest_service.py      # add dry_run_import() using read-only _resolve_* helpers

frontend/src/
├── types/
│   ├── goal.ts                # new — Goal, GoalCreate, GoalUpdate, Milestone
│   └── task.ts                # extend — add goal_id?: number
│   └── routine.ts             # extend — add goal_id?: number to Routine + RoutineInput
├── hooks/
│   ├── useGoals.ts            # new — plain-fetch + refresh() pattern
│   └── useIngest.ts           # new — preview + confirm + loading/error state
├── components/
│   ├── GoalDrawer.tsx         # new — create/edit/archive drawer (mirrors TaskDrawer)
│   ├── GoalSelect.tsx         # new — shared <select> of active goals + "No goal"
│   ├── TaskDrawer.tsx         # extend — add GoalSelect field
│   └── RoutineDrawer.tsx      # extend — add GoalSelect field
├── pages/
│   ├── Goals.tsx              # new — goal list + FAB + GoalDrawer + detail sub-view
│   └── Ingest.tsx             # new — paste/upload + preview + confirm
└── App.tsx                    # extend — /goals + /ingest routes + BottomNav Goals tab
```

### Pattern 1: Hook shape (mirror useTasks.ts exactly)

```typescript
// Source: frontend/src/hooks/useTasks.ts — established pattern
const API = "/api/v1/goals";

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);

  async function refresh() {
    const res = await fetch(API + "/");
    setGoals(await res.json());
  }

  async function createGoal(body: GoalCreate) {
    await fetch(API + "/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await refresh();
  }

  async function patchGoal(id: number, body: Partial<GoalUpdate>) {
    await fetch(`${API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await refresh();
  }

  useEffect(() => { refresh(); }, []);

  return { goals, refresh, createGoal, patchGoal };
}
```

### Pattern 2: BottomNav 4th tab (mirror existing NavLink entries exactly)

```typescript
// Source: frontend/src/components/BottomNav.tsx — NavLink + isActive style callback
import { Target } from "lucide-react";  // or Flag

<NavLink
  to="/goals"
  style={({ isActive }) => ({
    ...tabStyle,
    color: isActive ? "var(--accent)" : "var(--text-secondary)",
  })}
>
  <Target size={22} />
  Goals
</NavLink>
```

Note: BottomNav currently has 3 tabs with `flex: 1` each. Adding a 4th tab naturally reduces each to 25% width. No CSS change needed — flex handles it. Settings tab moves from position 3 to 4. The `paddingBottom: 56` in App.tsx is already set for the nav bar height.

### Pattern 3: Route registration (App.tsx)

```typescript
// Source: frontend/src/App.tsx — existing Routes block
import Goals from "./pages/Goals";
import Ingest from "./pages/Ingest";

// Inside Routes:
<Route path="/goals" element={<Goals />} />
<Route path="/goals/:goalId" element={<Goals />} />   // or handle detail in-page via state
<Route path="/ingest" element={<Ingest />} />
```

The goal detail can be rendered as a sub-view within `Goals.tsx` (selected goal in state), avoiding a separate route. Alternatively a `/goals/:goalId` route. Given the drawer pattern used throughout, in-page state (similar to how TaskDrawer works) is simpler and consistent.

### Pattern 4: GoalSelect shared component

```typescript
// Shared between TaskDrawer and RoutineDrawer
interface GoalSelectProps {
  value: number | null;
  onChange: (goalId: number | null) => void;
}

export function GoalSelect({ value, onChange }: GoalSelectProps) {
  const { goals } = useGoals();
  const active = goals.filter(g => g.status === "active");
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">No goal</option>
      {active.map(g => (
        <option key={g.id} value={g.id}>{g.title}</option>
      ))}
    </select>
  );
}
```

Key point: `useGoals()` inside GoalSelect means the drawer that renders GoalSelect will fetch goals. This is fine — the fetch is lightweight and cached via the hook's `useState`. The planner may choose to pass goals as a prop instead to avoid double-fetching when Goals.tsx is the parent.

### Pattern 5: Preview endpoint backend design

The preview must share matching logic with confirm but write nothing. The cleanest approach:

```python
# backend/app/services/ingest_service.py additions

async def _resolve_goal(key: str, session: AsyncSession) -> bool:
    """Returns True if existing (update), False if new (create)."""
    result = await session.execute(select(Goal).where(Goal.external_key == key))
    return result.scalar_one_or_none() is not None

# Per entity type, same pattern.

async def dry_run_import(payload: IngestPayload, session: AsyncSession) -> "IngestPreviewResult":
    # Read-only: no session.begin(), no mutations, no flush/commit
    goal_diffs = []
    goal_key_exists: dict[str, bool] = {}
    for g in payload.goals:
        exists = await _resolve_goal(g.external_key, session)
        goal_key_exists[g.external_key] = exists
        goal_diffs.append({"external_key": g.external_key, "title": g.title, "action": "update" if exists else "create"})

    task_diffs = []
    for t in payload.tasks:
        result = await session.execute(select(Task).where(Task.external_key == t.external_key))
        exists = result.scalar_one_or_none() is not None
        task_diffs.append({"external_key": t.external_key, "title": t.title, "action": "update" if exists else "create"})

    # ... same for routines and habits

    return IngestPreviewResult(goals=goal_diffs, tasks=task_diffs, ...)
```

### Pattern 6: Ingest page file upload + paste pipeline

```typescript
// File upload reads into the same string as paste
function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => setRawJson(ev.target?.result as string);
  reader.readAsText(file);
}
```

FileReader API is universally supported and synchronous for text. No library needed.

### Pattern 7: 422 error parsing for field-level display

```typescript
// FastAPI 422 detail format: { detail: [{loc: ["body", "tasks", 2, "due_date"], msg: "..."}] }
function parse422(detail: {loc: (string | number)[], msg: string}[]): string[] {
  return detail.map(e => {
    const path = e.loc.filter(p => p !== "body").join(".");
    return `${path}: ${e.msg}`;
  });
}
```

This produces lines like `tasks.2.due_date: invalid datetime` which matches D-13.

### Pattern 8: Disable-on-submit for Confirm button

```typescript
const [confirming, setConfirming] = useState(false);

async function handleConfirm() {
  setConfirming(true);
  try {
    await ingest.confirm(rawJson);
    // refresh goals/tasks hooks
  } finally {
    setConfirming(false);
  }
}

<button disabled={confirming} className="btn-save" onClick={handleConfirm}>
  {confirming ? "Importing…" : "Confirm Import"}
</button>
```

The `disabled` prop plus visual opacity (`style={{ opacity: confirming ? 0.6 : 1 }}`) mirrors `RoutineDrawer.tsx`'s existing save button pattern.

### Anti-Patterns to Avoid

- **Importing `useGoals` inside GoalSelect and also in Goals.tsx causing double fetch:** Pass goals as props to GoalSelect from the parent, or accept the two fetches as acceptable overhead (the API is local, sub-5ms).
- **Goal detail as a separate route with full page reload:** Use in-page state (selectedGoalId) instead. Maintains the SPA feel, avoids route nesting complexity.
- **Calling `POST /ingest/confirm` directly without preview:** The UI must enforce preview-first (show preview panel before enabling Confirm). But there is no server-side enforcement — the confirm endpoint accepts payloads directly. UI-only gate is acceptable per CONTEXT.md D-10.
- **Storing LLM prompt in a DB-backed endpoint:** Serve it as a static constant in the frontend bundle or a static file. The prompt doesn't change per-user and doesn't need a round-trip.
- **Calling `session.flush()` in the preview service function:** Preview must be fully read-only. No `session.begin()`, no `flush()`, no `commit()`. Just `SELECT` queries.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom SVG/canvas arc | Plain `<div>` with `width: {pct}%` on a colored inner div | No library needed; the CSS pattern is trivial for a horizontal bar |
| Goal dropdown fetching | Custom autocomplete/combobox | Native `<select>` with `option` elements | The goal list is small (<20 items typical); no search needed |
| File reading | FormData multipart upload to backend | Browser `FileReader` API reading to text string | Backend already accepts JSON body; no need for multipart handling |
| JSON validation on paste | Custom parser | `JSON.parse` in a try/catch with user-facing error | Catch the SyntaxError, show "Invalid JSON" before even calling preview |
| Clipboard copy | Third-party clipboard library | `navigator.clipboard.writeText()` | Standard browser API, fully supported in modern browsers |

---

## Common Pitfalls

### Pitfall 1: BottomNav tab width collapse at 4 tabs on small phones

**What goes wrong:** The 4th tab (`Goals`) pushes each tab to 25% width. On 320px screens the icon + label truncates or wraps.
**Why it happens:** `tabStyle` has `flex: 1` so all tabs share equally. 25% of 320px = 80px. At 14px font, "Goals" fits; "Today" and "Tasks" fit. "Settings" at 8 chars may clip on extreme small screens.
**How to avoid:** Test at 360px (Android minimum). The current tab labels are short enough that this should not be an issue. If it is, reduce `fontSize` from 14 to 12 in tabStyle.
**Warning signs:** Label text wraps to two lines, making the nav taller than 56px and pushing content up.

### Pitfall 2: `useGoals()` inside GoalSelect causes stale data in drawers

**What goes wrong:** TaskDrawer opens, GoalSelect mounts with its own `useGoals()` call, which has a separate state from Goals.tsx. If a goal was just created in Goals.tsx, the dropdown in TaskDrawer won't see it until it re-mounts.
**Why it happens:** Each hook invocation has independent state.
**How to avoid:** Either (a) hoist `useGoals()` to a parent and pass `goals` as prop, or (b) refresh the hook on drawer open. Option (b) is simplest: add `goals.refresh()` inside the `useEffect([open])` in TaskDrawer. The alternative is to accept slight staleness — for typical use, the user won't create a goal and immediately link it in the same session without a page interaction.
**Warning signs:** Goal just created in Goals tab doesn't appear in task drawer dropdown.

### Pitfall 3: `PATCH /routines/{id}` drops goal_id when existing routine is edited without it

**What goes wrong:** `RoutineUpdate` currently has no `goal_id` field. When the UI sends a PATCH after adding `goal_id` to RoutineInput/RoutineUpdate, the field needs to explicitly be present. But because `exclude_unset=True` is used on the backend, if the frontend sends `goal_id: null` to unlink, this must be explicit in the payload (not omitted).
**Why it happens:** `exclude_unset=True` skips fields not sent. Sending `null` vs not sending are different. To unlink, the frontend must send `goal_id: null`.
**How to avoid:** In RoutineDrawer save handler, always include `goal_id` in the body (either an integer or `null`), never omit it.
**Warning signs:** Routine appears linked after saving without a goal in the dropdown.

### Pitfall 4: Ingest preview `external_key` lookup runs outside a transaction boundary

**What goes wrong:** The preview reads the DB outside a transaction. If two users (hypothetical) run preview + confirm concurrently, there's a TOCTOU window where preview shows "create" but confirm sees "update". 
**Why it happens:** Preview is intentionally read-only (stateless per ARCHITECTURE.md).
**How to avoid:** This is acceptable for a single-user personal app. Document it as a known limitation. Don't try to add advisory locking — that adds complexity with no benefit for the use case.
**Warning signs:** N/A — acceptable for the project scope.

### Pitfall 5: FileReader reads file as base64 instead of text

**What goes wrong:** `reader.readAsDataURL()` is called instead of `reader.readAsText()`, producing a `data:application/json;base64,...` string instead of the JSON content.
**Why it happens:** Developer confusion between the two `FileReader` methods.
**How to avoid:** Use `reader.readAsText(file)` explicitly. The onload handler returns `ev.target.result` as a string.
**Warning signs:** `JSON.parse` throws `SyntaxError` with "data:application/json" at start of input.

### Pitfall 6: Goal detail linked tasks don't open TaskDrawer correctly

**What goes wrong:** Clicking a linked task in goal detail should open TaskDrawer pre-filled with that task. If Tasks page's state is not shared, the drawer won't have access to `patchTask` / `deleteTask`.
**Why it happens:** TaskDrawer requires `onSave` and `onDelete` callbacks that are scoped to where it's declared.
**How to avoid:** Goals.tsx must declare its own `useTasks()` hook instance and render a TaskDrawer independently. Alternatively, render task rows as read-only with a link to `/tasks` (simpler). Given D-06 says "each task tappable to open the existing TaskDrawer," instantiate a TaskDrawer within Goals.tsx backed by its own useTasks hook.
**Warning signs:** Clicking a linked task causes an error because patchTask/deleteTask are undefined.

---

## Backend Additions Detail

### 1. `POST /api/v1/ingest/preview` — new endpoint

**Schema additions to `schemas/ingest.py`:**

```python
class EntityDiff(BaseModel):
    external_key: str
    title: str
    action: Literal["create", "update"]

class IngestPreviewResult(BaseModel):
    goals: list[EntityDiff] = []
    tasks: list[EntityDiff] = []
    routines: list[EntityDiff] = []
    habits: list[EntityDiff] = []
```

**Service addition in `ingest_service.py`:**
- Add `async def dry_run_import(payload: IngestPayload, session: AsyncSession) -> IngestPreviewResult`
- Uses individual `SELECT` by `external_key` per entity (no writes)
- Must NOT call `session.begin()` or `session.flush()`

**Router addition in `routers/ingest.py`:**
```python
@router.post("/preview", response_model=IngestPreviewResult)
async def preview(payload: IngestPayload, session: AsyncSession = Depends(get_session)):
    return await ingest_service.dry_run_import(payload, session)
```

HTTP 422 from Pydantic validation (same as confirm) is automatic — no extra handling needed.

### 2. `goal_id` on Routine schema — schema-only touch

**Changes to `schemas/routine.py`:**
- Add `goal_id: int | None = None` to `RoutineCreate`
- Add `goal_id: int | None = None` to `RoutineUpdate`
- Add `goal_id: int | None = None` to `RoutineRead`

**Changes to `routers/routines.py`:** None needed — `Routine(**body.model_dump())` already passes all fields; `goal_id` will flow through automatically.

**No migration needed:** `Routine.goal_id` column already exists from Phase 8 migration 0008.

### 3. LLM prompt artifact

The prompt should live as a static TypeScript constant in the frontend (e.g. `frontend/src/lib/ingestPrompt.ts`). This is the simplest approach: no backend round-trip, versioned with the codebase, displayed via `<pre>` with a copy button. The schema is already available at `GET /api/v1/ingest/schema` for reference in the prompt text.

---

## Frontend Types

### `types/goal.ts` (new)

```typescript
import type { GoalType, GoalStatus } from "./goalEnums"; // or inline

export type GoalType = "career" | "life" | "health" | "learning" | "financial";
export type GoalStatus = "active" | "archived" | "completed";

export interface Milestone {
  id: number;
  goal_id: number;
  title: string;
  target_date: string | null;
  done: boolean;
}

export interface Goal {
  id: number;
  title: string;
  type: GoalType;
  description: string | null;
  target_date: string | null;
  status: GoalStatus;
  external_key: string | null;
  created_at: string;
  updated_at: string;
  progress_pct: number;
  milestones: Milestone[];
}

export interface GoalCreate {
  title: string;
  type: GoalType;
  description?: string;
  target_date?: string;
}

export interface GoalUpdate {
  title?: string;
  type?: GoalType;
  description?: string;
  target_date?: string;
  status?: GoalStatus;
}

export interface MilestoneCreate {
  title: string;
  target_date?: string;
}

export interface IngestEntityDiff {
  external_key: string;
  title: string;
  action: "create" | "update";
}

export interface IngestPreviewResult {
  goals: IngestEntityDiff[];
  tasks: IngestEntityDiff[];
  routines: IngestEntityDiff[];
  habits: IngestEntityDiff[];
}
```

### `types/task.ts` extension

Add `goal_id?: number` to both `Task` and `TaskCreate`.

### `types/routine.ts` extension

Add `goal_id?: number` to both `Routine` and `RoutineInput`.

---

## Code Examples

### Progress bar (no library needed)

```tsx
// Source: plain CSS + inline style — established project pattern
function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 4, transition: "width 300ms ease" }} />
    </div>
  );
}
```

### Type badge (reuse priority-badge pattern from styles.css)

```tsx
// Mirror .priority-high / .priority-medium / .priority-low visual treatment
const TYPE_COLORS: Record<GoalType, string> = {
  career:    "rgba(99, 102, 241, 0.15)",  // indigo
  life:      "rgba(16, 185, 129, 0.15)",  // emerald
  health:    "rgba(239, 68, 68, 0.15)",   // red
  learning:  "rgba(245, 158, 11, 0.15)",  // amber
  financial: "rgba(20, 184, 166, 0.15)",  // teal
};
```

### JSON parse guard before preview call

```typescript
function tryParseJson(raw: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: (e as SyntaxError).message };
  }
}
```

### useIngest hook shape

```typescript
const API = "/api/v1/ingest";

export function useIngest() {
  const [previewResult, setPreviewResult] = useState<IngestPreviewResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function preview(payload: unknown) {
    setPreviewing(true);
    setErrors([]);
    setPreviewResult(null);
    try {
      const res = await fetch(`${API}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setPreviewResult(await res.json());
      } else if (res.status === 422) {
        const body = await res.json();
        setErrors(parse422(body.detail));
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function confirm(payload: unknown): Promise<boolean> {
    setConfirming(true);
    setErrors([]);
    try {
      const res = await fetch(`${API}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
      if (res.status === 422) {
        const body = await res.json();
        setErrors(parse422(body.detail));
      }
      return false;
    } finally {
      setConfirming(false);
    }
  }

  return { previewResult, errors, previewing, confirming, preview, confirm };
}
```

---

## Environment Availability

Step 2.6: SKIPPED — this is a code/config change phase with no external tool dependencies beyond the existing project stack. Node 22 and Python 3.12 (via uv) are already verified in prior phases.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x + FastAPI TestClient (sync) |
| Config file | `backend/pyproject.toml` (`[dependency-groups] dev = ["pytest>=8", ...]`) |
| Quick run command | `uv run --project backend python -m pytest backend/tests/test_ingest.py backend/tests/test_goals.py -q` |
| Full suite command | `uv run --project backend python -m pytest backend/tests/ -q` |

Frontend has no test infrastructure in place (no vitest config, no `*.test.tsx` files for components). Per project convention, UI behavior is validated via manual golden-path testing (CLAUDE.md: "Test the golden path before declaring a UI/frontend change done").

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGEST-03 | `POST /ingest/preview` returns per-entity diff, no DB writes | unit | `uv run --project backend python -m pytest backend/tests/test_ingest.py -k preview -q` | ❌ Wave 0 |
| INGEST-05 | Frontend file upload + paste → same JSON pipeline | manual | Visual browser test — paste valid JSON, upload .json file | N/A |
| GOAL-04 | Goals list renders, detail shows milestones + tasks + progress | manual | Visual browser test | N/A |
| GOAL-05 | Task + routine drawers show goal dropdown; link reflected in goal detail | manual | Visual browser test | N/A |

Backend-testable: INGEST-03 (preview endpoint). All frontend behaviors are manual-only.

### Sampling Rate

- **Per task commit:** `uv run --project backend python -m pytest backend/tests/test_ingest.py backend/tests/test_goals.py -q`
- **Per wave merge:** `uv run --project backend python -m pytest backend/tests/ -q`
- **Phase gate:** Full backend suite green + manual golden-path of Goals page + Ingest page before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_ingest.py` — add `test_preview_*` tests covering: preview returns EntityDiff list, preview does not write to DB, preview returns 422 on invalid payload

*(Frontend component tests: None planned. Manual golden-path is the established project convention.)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3-tab BottomNav | 4-tab BottomNav | Phase 9 | `flex: 1` naturally redistributes; no CSS change needed |
| `RoutineCreate` without goal_id | `RoutineCreate` with `goal_id: int | None` | Phase 9 | Schema-only; migration 0008 already added column |
| `IngestResult` (counts only) | `IngestPreviewResult` (per-entity diff) | Phase 9 | New endpoint; existing confirm endpoint unchanged |
| No Goals UI | Full Goals CRUD UI | Phase 9 | New page, new drawer, new hook, new types |

---

## Open Questions

1. **Goal detail as in-page state vs `/goals/:goalId` route**
   - What we know: CONTEXT.md D-06 describes the detail layout but doesn't specify routing
   - What's unclear: Whether deep-linking to a specific goal is needed (e.g. after import)
   - Recommendation: Use in-page `selectedGoalId` state for simplicity. The ingest confirmation can set a URL param if needed later.

2. **useGoals() hoisting for GoalSelect**
   - What we know: GoalSelect needs the active goals list; TaskDrawer and RoutineDrawer both use it
   - What's unclear: Whether to lift `useGoals()` to App.tsx (global) or re-fetch per drawer open
   - Recommendation: Keep it local to each drawer — fetch on drawer open via a `useEffect([open])` refresh. The API is local; sub-millisecond response. Global lifting adds context complexity not justified by the project scale.

3. **LLM prompt content**
   - What we know: The prompt must be authored (it was deferred from Phase 8). It should explain the schema + produce compliant JSON.
   - What's unclear: The exact prompt text
   - Recommendation: Planner should create a task for prompt authoring. The prompt should reference `GET /api/v1/ingest/schema` output and explain: `schema_version`, `external_key` as stable slug, `goal_key` reference pattern, and cron expression format.

---

## Sources

### Primary (HIGH confidence)

- Direct code audit: `backend/app/routers/goals.py`, `schemas/goal.py`, `routers/ingest.py`, `schemas/ingest.py`, `services/ingest_service.py`, `schemas/routine.py`, `models/__init__.py`, `models/goal.py`
- Direct code audit: `frontend/src/App.tsx`, `components/BottomNav.tsx`, `pages/Tasks.tsx`, `components/TaskDrawer.tsx`, `hooks/useTasks.ts`, `types/task.ts`, `components/RoutineDrawer.tsx`, `hooks/useRoutines.ts`, `types/routine.ts`, `styles.css`
- Test run: 20/20 passing in `test_goals.py` + `test_ingest.py` — backend confirmed healthy
- CONTEXT.md decisions D-01 through D-13

### Secondary (MEDIUM confidence)

- MDN FileReader API — browser-standard, universally supported in all modern browsers
- `navigator.clipboard.writeText()` — standard, supported in all HTTPS contexts (Tailscale serves HTTPS)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed and in use
- Architecture: HIGH — based on direct audit of existing code; patterns are consistent
- Pitfalls: HIGH — derived from direct code analysis and established project patterns
- Preview endpoint design: HIGH — ingest_service.py `_upsert_*` structure makes the read-only variant straightforward

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable React/FastAPI; no fast-moving dependencies in this phase)
