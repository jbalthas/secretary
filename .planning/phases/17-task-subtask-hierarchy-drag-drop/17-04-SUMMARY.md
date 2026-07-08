---
phase: 17-task-subtask-hierarchy-drag-drop
plan: 04
subsystem: ui
tags: [react, dnd-kit, drag-drop, today-timeline, task-hierarchy]

requires:
  - phase: 17-task-subtask-hierarchy-drag-drop (plan 01)
    provides: backend parent_task_id API + one-level nesting validation
  - phase: 17-task-subtask-hierarchy-drag-drop (plan 02)
    provides: taskHierarchy.ts / dragIntent.ts pure-logic libraries, @dnd-kit install
  - phase: 17-task-subtask-hierarchy-drag-drop (plan 03)
    provides: Today timeline nesting/drag CSS classes
provides:
  - "Today timeline drag-and-drop task/subtask nesting via @dnd-kit DndContext"
  - "usePlan.patchBlockParent for ScheduledBlock parent_task_id PATCH"
  - "AgendaItem drag handle, subtask progress badge, indented children, collapse toggle, inline nest-error state"
affects: [17-05]

tech-stack:
  added: []
  patterns:
    - "DndContext wired at TodayTimeline level; onDragEnd classifies via dragIntent.resolveDropIntent (nest/before/after) and dispatches PATCH via onSetParent/patchBlockParent"
    - "Manual reorder (D-03) implemented as in-memory/session-level only, consistent with 17-02's moveInOrder/applyManualOrder contract"

key-files:
  created: []
  modified:
    - frontend/src/hooks/usePlan.ts
    - frontend/src/components/TodayTimeline.tsx
    - frontend/src/components/AgendaItem.tsx
    - frontend/src/pages/Today.tsx
    - frontend/src/lib/taskHierarchy.ts

key-decisions:
  - "Calendar events excluded from drag entirely at the AgendaItem level (no drag handle rendered, never a valid nest target) per D-04"
  - "Nested children render expanded by default with a manual collapse toggle, matching 17-UI-SPEC.md"
  - "Rejected nests (422 from backend validation) surface as inline error text on the row rather than a toast/alert"

patterns-established:
  - "Human-verify checkpoint gates the final task in drag-drop UI plans — automated tasks (wiring, styling) complete first, then pause for manual gesture verification"

requirements-completed: [HIER-01, HIER-03, HIER-05]

duration: 24min
completed: 2026-07-07
---

# Phase 17 Plan 04: Today Timeline Drag-Drop Summary

**Drag-and-drop task/subtask nesting wired into the "Your day" Today timeline via @dnd-kit — nest by dropping onto a row, un-nest by dropping into empty space, reorder by dropping in the gap between rows, with a live subtask progress badge and calendar events fully excluded from drag.**

## Performance

- **Duration:** ~24 min
- **Tasks:** 3/3 completed (including human-verify checkpoint)
- **Files modified:** 5

## Accomplishments
- `usePlan.ts` gained `patchBlockParent` for ScheduledBlock `parent_task_id` PATCH
- `TodayTimeline.tsx` wraps the day's agenda items in a `DndContext`; `onDragEnd` uses `resolveDropIntent` to classify nest vs. before/after reorder and dispatches the appropriate PATCH
- `AgendaItem.tsx` renders a drag handle (never for calendar events), a neutral subtask progress badge, indented expanded-by-default children with a manual collapse toggle, and inline error text on a rejected nest
- Human verified on a live device (Tailscale-reachable dev server) via the browser: drag-nest, drag-to-unnest, and drop-in-gap reorder all confirmed working

## Task Commits

1. **Task 1: usePlan.patchBlockParent + TodayTimeline DndContext wiring** - `6e684b3` (feat)
2. **Task 2: AgendaItem drag handle, indent, progress badge, collapse, error state** - `1e5da7b` (feat)
3. **Task 3: Human-verify checkpoint** - approved by user against live dev server (Today timeline nest/un-nest/reorder gestures)

## Files Created/Modified
- `frontend/src/hooks/usePlan.ts` - `patchBlockParent` PATCH helper for ScheduledBlock parent nesting
- `frontend/src/components/TodayTimeline.tsx` - `DndContext` wiring, drop-intent classification, nest/un-nest/reorder dispatch
- `frontend/src/components/AgendaItem.tsx` - drag handle, subtask progress badge, indented children, collapse toggle, error state
- `frontend/src/pages/Today.tsx` - plumbs handlers through to the timeline
- `frontend/src/lib/taskHierarchy.ts` - minor fix surfaced during this plan's verification (deviation, see below)

## Decisions Made
- Calendar events never render a drag handle and are never a valid drop target, enforced at the `AgendaItem` render level (not just in the drop-intent classifier), so there's no path for an event to be dragged even if pointer sensors fire
- The D-03 reorder gesture (drop in the gap between two rows) is implemented as in-memory/session-level only — resets to date/priority default order on reload, which is a documented locked scope decision, not a bug

## Deviations from Plan

None beyond a small fix to `taskHierarchy.ts` surfaced during integration with the Today timeline (see Issues Encountered) — no architectural changes.

## Issues Encountered
- Dev environment gap discovered during orchestrator-led verification (not caused by this plan): the local dev SQLite database had never had Alembic migrations applied, causing every API call to 500 with `no such table: tasks`. Orchestrator ran `alembic upgrade head` to fix — unrelated to this plan's code.
- Two pre-existing `agenda.test.ts` timezone-dependent failures (logged in `deferred-items.md` by Plan 17-02) remain, reproduced identically before and after this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Today timeline nesting UI is fully wired and human-verified against a live device over Tailscale
- Phase 17 requirements HIER-01, HIER-03, HIER-05 confirmed working end-to-end on this surface (also covered by Plan 17-05 on the Tasks page)

---
*Phase: 17-task-subtask-hierarchy-drag-drop*
*Completed: 2026-07-07*
