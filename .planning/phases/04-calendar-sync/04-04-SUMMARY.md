---
phase: 04-calendar-sync
plan: 04
subsystem: frontend
tags: [calendar, agenda, settings, navigation, hooks]
dependency_graph:
  requires: [04-02, 04-03]
  provides: [calendar-event-agenda-display, settings-nav-tab, useCalendarEvents-hook]
  affects: [frontend/src/pages/Today.tsx, frontend/src/components/BottomNav.tsx, frontend/src/lib/agenda.ts]
tech_stack:
  added: [useCalendarEvents hook]
  patterns: [fetch-then-setState hook, conditional CSS class for event variant]
key_files:
  created:
    - frontend/src/hooks/useCalendarEvents.ts
  modified:
    - frontend/src/types/task.ts
    - frontend/src/lib/agenda.ts
    - frontend/src/lib/agenda.test.ts
    - frontend/src/components/BottomNav.tsx
    - frontend/src/components/AgendaItem.tsx
    - frontend/src/pages/Today.tsx
    - frontend/src/styles.css
decisions:
  - Settings.tsx left untouched (inline-style pattern from phases 5/6 preserved; no .settings-card CSS added)
  - App.tsx /settings route already existed; no change needed
  - AgendaItem.tsx className conditional used to apply .agenda-item--event without breaking inline rowStyle
  - agenda.test.ts updated to new 3-arg signature; added 4 new event-specific tests
metrics:
  duration_minutes: 20
  completed_date: "2026-06-15"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 8
---

# Phase 04 Plan 04: Calendar Sync UI Summary

One-liner: Real Google Calendar events now flow into the Today agenda via useCalendarEvents hook, with a Settings tab added to bottom nav and events visually distinguished by indigo left border.

## What Was Built

### Task 1 — CalendarEvent type + useCalendarEvents hook + agenda.ts swap
- Added `CalendarEvent` interface to `frontend/src/types/task.ts` matching `CalendarEventOut` backend schema.
- Created `frontend/src/hooks/useCalendarEvents.ts`: fetches `GET /api/v1/events/today` on mount, error-safe (sets `events=[]` on any failure — agenda renders tasks regardless).
- Rewrote `frontend/src/lib/agenda.ts`: `buildAgenda(tasks, events, now)` replaces the 2-arg version. `PLACEHOLDER_EVENTS` export deleted entirely. Events are filtered to today (all-day: `start_date === today`; timed: `start_dt.slice(0,10) === today`), mapped to `AgendaItem` with `isEvent:true`, and merged with tasks (all-day first, then timed sorted by time).

**Commit:** `6120e59`

### Task 2 — Settings nav tab + Today wiring + event CSS
- `BottomNav.tsx`: added third `NavLink to="/settings"` with lucide `Settings` (gear, size 22) icon, identical active/inactive color logic to existing tabs.
- `Today.tsx`: imports `useCalendarEvents`, calls it, passes `events` into `buildAgenda(tasks, events)`.
- `AgendaItem.tsx`: applies `className="agenda-item--event"` conditionally when `item.isEvent` is true.
- `styles.css`: appended `.agenda-item--event { border-left: 3px solid #818cf8; padding-left: 8px; }`.
- `agenda.test.ts`: updated all existing tests to new 3-arg signature; added 4 new tests covering event mapping, all-day events, empty title fallback, and sort order.

**Commit:** `7f982c2`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated agenda.test.ts to match new buildAgenda signature**
- **Found during:** Task 2 build verification
- **Issue:** Existing test file imported `PLACEHOLDER_EVENTS` (now deleted) and called `buildAgenda(tasks, now)` (2-arg, now 3-arg). Build failed with 8 TypeScript errors.
- **Fix:** Rewrote test file to use `buildAgenda(tasks, events, now)`, removed PLACEHOLDER_EVENTS import/reference, added `makeEvent` factory, expanded test coverage with 4 new event-specific tests.
- **Files modified:** `frontend/src/lib/agenda.test.ts`
- **Commit:** `7f982c2` (included in Task 2 commit)

### Scope Adjustments (from critical-state brief)

**Settings.tsx not recreated** — The file already existed from phases 5 & 6 with Google Calendar, Daily Brief, Routines, and Google Home sections using inline styles. The plan's `.settings-card`/`.connection-status-row`/`.status-dot` CSS classes were NOT added since they would conflict with the existing inline-style approach. The existing Google Calendar section functions correctly.

**App.tsx route skipped** — `/settings` route already existed.

## Known Stubs

None — real event data flows from `GET /api/v1/events/today` into the agenda. No placeholder data remains.

## Self-Check: PASSED

Files confirmed:
- `frontend/src/hooks/useCalendarEvents.ts` — FOUND
- `frontend/src/types/task.ts` contains `CalendarEvent` — FOUND
- `frontend/src/lib/agenda.ts` does not contain `PLACEHOLDER_EVENTS` — CONFIRMED (grep returns 0 matches)
- `frontend/src/components/BottomNav.tsx` contains `/settings` — FOUND
- `frontend/src/styles.css` contains `.agenda-item--event` — FOUND

Commits confirmed:
- `6120e59` — FOUND
- `7f982c2` — FOUND

Build: tsc exits 0, `npm run build` exits 0.

## Status

STOPPED at Task 3 (checkpoint:human-verify). Awaiting OAuth round-trip verification.
