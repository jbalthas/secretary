---
phase: 17-task-subtask-hierarchy-drag-drop
plan: 05
subsystem: ui
tags: [react, dnd-kit, drag-drop, tasks-page, task-hierarchy, subtask-select]

requires:
  - phase: 17-task-subtask-hierarchy-drag-drop (plan 01)
    provides: backend parent_task_id API + one-level nesting validation
  - phase: 17-task-subtask-hierarchy-drag-drop (plan 02)
    provides: taskHierarchy.ts / dragIntent.ts pure-logic libraries, @dnd-kit install
  - phase: 17-task-subtask-hierarchy-drag-drop (plan 03)
    provides: Tasks page nested-card CSS classes
provides:
  - "Tasks page card grid drag-to-nest/un-nest via @dnd-kit"
  - "SubtaskSelect component: excludes the task itself and any task that already has a parent"
  - "TaskDrawer 'Subtask of' dropdown wired to parent_task_id, including on edit of an already-nested task"
affects: [17-04]

tech-stack:
  added: []
  patterns:
    - "DndContext wired at Tasks.tsx grid level; onDragEnd nests on drop-over-card, un-nests on drop-in-open-space, surfaces 422s via inline .tasks-card-error"
    - "groupTasksByParent computed once in Tasks.tsx; heroTask and the card grid both derive from the same parents/childrenByParentId result to avoid double-rendering a nested child"

key-files:
  created:
    - frontend/src/components/SubtaskSelect.tsx
  modified:
    - frontend/src/pages/Tasks.tsx
    - frontend/src/components/TaskCard.tsx
    - frontend/src/components/TaskDrawer.tsx
    - frontend/src/pages/Goals.tsx

key-decisions:
  - "SubtaskSelect mirrors GoalSelect's existing pattern exactly for consistency, filtering to exclude the task itself and any task with a non-null parent_task_id"
  - "TaskDrawer's tasks prop made required (previously optional/absent on some call sites); Goals.tsx's render site updated to pass tasks={tasks} since it already had the data via useTasks()"

patterns-established:
  - "Grouped nested rendering: parent cards render children inline via .tasks-card-children, computed once via groupTasksByParent to guarantee no card renders twice"

requirements-completed: [HIER-02, HIER-03, HIER-04]

duration: 26min
completed: 2026-07-07
---

# Phase 17 Plan 05: Tasks Page Drag-Drop + Subtask Dropdown Summary

**Tasks page card grid gained drag-to-nest/un-nest via @dnd-kit plus a manual "Subtask of" dropdown (SubtaskSelect) in the task edit drawer — the two remaining nesting surfaces alongside the Today timeline delivered in Plan 17-04.**

## Performance

- **Duration:** ~26 min
- **Tasks:** 3/3 completed (including human-verify checkpoint)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `TaskCard.tsx` renders a grip drag handle (aria-label `Drag to reorder or nest "{title}"`), a `{done}/{total}` progress badge, and recursively renders nested children in `.tasks-card-children`
- `Tasks.tsx` wraps the card grid in a `DndContext`; nests on drop-over-card, un-nests on drop-in-open-space, surfaces backend validation errors (422) inline via `.tasks-card-error`
- New `SubtaskSelect.tsx` component excludes the task itself and any task that already has a parent, mirroring the existing `GoalSelect.tsx` pattern
- `TaskDrawer.tsx` wired to a "Subtask of" field, correctly pre-selecting the task's current parent when editing an already-nested task
- Human verified end-to-end: created two tasks, nested one via the drawer dropdown (parent showed `0/1` badge, child rendered in `.tasks-card-children`), then un-nested via the same dropdown — both tasks returned to standalone. User separately confirmed the drag gesture itself on a live device over Tailscale.

## Task Commits

1. **Task 1: Tasks.tsx / TaskCard.tsx — grouped nested rendering + drag-to-nest/un-nest** - `43b8576` (feat)
2. **Task 2: SubtaskSelect component + TaskDrawer parent_task_id wiring** - `29ae203` (feat)
3. **Task 3: Human-verify checkpoint** - approved by user against live dev server (Tasks page nesting drag + Subtask-of dropdown)

## Files Created/Modified
- `frontend/src/components/SubtaskSelect.tsx` - new dropdown excluding self and already-parented tasks
- `frontend/src/pages/Tasks.tsx` - `DndContext` wiring, `groupTasksByParent` grouping, drag-error state
- `frontend/src/components/TaskCard.tsx` - drag handle, progress badge, recursive nested-children rendering
- `frontend/src/components/TaskDrawer.tsx` - "Subtask of" field wired to `parentTaskId` state and save payload
- `frontend/src/pages/Goals.tsx` - one-line fix passing `tasks={tasks}` to `TaskDrawer` (see deviation)

## Decisions Made
- `TaskDrawer`'s `tasks` prop widened from optional to required so `SubtaskSelect` always has data to filter against; `Goals.tsx`'s existing `TaskDrawer` render site updated accordingly since it already calls `useTasks()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TaskDrawer's tasks prop made required, breaking Goals.tsx call site**
- **Found during:** Task 2 (`npx tsc -b --noEmit`)
- **Issue:** Widening `TaskDrawer`'s `tasks` prop from optional to required (needed by `SubtaskSelect`) broke `Goals.tsx`, which renders `TaskDrawer` without passing `tasks`
- **Fix:** Added `tasks={tasks}` to the `Goals.tsx` call site, using its existing `useTasks()` data
- **Files modified:** `frontend/src/pages/Goals.tsx`
- **Verification:** `npx tsc -b --noEmit` exits 0
- **Committed in:** `29ae203` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** One-line prop-pass fix to keep the build green; no scope creep.

## Issues Encountered
- Same dev-environment gap as Plan 17-04: local dev DB needed `alembic upgrade head` before the orchestrator could verify either plan's UI (unrelated to this plan's code, fixed once for both).
- Two pre-existing `agenda.test.ts` timezone-dependent failures (logged in `deferred-items.md`, unrelated to this plan's files) remain unresolved.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Tasks page nesting UI and the manual "Subtask of" dropdown are fully wired and human-verified
- Phase 17 requirements HIER-02, HIER-03, HIER-04 confirmed working end-to-end; combined with Plan 17-04 and Wave 1, all of HIER-01 through HIER-05 are now covered across both UI surfaces

---
*Phase: 17-task-subtask-hierarchy-drag-drop*
*Completed: 2026-07-07*
