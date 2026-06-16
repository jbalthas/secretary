# Phase 9: Goals + Ingest UI - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The web-UI layer over the Phase 8 backend. This phase delivers:

- **Goals view** — a Goals page (new 4th bottom-nav tab) listing active goals with progress %, and a goal **detail** showing progress + milestones + linked tasks.
- **Manual goal management** — create / edit / archive goals in the UI (drawer + FAB, mirroring Tasks), plus add and toggle milestones from goal detail.
- **Task→goal and routine→goal linking** — a goal dropdown in the task drawer and the routine drawer (GOAL-05).
- **Ingest page** — a `/ingest` route (reached via an "Import" button on the Goals page) to paste JSON or upload a `.json` file, surface the documented LLM prompt + schema, run a **dry-run preview** (per-entity diff), then confirm.
- **Backend additions required by this UI** (small, in-scope): `POST /api/v1/ingest/preview` returning a per-entity diff; `goal_id` exposed on the Routine schema; a documented LLM prompt artifact for the Ingest page to display.

**Explicitly out of scope (later phases):**
- Day auto-organize / scheduling proposals — Phase 10 (PLAN-01, PLAN-02).
- Goal-guided guidance (goal snapshot in brief, next-best-task, stall nudges) — Phase 11 (GUIDE-01/02/03).
- Habit streak tracking / analytics — deferred since Phase 8.

**Phase requirements:** GOAL-04, GOAL-05, INGEST-03, INGEST-05.

</domain>

<decisions>
## Implementation Decisions

### Navigation & page layout (GOAL-04, INGEST-05)
- **D-01:** Goals becomes a **4th bottom-nav tab** (Today / Tasks / **Goals** / Settings). Reuse the existing `BottomNav` NavLink pattern + a lucide icon (e.g. `Target` / `Flag`).
- **D-02:** The **Ingest page lives at its own route** (e.g. `/ingest`), **not** a nav tab, reached via an **"Import" button on the Goals page**. It's an occasional power-user action, kept close to where imported goals land.

### Goal management scope (GOAL-04)
- **D-03:** **Full goal CRUD in the UI** — create / edit / archive goals via a drawer + FAB, mirroring the Tasks page pattern. Goals do **not** have to originate from ingest. Archive = `PATCH /goals/{id}` with `status=archived` (no hard delete). Manual create uses `POST /goals` (requires `title` + `type` enum; `external_key` omitted for manual goals per Phase 8 D-07).
- **D-04:** Goal create/edit form fields: `title` (required), `type` (enum: career|life|health|learning|financial), `description` (optional), `target_date` (optional). Status is managed via archive/complete actions, not a free field.
- **D-05:** **Milestones are add + toggle-done in goal detail.** A done checkbox calls `PATCH /goals/{id}/milestones/{ms_id}` with `done=true`, which fires the existing Phase-8 Pushover+TTS celebration (GOAL-06) — no new notification code. "Add milestone" calls `POST /goals/{id}/milestones`.
- **D-06:** **Goal detail layout:** progress bar/percent at top (from `progress_pct` on `GoalRead`), then the milestones list (with done checkboxes + add), then the **linked tasks list** — each task tappable to open the existing `TaskDrawer`. Linked tasks = tasks whose `goal_id` points at this goal.

### Task / routine → goal linking (GOAL-05)
- **D-07:** **Both tasks and routines** get a goal dropdown. Task drawer is backend-ready (`TaskCreate/Update` already accept `goal_id`). Routine linking requires a **small backend touch**: add `goal_id` to `RoutineCreate` / `RoutineUpdate` / `RoutineRead` and wire it through the routine create/patch handlers (the `Routine.goal_id` column already exists from Phase 8 migration 0008).
- **D-08:** The dropdown lists **active goals only, plus a "No goal" (unlink) option**. Archived/completed goals are hidden to keep the list relevant. The link reflects immediately in the goal detail's linked-tasks list (and recomputes progress on next read).

### Ingest page (INGEST-03, INGEST-05)
- **D-09:** Input supports **both paste (textarea) and `.json` file upload**. Upload reads the file text into the same payload pipeline as paste.
- **D-10:** **Dry-run preview shows a full per-entity list.** Add **`POST /api/v1/ingest/preview`** that returns each goal / task / routine / habit with a **create-vs-update badge** (matched on `external_key`, same `_resolve`/matching logic as confirm — no server-side pending state; client resends the full payload on confirm). The UI renders a grouped, scrollable diff. This honors INGEST-03's "per-entity diff" literally.
- **D-11:** **Confirm** posts the same payload to the existing `POST /ingest/confirm`. The **Confirm button is disabled on submit** to prevent double-commit (success criterion #4); on success the new goals/tasks/routines appear (refresh the relevant hooks).
- **D-12:** The Ingest page **surfaces the documented LLM prompt + schema** with a copy-to-clipboard button, so the loop lives in one place: copy prompt → run in any LLM → paste result back. A **documented LLM prompt artifact must be authored** in this phase (it does not exist yet — Phase 8 deferred its delivery). Schema can come from `GET /ingest/schema`.
- **D-13:** **Validation errors (HTTP 422) render as a readable field-level list** — parse FastAPI's `detail[]` (loc + msg) into entries like `tasks[2].due_date: invalid datetime`. Applies to both preview and confirm responses.

### Claude's Discretion
- Exact `POST /ingest/preview` response shape (e.g. `{goals: [{external_key, title, action: "create"|"update"}], ...}`) — design during planning; must share matching logic with confirm to avoid drift.
- Where the documented LLM prompt is stored/served (static frontend constant vs a `GET /ingest/prompt` endpoint vs a repo doc rendered in the UI) — pick the simplest that fits the SPA + fetch pattern.
- Goal-card visual treatment (progress bar style, type badge) and the goals empty state — follow established page/drawer/CSS conventions.
- Icon choices for the Goals tab and Import button.
- Whether routine→goal dropdown reuses a shared `<GoalSelect>` component with the task drawer (likely yes).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — GOAL-04 (view goals + drill into detail), GOAL-05 (link task to goal; routines taggable), INGEST-03 (dry-run preview: counts + per-entity diff before write), INGEST-05 (paste OR upload `.json`).
- `.planning/ROADMAP.md` §"Phase 9: Goals + Ingest UI" — phase goal + 4 success criteria (the verification target).

### Prior context (locked backend decisions this UI sits on)
- `.planning/phases/08-goals-ingest-backend/08-CONTEXT.md` — Goal `status` enum (active|archived|completed, D-13), `GoalType` enum (D-14), goal fields + milestone shape (D-15), progress formula computed-on-read (D-01/02), `external_key` matching + upsert/preserve-runtime-fields semantics (D-07/08), habit = Task with `is_habit` (D-04/05), celebration reuse (D-10/11).
- `.planning/research/ARCHITECTURE.md` — §"Ingest: Router + Service Split…" and §"Upsert / idempotency semantics": preview-then-commit flow, stateless (client resends payload), `_resolve()` shared between preview and confirm.

### Backend the UI consumes (read before building hooks)
- `backend/app/routers/goals.py` — `GET /goals/` (list with `progress_pct`+milestones), `GET /goals/{id}`, `POST /goals/`, `PATCH /goals/{id}` (status→completed fires celebration), `POST /goals/{id}/milestones`, `PATCH /goals/{id}/milestones/{ms_id}` (done flip fires celebration).
- `backend/app/schemas/goal.py` — `GoalCreate` (title+type required, external_key optional), `GoalUpdate`, `GoalRead` (incl. `progress_pct`, `milestones`), `MilestoneCreate/Update/Read`.
- `backend/app/routers/ingest.py` + `backend/app/schemas/ingest.py` — current `GET /schema`, `POST /confirm`, `IngestResult` (counts only). **Phase 9 adds `POST /preview` + a diff result schema.**
- `backend/app/services/ingest_service.py` — `apply_import` + the four `_upsert_*` helpers; the preview must reuse this matching/resolution logic without writing.
- `backend/app/schemas/task.py` — `TaskCreate/Update/Read` already carry `goal_id` (task linking backend-ready).
- `backend/app/schemas/routine.py` — `RoutineCreate/Update/Read` **lack `goal_id`** — Phase 9 adds it (column exists from migration 0008).
- `backend/app/models/goal.py` — `Goal`, `Milestone`, `GoalType`, `GoalStatus`.

### Frontend patterns to mirror (read before building)
- `frontend/src/App.tsx` — route registration (add `/goals`, `/ingest`).
- `frontend/src/components/BottomNav.tsx` — add the Goals tab (NavLink + icon pattern).
- `frontend/src/pages/Tasks.tsx` + `frontend/src/components/TaskDrawer.tsx` + `frontend/src/components/FAB.tsx` — page/drawer/FAB CRUD pattern to mirror for Goals; TaskDrawer is where the goal dropdown is added.
- `frontend/src/hooks/useTasks.ts` — plain-fetch + `refresh()` hook pattern (no React Query); mirror for `useGoals`/`useIngest`.
- `frontend/src/components/RoutineDrawer.tsx` + `frontend/src/hooks/useRoutines.ts` — where the routine goal dropdown is added.
- `frontend/src/types/task.ts`, `frontend/src/types/routine.ts` — add `goal_id`; create a `types/goal.ts`.
- `frontend/src/styles.css` — `.page`, `.page-title`, `.drawer`, `.backdrop`, `.empty-state`, `.btn-save`, segmented-control, confirm-modal classes to reuse.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Tasks page + TaskDrawer + FAB**: direct template for the Goals page CRUD (list rows, slide-up drawer, FAB create, confirm-delete modal). Goal archive can reuse the confirm-modal pattern.
- **Plain-fetch hooks** (`useTasks`): copy the `refresh()`-on-mutate shape for `useGoals` and an ingest hook. No new data-fetching library.
- **`TaskDrawer`**: the goal dropdown drops into the existing drawer; tapping a linked task in goal detail opens this same drawer.
- **Phase-8 celebrations**: milestone done-toggle and goal `status=completed` already fire Pushover+TTS server-side — the UI just calls the existing PATCH endpoints; no client notification code.

### Established Patterns
- **Bottom-nav tabs** via `NavLink` with `isActive` style callback (BottomNav.tsx) — Goals tab follows this exactly; nav grows 3→4.
- **Drawer + backdrop** (`role="dialog"`, `.drawer.open`), **FAB** for create, **segmented-control** for enum pickers (priority → reuse for goal `type`).
- **API prefix** `/api/v1`; hooks fetch relative paths through the Vite proxy.
- **`exclude_unset=True` PATCH** semantics on the backend — partial updates are safe (goal edit, milestone toggle).

### Integration Points
- New frontend: `pages/Goals.tsx`, `pages/Ingest.tsx`, `components/GoalDrawer.tsx`, a shared `GoalSelect` dropdown, `hooks/useGoals.ts`, `hooks/useIngest.ts`, `types/goal.ts`; routes in `App.tsx`; tab in `BottomNav.tsx`.
- New/changed backend: `POST /api/v1/ingest/preview` + a preview-diff schema in `schemas/ingest.py` + a no-write resolve path in `ingest_service.py`; `goal_id` added to `schemas/routine.py` + routine router handlers; a documented LLM prompt artifact.

</code_context>

<specifics>
## Specific Ideas

- The ingest loop should be self-contained on the Ingest page: **copy prompt → run in your LLM → paste/upload result → preview (per-entity create/update badges) → Confirm (disabled-on-submit)**.
- Preview must be a true dry-run: `POST /ingest/preview` writes nothing; confirm re-sends the full payload (stateless, matches Phase 8 / ARCHITECTURE preview-then-commit).
- Goal dropdown shows **active goals + "No goal"** — keep it from cluttering as archived/completed goals accumulate.
- `external_key` is the create-vs-update discriminator the preview badges are derived from (Phase 8 D-07).

</specifics>

<deferred>
## Deferred Ideas

- **Routine→goal tagging was kept in scope** (D-07) — but if planning finds the routine backend touch too large, it can split to a follow-up. Default: include it.
- **Habit-specific UI** (separate habit management, streaks) — habits remain flagged recurring tasks; no dedicated UI this phase (deferred since Phase 8).
- **Goal auto-complete at 100% progress** — still explicit `status=completed` only (Phase 8 default), so the UI exposes a "complete" action rather than auto-firing.
- **Per-item ingest conflict resolution UI** (resolving title conflicts) — REQUIREMENTS backlog P3, not this phase.

</deferred>

---

*Phase: 09-goals-ingest-ui*
*Context gathered: 2026-06-16*
