# Phase 13: Update Loop UI — Research

**Researched:** 2026-06-23
**Domain:** React 19 frontend integration — quick-update input, candidate confirmation, rollup card, check-in settings
**Confidence:** HIGH (all findings from direct source inspection)

---

## Summary

Phase 13 adds four UI surfaces to the existing React 19 + Vite SPA: a quick-update textarea on the Today tab, an inline candidate confirmation card, an end-of-day rollup card, and a check-in settings section in Settings. The Phase 12 backend is fully built and merged. This phase is pure frontend work with no backend changes, no new npm packages, and no new API endpoints.

The most important pre-planning finding is a **status string mismatch**: the backend `UpdateResponse` returns `"resolved"` on success (not `"applied"` as written in the UI-SPEC interaction contract). The planner must use `"resolved"` everywhere in frontend logic. The UI-SPEC's interaction flow text is the source of truth for UX behavior; the status string values come from the actual backend code.

A second finding: `isAfterWorkHours()` does not exist anywhere in the frontend codebase. The UI-SPEC treats it as "already implemented" (citing [10-04]), but that Phase 10 decision was about a frontend-only branch in Organize — the actual implementation was `calendarFull` (from `result.fully_booked`) and `workEnd` state, not a shared utility. The planner must include a Wave 0 task to implement `isAfterWorkHours(workEnd: string): boolean` as a module-level helper (not inside Organize.tsx) so Today.tsx can import it.

The check-in settings backend uses `PUT /api/v1/settings/check-in-time` (not `PATCH`) and stores `{ hour, minute }` as integers — not an HH:MM string. The UI-SPEC says `PATCH` and refers to `HH:MM`; the actual endpoint is `PUT` with `{ hour: int, minute: int }`. The hook must split the `<input type="time">` value before sending.

**Primary recommendation:** Write a `useCheckInSettings` hook mirroring `useBriefSettings` exactly (GET+PUT, split HH:MM to hour/minute), add `isAfterWorkHours` as a lib utility, and implement the four surfaces in the order: (1) `useCheckInSettings` hook, (2) Quick-update box on Today + `CandidateCard` component, (3) Rollup card on Today, (4) Check-in section in Settings.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 13. Constraints come from locked project decisions:

### Locked Decisions
- No new npm dependencies
- No server-side LLM
- Minimize API/token cost
- Inline-style + CSS class hybrid pattern (no component library)
- No shadcn, no third-party component registry

### Claude's Discretion
- Component file names and internal structure
- Hook decomposition (one hook vs. two)
- Test file organization

### Deferred Ideas (OUT OF SCOPE)
- Multi-time check-in (second check-in slot)
- Check-in Google Home announcement (backend supports it via existing TTS path but UI not in scope)
- Rollup "carry forward" UI — rollover is handled by existing brief/scheduler path, not a new UI action
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPDATE-01 | Quick-update box on Today tab — free text, no task form, phone dictation support | `<textarea>` (not `<input>`) required for mobile dictation; POST to `/api/v1/updates/resolve`; status `"resolved"` clears; status `"ambiguous"`/`"no_match"` shows CandidateCard |
| UPDATE-03 | Ambiguous/no-match surfaces to user for confirmation — never silently dropped | CandidateCard with per-candidate "Confirm match" button re-POSTs with confirmed entity id; "Skip" removes from local list; "None of these — dismiss" clears state |
| UPDATE-04 | End-of-day rollup card — completed vs. slipped; unfinished items carry forward via existing brief path | Rollup gated on `isAfterWorkHours(workEnd)` (must be created); data from existing `useTasks` + `usePlan(todayKey).blocks`; `completed=true` = "completed", `completed=false` + scheduled today = "slipped" |
| NOTIF-08 | Check-in time(s) and enable/disable configurable from web UI; persists via APScheduler | `useCheckInSettings` hook; `GET/PUT /api/v1/settings/check-in-time`; sends `{ hour, minute }` integers; toggle drives `checkinEnabled` local state (backend has no enabled column — see gap below) |
</phase_requirements>

---

## Backend Contract (Phase 12 — Verified from Source)

### Updates Resolver

**Endpoint:** `POST /api/v1/updates/resolve`
**File:** `backend/app/routers/updates.py:17`

**Request body** (`backend/app/schemas/update.py:4`):
```python
class UpdateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
```

**Response** (`backend/app/schemas/update.py:14`):
```python
class UpdateResponse(BaseModel):
    status: str        # "resolved" | "ambiguous" | "no_match"
    action: str | None = None          # "done" | "reschedule" | "drop"
    entity_type: str | None = None     # "task" | "block"
    entity_id: int | None = None
    entity_title: str | None = None
    score: float | None = None
    candidates: list[UpdateCandidate] = []
```

**Candidate shape** (`backend/app/schemas/update.py:8`):
```python
class UpdateCandidate(BaseModel):
    title: str
    entity_type: str   # "task" | "block"
    entity_id: int
    score: float
```

**CRITICAL — Status string mismatch with UI-SPEC:**
The UI-SPEC interaction contract uses `"applied"` as the success status. The actual backend returns `"resolved"`. Frontend code MUST check `status === "resolved"`, not `"applied"`.

**Resolution logic summary** (`backend/app/services/resolution_service.py`):
- Strips intent/stop words before fuzzy matching
- `CONFIDENT_THRESHOLD = 80` — single confident match → `"resolved"`
- `AMBIGUOUS_LOW = 50` — multiple above threshold, or one between 50–79 → `"ambiguous"` with up to 5 candidates
- Below 50 → `"no_match"` with empty candidates list

**Confirmed-candidate flow:** The UI-SPEC says to re-POST with `confirmed_id`. The current `UpdateRequest` schema only accepts `text`. The backend does NOT yet have a `confirmed_id` field in the request or any handling to apply a resolution directly. This is a backend gap — but reading the resolution service, applying the confirmed entity requires a second POST where the matched text is the confirmed entity's title (score will be 100, confident, single match). The simplest frontend approach: re-POST with the candidate's title as the text. This avoids any backend schema change. Alternatively, the planner may add `confirmed_id: int | None` to `UpdateRequest` and handle it in the router — verify which approach is cleaner. **This is an open question the planner must decide.**

**What the router does on "resolved":** The router (`updates.py`) currently only calls `resolution_service.resolve_update()` and returns the response — it does NOT mutate any DB state (no task.completed flip, no block.completed flip). The resolution service is a pure function returning candidates/status with no side effects. **The actual mutation (marking done/reschedule/drop) is not implemented in the backend.** The planner must resolve whether Phase 12 was supposed to include mutation or if Phase 13 adds it.

Checking the Phase 12 requirement: UPDATE-02 says "resolves simple updates — mark a task/block done, reschedule it, or drop it". The router only resolves; it does not apply. This is a significant gap. The planner needs to either (a) add mutation to the resolver endpoint in Phase 13, or (b) treat it as already shipped and confirmed applied (the UI can re-fetch and trust the backend). **Recommend: add mutation in Phase 13 as the first wave, then build the UI.**

### Check-In Settings

**GET endpoint:** `GET /api/v1/settings/check-in-time`
**PUT endpoint:** `PUT /api/v1/settings/check-in-time` (not PATCH — verified in `backend/app/routers/settings.py:88`)
**File:** `backend/app/routers/settings.py:80-99`

**GET response** (`CheckInTimeRead`):
```python
{ "hour": int, "minute": int }   # e.g. { "hour": 12, "minute": 0 }
```
Default: hour=12, minute=0 when no row exists.

**PUT request body** (`CheckInTimeUpdate`):
```python
{ "hour": int (0-23), "minute": int (0-59) }
```

**PUT side effect:** Calls `schedule_checkin(hour, minute)` which re-schedules the APScheduler job with `id="mid_day_checkin", replace_existing=True`. Persists across reboots via SQLAlchemyJobStore. No restart needed.

**Enable/disable gap:** The `AppSettings` model has NO `checkin_enabled` column (verified in `backend/app/models/__init__.py:55-56` — only `check_in_hour` and `check_in_minute`). The UI-SPEC check-in toggle requires enable/disable state. The backend does not have this field. **Options:**
1. Add `check_in_enabled` column via Alembic migration (migration chain continuation from 0011+) — clean but requires backend work
2. Use a sentinel: `check_in_hour = null` as disabled, any value as enabled — requires no migration but is a hack
3. Frontend-only: persist enabled state in localStorage — no backend change, not persistent across devices

**Recommend option 1** — a migration adding `check_in_enabled: bool, default True` with a nullable=True column (consistent with stall_threshold_days pattern) plus a GET/PUT schema update. This is a small Phase 13 backend addition. The planner must allocate a Wave 0 backend task for this.

**Checkin notification content** (`backend/app/services/checkin_service.py`):
- Title: `"Mid-day check-in"`
- Message: `"How's your day going? Log your progress."`
- Deep-link URL: `"/today?update=1"`

The deep-link `?update=1` is produced by the backend but the frontend Today page must read this query param to auto-focus or auto-scroll to the update input box. This is not mentioned in the UI-SPEC but is implied by the deep-link value. The planner should include reading `?update=1` to auto-focus the textarea.

---

## Frontend Integration Points

### HTTP Pattern

All API calls use native `fetch` with relative URLs. No custom API client. No axios. No SWR or React Query.

Pattern (from `useWorkHours.ts`, `useBriefSettings.ts`):
```typescript
const res = await fetch("/api/v1/settings/check-in-time");
const d = await res.json();
// ...
const res = await fetch(URL, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hour: h, minute: m }),
});
return res.ok;
```

No interceptors, no error object — hooks return boolean success from save functions. Error strings set in component state.

### Today.tsx Structure

`frontend/src/pages/Today.tsx` current structure:
```tsx
<div className="page">
  <h1 className="page-title">This Week</h1>
  <FocusBanner task={nextBest} />          // left-accent card
  {groups.map((group) => (                  // 7-day DaySection loop
    <DaySection ... />
  ))}
</div>
```

UI-SPEC placement:
- Quick-update input row: ABOVE `<FocusBanner>` (first element after `.page`)
- Rollup card: BELOW `<FocusBanner>`, ABOVE the `groups.map()` loop (Today-only, not repeated per day)
- CandidateCard: Replaces the update-input-row when `status === "ambiguous" | "no_match"`

Today.tsx already consumes: `useTasks()`, `useCalendarEvents()`, `usePlan(todayKey)`, `useNextBestTask()`.

For the rollup, Today already has `tasks`, `blocks`, and `todayKey` in scope. No new data fetching needed for the rollup — derive from existing state.

For `useWorkHours`: Today.tsx must add `useWorkHours()` to get `workEnd` for the rollup gate. This is a new hook call for this page.

**Data needed for rollup (all already available in Today.tsx):**
- `tasks` from `useTasks()` — filter by `due_date.slice(0,10) === todayKey` and `!completed`
- `blocks` from `usePlan(todayKey)` — filter by `date_key === todayKey`
- `workEnd` from `useWorkHours()` — for `isAfterWorkHours` gate

### Settings.tsx Pattern

`frontend/src/pages/Settings.tsx` pattern (to be mirrored exactly):

```typescript
// Constants at top of file
const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 13, // NOTE: 13px for existing Settings labels — do NOT change
  color: "var(--text-secondary)",
  margin: "0 0 12px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px 16px",
};
```

Each settings section follows:
```tsx
<section style={{ marginBottom: 24 }}>
  <p style={SECTION_LABEL_STYLE}>Section Name</p>
  <div style={CARD_STYLE}>
    {loading && value === null ? (
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
    ) : (
      <>
        {/* inputs */}
        {error && <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--destructive)" }}>{error}</p>}
        <button type="button" className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Label"}
        </button>
      </>
    )}
  </div>
</section>
```

The new Check-In Notification section goes at the bottom of the sections list, before `<RoutineDrawer>`.

### useWorkHours Hook Shape (existing)

```typescript
// frontend/src/hooks/useWorkHours.ts
export function useWorkHours() {
  // workStart: string | null  ("HH:MM")
  // workEnd: string | null    ("HH:MM")
  // loading: boolean
  // save(work_start, work_end): Promise<boolean>
  return { workStart, workEnd, loading, save };
}
```

`workEnd` is `"HH:MM"` string or null. `isAfterWorkHours(workEnd)` needs to handle the null case (return false when not loaded).

### useBriefSettings Hook (template for useCheckInSettings)

```typescript
// frontend/src/hooks/useBriefSettings.ts — exact template
export function useBriefSettings() {
  const [briefTime, setBriefTime] = useState<string | null>(null); // "HH:MM"
  // on GET: `${String(d.hour).padStart(2,"0")}:${String(d.minute).padStart(2,"0")}`
  // on PUT: split(":")  .map(Number) → { hour, minute }
  return { briefTime, loading, error, save };
}
```

`useCheckInSettings` follows exactly the same pattern, returns `{ checkInTime, checkInEnabled, loading, error, save }`.

### Refresh After Mutation

After a successful update submission (`status === "resolved"`), Today.tsx must re-fetch tasks and blocks to reflect the change. The pattern:

```typescript
// useTasks exposes: refresh()
// usePlan exposes: fetchBlocks()
const { tasks, refresh } = useTasks();
const { blocks, fetchBlocks } = usePlan(todayKey);
// after resolved:
await Promise.all([refresh(), fetchBlocks()]);
```

Both hooks expose their refresh functions. No optimistic UI needed — just re-fetch.

### isAfterWorkHours — Must Be Created

The function `isAfterWorkHours(workEnd: string | null): boolean` does not exist in the codebase. The UI-SPEC references it as existing from Phase 10, but Phase 10 accumulated context `[10-04]` says "frontend-only, no schema change" — the actual implementation in Organize.tsx uses `workEnd` state from `useWorkHours()` to set a schedule window input, not a shared utility.

**Create as:** `frontend/src/lib/timeUtils.ts` (or similar)

```typescript
export function isAfterWorkHours(workEnd: string | null): boolean {
  if (!workEnd) return false;
  const [h, m] = workEnd.split(":").map(Number);
  const now = new Date();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}
```

This is a pure, testable function. It should be exported from a lib file so both Today.tsx and any future consumer can import it.

### Deep-Link ?update=1

The check-in Pushover notification deep-links to `/today?update=1`. Today.tsx should read this on mount and auto-focus the update textarea. Pattern from Settings.tsx:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("update") === "1") {
    textareaRef.current?.focus();
    window.history.replaceState({}, "", "/today");
  }
}, []);
```

---

## Architecture Patterns

### Recommended Component/Hook Structure

```
frontend/src/
├── lib/
│   └── timeUtils.ts          # NEW: isAfterWorkHours(workEnd)
├── hooks/
│   └── useCheckInSettings.ts # NEW: mirrors useBriefSettings
├── components/
│   └── CandidateCard.tsx     # NEW: disambiguation UI (self-contained)
└── pages/
    ├── Today.tsx             # MODIFIED: add update box + rollup card
    └── Settings.tsx          # MODIFIED: add check-in section
```

`CandidateCard` is extracted as a component (not inlined in Today) because it has its own state (skipped candidates local list) and is conditionally rendered.

### State Machine for Update Flow (in Today.tsx)

```typescript
type UpdatePhase = "idle" | "submitting" | "candidates" | "confirming" | "success-flash";

interface UpdateState {
  phase: UpdatePhase;
  text: string;
  candidates: UpdateCandidate[];
  candidateStatus: "ambiguous" | "no_match" | null;
  error: string | null;
}
```

This avoids boolean flag proliferation. One state object covers the full flow.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy matching for candidates | Custom string distance | Backend already does it (rapidfuzz WRatio) | Resolution is server-side; frontend only displays results |
| Debounce on submit | Custom timer | Not needed — submit is user-triggered (button/Enter) | No autocomplete or typeahead in this phase |
| Toast/notification | Custom toast system | Inline success flash (`"Done"` for 1.5s) as per UI-SPEC | Existing pattern, no toast library |
| Time formatting | moment.js / date-fns | Native `Date` methods + padStart | Already the project pattern throughout |

---

## Common Pitfalls

### Pitfall 1: Status String "applied" vs "resolved"
**What goes wrong:** Frontend checks `status === "applied"` and never sees success because backend returns `"resolved"`.
**Why it happens:** UI-SPEC interaction contract used a different string than the actual backend implementation.
**How to avoid:** Use `"resolved"` in all frontend switch/if statements. Verify against `backend/app/schemas/update.py:16`.
**Warning signs:** Update always ends up in candidate flow even on clean matches.

### Pitfall 2: Check-In Endpoint is PUT not PATCH
**What goes wrong:** `fetch(URL, { method: "PATCH" })` → 405 Method Not Allowed.
**Why it happens:** UI-SPEC says `PATCH` but backend router defines `@router.put` (`backend/app/routers/settings.py:88`).
**How to avoid:** Use `PUT` in `useCheckInSettings.save()`.

### Pitfall 3: Check-In Body is `{hour, minute}` not `{time: "HH:MM"}`
**What goes wrong:** Backend returns 422 Unprocessable Entity if sent `{ time: "12:00" }`.
**Why it happens:** `CheckInTimeUpdate` schema takes `hour: int, minute: int` (`backend/app/schemas/settings.py:38`).
**How to avoid:** In `useCheckInSettings.save(time: string)`, do `const [h, m] = time.split(":").map(Number)` then send `{ hour: h, minute: m }`.

### Pitfall 4: checkin_enabled Has No Backend Column
**What goes wrong:** Toggle state is lost on page refresh; or enable/disable has no backend persistence.
**Why it happens:** `AppSettings` model has `check_in_hour`, `check_in_minute` but no `check_in_enabled`.
**How to avoid:** Plan must include a backend migration and schema update (Wave 0) before implementing the toggle. Alternatively, use null hour as the disabled sentinel.
**Warning signs:** Toggle shows wrong state on reload.

### Pitfall 5: isAfterWorkHours Not Imported
**What goes wrong:** `isAfterWorkHours is not defined` runtime error in Today.tsx.
**Why it happens:** Function referenced in UI-SPEC as pre-existing but does not exist anywhere in the codebase.
**How to avoid:** Wave 0 task creates `frontend/src/lib/timeUtils.ts` with the function before Today.tsx modification.

### Pitfall 6: Backend Resolver Doesn't Mutate State
**What goes wrong:** User submits "done with standup", sees "Done" flash, but task remains incomplete on re-fetch.
**Why it happens:** `POST /updates/resolve` (verified at `backend/app/routers/updates.py:17-26`) only fuzzy-matches and returns; it does NOT call `task.completed = True` or any DB write.
**How to avoid:** Wave 0 or Wave 1 backend task: extend the router to apply the resolved action (set `completed=True` for "done", `completed=True` for "drop" per Phase 12 decision, reschedule for "reschedule").
**Warning signs:** Tasks never disappear from the "slipped" rollup despite being logged as done.

### Pitfall 7: Rollup Treats completed=True as "Done" Only
**What goes wrong:** Dropped tasks show as "completed" in rollup, misleading the user.
**Why it happens:** Phase 12 decision [Phase 12-04]: `drop reuses completed=True (no separate drop flag/column)`.
**How to avoid:** UI-SPEC already acknowledges this: "rollup treats all `completed=true` as 'completed'". This is by design — document it in component comments. No mitigation needed, just awareness.

### Pitfall 8: Enter Key Behavior in Textarea
**What goes wrong:** Pressing Enter in the textarea inserts a newline instead of submitting.
**Why it happens:** `<textarea>` does not submit on Enter by default (unlike `<input>`).
**How to avoid:** Add `onKeyDown` handler: if `e.key === "Enter" && !e.shiftKey` → call submit handler and `e.preventDefault()`. Shift+Enter allows newline for multi-line entries.

---

## Rollup Data Source

**No new backend endpoint needed.** Today.tsx already has all required data in scope:

1. `tasks` (from `useTasks`) — all tasks. Filter to today's tasks:
   - `task.due_date && task.due_date.slice(0, 10) === todayKey`
2. `blocks` (from `usePlan(todayKey)`) — today's scheduled blocks, already filtered by `date_key`.

**Rollup classification:**
```typescript
// Completed: task.completed === true OR block.completed === true
// Slipped:   !completed AND (isBlock || task.due_date.slice(0,10) === todayKey)
// Note: completed=true is ambiguous (done vs dropped per Phase 12-04 decision)
// UI-SPEC decision: treat all completed=true as "completed" in rollup
```

For blocks, `block.completed` is available on `ScheduledBlock` type (`frontend/src/types/plan.ts` — verify the field exists there).

---

## Code Examples

### Pattern: Settings Card with Hook (useBriefSettings → useCheckInSettings template)

```typescript
// frontend/src/hooks/useCheckInSettings.ts
import { useEffect, useState } from "react";

const GET_URL = "/api/v1/settings/check-in-time";
const PUT_URL = "/api/v1/settings/check-in-time";

export function useCheckInSettings() {
  const [checkInTime, setCheckInTime] = useState<string | null>(null); // "HH:MM"
  const [checkInEnabled, setCheckInEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(GET_URL);
        if (!res.ok) throw new Error();
        const d = await res.json();
        setCheckInTime(`${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`);
        // d.enabled if/when backend adds the column
      } catch {
        setError("Could not load check-in settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(time: string, enabled: boolean): Promise<boolean> {
    const [h, m] = time.split(":").map(Number);
    const res = await fetch(PUT_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hour: h, minute: m }), // add enabled when backend supports it
    });
    if (res.ok) {
      setCheckInTime(time);
      setCheckInEnabled(enabled);
      return true;
    }
    return false;
  }

  return { checkInTime, checkInEnabled, setCheckInEnabled, loading, error, save };
}
```

### Pattern: isAfterWorkHours utility

```typescript
// frontend/src/lib/timeUtils.ts
export function isAfterWorkHours(workEnd: string | null): boolean {
  if (!workEnd) return false;
  const [h, m] = workEnd.split(":").map(Number);
  const now = new Date();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}
```

### Pattern: Update submission in Today.tsx

```typescript
// Status values: "resolved" | "ambiguous" | "no_match"
const res = await fetch("/api/v1/updates/resolve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
});
const data: UpdateResponse = await res.json();

if (data.status === "resolved") {
  setText("");
  setUpdatePhase("success-flash");
  setTimeout(() => setUpdatePhase("idle"), 1500);
  await Promise.all([refresh(), fetchBlocks()]);
} else if (data.status === "ambiguous" || data.status === "no_match") {
  setCandidates(data.candidates);
  setCandidateStatus(data.status);
  setUpdatePhase("candidates");
}
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 13 is pure frontend code changes. No external tools, services, CLIs, runtimes, or databases beyond what is already in use by the project. Vitest is already installed (`frontend/node_modules/.bin/vitest` confirmed present).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `frontend/vite.config.ts` — `test: { environment: "jsdom" }` |
| Quick run command | `cd frontend && npm test -- --run` |
| Full suite command | `cd frontend && npm test -- --run --coverage` |
| Existing test files | `frontend/src/lib/agenda.test.ts`, `frontend/src/lib/organizePlan.test.ts`, `frontend/src/lib/organizeTaskSort.test.ts`, `frontend/src/lib/taskFilters.test.ts` |

No `@testing-library/react` (RTL) is installed. Existing tests cover only pure lib functions (no component rendering). Phase 13 tests should follow the same pattern — test pure lib utilities only, not React components. RTL is a new dependency and is forbidden.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPDATE-01 | `isAfterWorkHours(null)` returns false | unit | `npm test -- --run src/lib/timeUtils.test.ts` | No — Wave 0 |
| UPDATE-01 | `isAfterWorkHours("18:00")` returns true when past 18:00 | unit | `npm test -- --run src/lib/timeUtils.test.ts` | No — Wave 0 |
| UPDATE-01 | `isAfterWorkHours("23:59")` returns false before midnight | unit | `npm test -- --run src/lib/timeUtils.test.ts` | No — Wave 0 |
| UPDATE-04 | Rollup derive function: completed tasks go to "completed" bucket | unit | `npm test -- --run src/lib/rollup.test.ts` | No — Wave 0 |
| UPDATE-04 | Rollup derive function: incomplete today-tasks go to "slipped" | unit | `npm test -- --run src/lib/rollup.test.ts` | No — Wave 0 |
| NOTIF-08 | Check-in time hook parses `{ hour: 12, minute: 0 }` → `"12:00"` | unit (if extracted) | Manual verify or extract to lib | No |

Component rendering tests (CandidateCard state transitions, Today.tsx integration): manual-only due to no RTL. The planner should include manual golden-path test steps in each wave.

### Sampling Rate
- **Per task commit:** `cd frontend && npm test -- --run`
- **Per wave merge:** `cd frontend && npm test -- --run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/lib/timeUtils.ts` — `isAfterWorkHours` implementation
- [ ] `frontend/src/lib/timeUtils.test.ts` — unit tests for `isAfterWorkHours`
- [ ] `frontend/src/lib/rollup.ts` — `deriveRollup(tasks, blocks, todayKey)` pure function (extract from component for testability)
- [ ] `frontend/src/lib/rollup.test.ts` — unit tests for rollup derivation
- [ ] Backend: `check_in_enabled` column decision — either Alembic migration (Wave 0) or document sentinel approach

---

## Open Questions

1. **Confirmed-candidate re-POST mechanism**
   - What we know: `UpdateRequest` schema only accepts `text`. When user confirms a candidate, we need to apply the action against a specific `entity_id`.
   - What's unclear: Does Phase 13 add `confirmed_id: int | None` to `UpdateRequest` and apply logic in the router? Or does re-posting the candidate's title suffice (it will score 100, single match)?
   - Recommendation: Add `confirmed_id: int | None = None` to `UpdateRequest` and a branch in the router to apply directly when `confirmed_id` is set, bypassing fuzzy match. Cleanest, most reliable.

2. **Backend mutation of resolved updates**
   - What we know: `POST /updates/resolve` currently returns status/candidates but writes nothing to the DB. UPDATE-02 says "mark a task/block done, reschedule it, or drop it."
   - What's unclear: Was the mutation accidentally omitted from Phase 12, or was it always intended to be in Phase 13?
   - Recommendation: Phase 13 Wave 0 or Wave 1 must add the mutation: on `"resolved"` with `action="done"` or `"drop"` → set `task.completed = True` in the router; for `"reschedule"` → TBD (no reschedule date in the current schema). The planner must decide the reschedule path.

3. **check_in_enabled persistence**
   - What we know: No `check_in_enabled` column exists in AppSettings or CheckInTimeUpdate schema.
   - What's unclear: Should Phase 13 add a migration, or use null-hour as disabled sentinel?
   - Recommendation: Add Alembic migration with `check_in_enabled: bool, default True` (nullable, same pattern as stall_threshold_days). Update `CheckInTimeRead`, `CheckInTimeUpdate`, GET/PUT router logic, and `schedule_checkin` to skip scheduling when disabled. Migration is continuation of chain from 0011+.

4. **Reschedule action UX**
   - What we know: `action="reschedule"` is a valid resolved action. No reschedule date is provided in the `UpdateRequest`.
   - What's unclear: What does "reschedule" mean without a target date? The current schema has no mechanism.
   - Recommendation: Treat `"reschedule"` as "carry forward to tomorrow" (set `due_date = tomorrow`). Document this as the v2.1 behavior.

---

## Sources

### Primary (HIGH confidence)
- `backend/app/routers/updates.py` — verified endpoint path, handler, line 17
- `backend/app/schemas/update.py` — verified request/response shapes, all field names and types
- `backend/app/services/resolution_service.py` — verified status strings ("resolved"/"ambiguous"/"no_match"), thresholds
- `backend/app/routers/settings.py:80-99` — verified GET/PUT (not PATCH) for check-in-time
- `backend/app/schemas/settings.py:35-43` — verified CheckInTimeRead/Update shape (hour/minute integers)
- `backend/app/models/__init__.py:55-56` — verified check_in_hour/minute columns; confirmed no check_in_enabled
- `backend/app/scheduler.py:103-112` — verified schedule_checkin job id and replace_existing
- `backend/app/services/checkin_service.py` — verified deep-link URL "/today?update=1"
- `backend/app/main.py:46-61` — verified lifespan loads check-in from DB on startup
- `frontend/src/pages/Today.tsx` — verified existing structure, hooks, handleToggle pattern
- `frontend/src/pages/Settings.tsx` — verified CARD_STYLE, SECTION_LABEL_STYLE, section pattern
- `frontend/src/hooks/useWorkHours.ts` — verified workEnd type (string | null, "HH:MM")
- `frontend/src/hooks/useBriefSettings.ts` — verified template pattern for useCheckInSettings
- `frontend/src/hooks/useTasks.ts` — verified refresh() is exported
- `frontend/src/hooks/usePlan.ts` — verified fetchBlocks() is exported, patchBlock() signature
- `frontend/src/lib/agenda.ts` — verified buildWeekAgenda structure, AgendaItem shape
- `frontend/src/types/task.ts` — verified Task.completed field exists, AgendaItem shape
- `frontend/package.json` — verified vitest 4.1.8, no @testing-library/react
- `frontend/vite.config.ts` — verified test.environment = "jsdom"
- `.planning/phases/13-update-loop-ui/13-UI-SPEC.md` — authoritative visual/interaction contract

### Secondary (MEDIUM confidence)
- STATE.md accumulated context [Phase 12-04] — "drop reuses completed=True; Phase 13 rollup must treat completed=True as ambiguous"
- STATE.md accumulated context [v2.1 roadmap] — "Check-in Pushover notification includes deep-link URL /today?update=1"

---

## Metadata

**Confidence breakdown:**
- Backend contract (endpoint paths, request/response shapes): HIGH — verified from source files
- Status string mismatch (resolved vs applied): HIGH — verified from schemas and UI-SPEC
- PUT vs PATCH for check-in endpoint: HIGH — verified from router
- isAfterWorkHours non-existence: HIGH — exhaustive grep across frontend/src returned zero matches
- Backend mutation gap: HIGH — verified resolver returns without any DB write
- check_in_enabled gap: HIGH — verified model columns

**Research date:** 2026-06-23
**Valid until:** Stable — backed by source code inspection, not time-sensitive documentation
