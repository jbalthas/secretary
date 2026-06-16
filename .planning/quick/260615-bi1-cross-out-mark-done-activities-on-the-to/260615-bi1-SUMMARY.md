---
phase: quick-260615-bi1
plan: 01
subsystem: calendar-events, agenda, today-tab
tags: [done-flag, optimistic-ui, tdd, migration]
dependency_graph:
  requires: []
  provides: [done-column-calendar-events, patch-events-endpoint, agenda-completion-state, agenda-item-checkbox]
  affects: [Today tab, AgendaItem, useCalendarEvents, buildAgenda]
tech_stack:
  added: []
  patterns: [optimistic-toggle, TDD-red-green, alembic-migration]
key_files:
  created:
    - backend/migrations/versions/0005_add_done_to_calendar_events.py
  modified:
    - backend/app/models/calendar.py
    - backend/app/schemas/event.py
    - backend/app/routers/events.py
    - frontend/src/types/task.ts
    - frontend/src/lib/agenda.ts
    - frontend/src/lib/agenda.test.ts
    - frontend/src/components/AgendaItem.tsx
    - frontend/src/hooks/useCalendarEvents.ts
    - frontend/src/pages/Today.tsx
decisions:
  - sync.py _parse_event intentionally omits done so Google calendar sync never resets the user flag
  - done defaults server_default="0" in migration so existing rows get False without data migration
metrics:
  duration: ~15 minutes
  completed_date: "2026-06-15"
  tasks_completed: 2
  files_modified: 9
---

# Quick Task 260615-bi1: Cross Out / Mark Done Activities on the Today Tab

One-liner: `done` boolean on `calendar_events` + PATCH endpoint + optimistic checkbox in AgendaItem, wired to both task and event toggle paths in Today.

## What Was Built

**Backend (Task 1):**
- Added `done: Mapped[bool]` column to `CalendarEvent` model (default False)
- Added `done: bool` field to `CalendarEventOut` schema
- Added `PATCH /api/v1/events/{google_id}` endpoint accepting `{"done": bool}`, returns updated event, 404 if missing
- Created migration `0005_add_done_to_calendar_events.py` with `server_default="0"` so existing rows default to False
- `sync.py` untouched — `_parse_event` continues to omit `done`, preserving user flags across Google syncs

**Frontend (Task 2, TDD):**
- Extended `AgendaItem` type with `completed`, `taskId?`, `googleId?` fields
- Added `done` to `CalendarEvent` type
- `buildAgenda` now includes completed tasks (no longer filtered), sets `completed`/`taskId`/`googleId` on all items
- `AgendaItem` renders a leading checkbox with optimistic toggle: local state flips immediately, reverts + shows error on catch; title gets `line-through` and row gets `opacity: 0.5` when completed
- `useCalendarEvents` exposes `patchEvent(google_id, done)` that PATCHes then refreshes
- `Today` pulls `patchTask` + `patchEvent` and wires `handleToggle` to all `AgendaItem` instances

## Verification Results

| Check | Result |
|-------|--------|
| `uv run python -c "...assert 'done' in CalendarEvent.__table__.columns..."` | PASS |
| `uv run alembic upgrade head` | PASS — 0005 applied cleanly on top of 0004 |
| `uv run pytest -q` | 53 passed, 1 pre-existing failure (test_callback_stores_credentials — unrelated auth route, failing before this task) |
| `npx vitest run src/lib/agenda.test.ts` | PASS — 14/14 |
| `npx tsc -b --noEmit` | PASS — clean |

## Commits

| Hash | Description |
|------|-------------|
| de2cc4b | feat(quick-260615-bi1-01): add done flag to calendar events |
| 1e05ca9 | feat(quick-260615-bi1-01): wire completion toggle through agenda to Today tab |

## Deviations from Plan

None — plan executed exactly as written. Pre-existing test failure (`test_callback_stores_credentials`) confirmed present before changes via `git stash` validation.

## Known Stubs

None — all data flows are wired end-to-end.

## Self-Check: PASSED

- `backend/migrations/versions/0005_add_done_to_calendar_events.py` — exists
- `backend/app/models/calendar.py` — `done` column present
- `backend/app/schemas/event.py` — `done` field present
- `backend/app/routers/events.py` — `@router.patch` present
- `frontend/src/types/task.ts` — `completed`, `taskId`, `googleId` on AgendaItem; `done` on CalendarEvent
- `frontend/src/lib/agenda.ts` — includes completed tasks, sets completion fields
- `frontend/src/components/AgendaItem.tsx` — `onToggle` prop, optimistic checkbox
- `frontend/src/hooks/useCalendarEvents.ts` — `patchEvent` exported
- `frontend/src/pages/Today.tsx` — `handleToggle` wired to all AgendaItem instances
- Commits de2cc4b and 1e05ca9 verified in git log
