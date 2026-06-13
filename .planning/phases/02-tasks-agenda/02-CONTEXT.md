# Phase 2: Tasks & Agenda - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

User can create, edit, complete, and delete tasks from the web UI.
Today's agenda view shows tasks (with due dates) and placeholder calendar events merged and sorted by time.
Real calendar sync is Phase 4 — placeholder events are hardcoded sample data in Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Task List Layout
- **D-01:** Compact rows (one row per task) — not cards, not grouped headers
- **D-02:** Each row shows: title, priority badge, due date, completion checkbox, description preview, reminder indicator, recurrence indicator
- **D-03:** Filter by status via Pending / Completed tabs at top; sort by due date or priority via dropdown

### Task Form
- **D-04:** Slide-in drawer from the right — task list stays visible behind it
- **D-05:** Drawer shows title + priority + due date up front; description, reminder, recurrence are collapsible/expandable
- **D-06:** Task creation triggered by a floating action button (FAB) fixed at bottom-right

### Agenda View
- **D-07:** Chronological merged list — tasks and events in a single timeline sorted by time
- **D-08:** All-day tasks appear at the top of the agenda list
- **D-09:** Each agenda item shows: title + priority + time (if set) — same compact style as task list
- **D-10:** Phase 2 calendar events are hardcoded sample data (e.g. "Team standup 9am") to make the agenda testable immediately; real sync wired in Phase 4

### Navigation
- **D-11:** Bottom nav bar with two tabs: "Today" (agenda) and "Tasks" (task list)
- **D-12:** Default view on app open is Today's agenda

### Claude's Discretion
- Color / styling choices for priority badges (high=red, medium=yellow, low=grey is a reasonable default)
- Empty state illustrations / copy for task list and agenda
- Exact drawer animation style (slide vs fade)
- Recurring task UI (cron expression input vs friendly picker — pick what's simpler to implement)
- Mobile responsiveness implementation details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — Full requirement list; TASK-01–07 and CAL-05 are Phase 2 scope

### Infrastructure (Phase 1 outputs)
- `backend/app/main.py` — Existing FastAPI app instance; all new routers mount here
- `backend/app/db.py` — Async SQLAlchemy session setup; use the same session factory
- `backend/app/config.py` — Settings object with `api_prefix`; all new endpoints use this prefix
- `backend/app/models/__init__.py` — Models package; add Task model here
- `frontend/src/App.tsx` — Root component; add routing and nav here
- `frontend/src/main.tsx` — Vite entry point

### Tech Stack Reference
- `.planning/CLAUDE.md` — Stack decisions: FastAPI 0.128.x, SQLAlchemy 2.0 async, Alembic, APScheduler 3.x, React 19, Vite 8

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/db.py` — async session factory; all new endpoints use `AsyncSession` from here
- `backend/app/config.py` — `settings.api_prefix` (`/api/v1`); all new routes use this
- `backend/app/main.py` — bare FastAPI app; new routers added via `app.include_router()`

### Established Patterns
- Async-first: SQLAlchemy async engine + `AsyncSession`, all endpoints `async def`
- WAL mode already set at DB startup — no changes needed
- Alembic wired up — all schema changes go through migrations, no manual DDL

### Integration Points
- Frontend `App.tsx` is a blank slate — add React Router, bottom nav, and page components here
- Backend `main.py` is the mount point for new API routers
- `backend/app/models/` is the home for the Task SQLAlchemy model

</code_context>

<specifics>
## Specific Ideas

- Placeholder calendar events: "Team standup 9am", "Lunch 12pm" — enough to show a real-looking merged agenda
- Bottom nav matches a mobile-native feel since the app is phone-accessible via Tailscale

</specifics>

<deferred>
## Deferred Ideas

- Search / full-text task search — new capability, belongs in a later phase
- Drag-to-reorder tasks — out of scope for v1
- Task attachments / files — out of scope

</deferred>

---

*Phase: 02-tasks-agenda*
*Context gathered: 2026-06-12*
