---
phase: 17-task-subtask-hierarchy-drag-drop
plan: 02
subsystem: ui
tags: [react, typescript, dnd-kit, vitest, task-hierarchy, drag-drop]

# Dependency graph
requires: []
provides:
  - "@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities installed (D-12 exception)"
  - "Task/TaskCreate/AgendaItem/ScheduledBlock types carry parent_task_id / parentTaskId"
  - "agenda.ts populates AgendaItem.parentTaskId for tasks and blocks (never events)"
  - "lib/taskHierarchy.ts: groupTasksByParent, subtaskProgress, groupAgendaItemsByParent, moveInOrder, applyManualOrder"
  - "lib/dragIntent.ts: resolveDropIntent pure pointer-position classifier"
affects: [17-04-today-timeline-drag-drop, 17-05-tasks-page-drag-drop]

# Tech tracking
tech-stack:
  added: ["@dnd-kit/core@^6.3.1", "@dnd-kit/sortable@^10.0.0", "@dnd-kit/utilities@^3.2.2"]
  patterns:
    - "Pure grouping/classifier functions in lib/*.ts, tested independently of UI components (mirrors taskFilters.ts convention)"
    - "In-memory/session-level manual reorder (moveInOrder + applyManualOrder) instead of a persisted order column — D-03's reorder gesture without new backend state"

key-files:
  created:
    - frontend/src/lib/taskHierarchy.ts
    - frontend/src/lib/taskHierarchy.test.ts
    - frontend/src/lib/dragIntent.ts
    - frontend/src/lib/dragIntent.test.ts
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/types/task.ts
    - frontend/src/types/plan.ts
    - frontend/src/lib/agenda.ts
    - frontend/src/lib/agenda.test.ts
    - frontend/src/lib/rollup.test.ts

key-decisions:
  - "parent_task_id on ScheduledBlock added as non-optional (matching task_id's existing style), requiring parent_task_id: null additions to pre-existing agenda.test.ts/rollup.test.ts makeBlock() fixtures"
  - "moveInOrder/applyManualOrder implement D-03's locked reorder gesture as an in-memory/session-level manual order (not persisted to backend) — persistence mechanism was the only discretionary part per CONTEXT.md"

patterns-established:
  - "Pure hierarchy/classifier libs (taskHierarchy.ts, dragIntent.ts) built and unit-tested ahead of UI wiring, so Wave 2 plans consume an already-locked contract"

requirements-completed: [HIER-01, HIER-02, HIER-03]

# Metrics
duration: 12min
completed: 2026-07-07
---

# Phase 17 Plan 02: Task/Subtask Hierarchy Types + Pure Logic Libraries Summary

**Installed @dnd-kit, extended Task/AgendaItem/ScheduledBlock types with parent_task_id, and shipped two pure/tested libraries (taskHierarchy.ts, dragIntent.ts) implementing grouping, subtask progress, manual reorder, and nest/before/after drop classification — the full contract Wave 2's Today timeline and Tasks page UI plans will consume.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-07T20:21:00Z (approx)
- **Completed:** 2026-07-07T20:33:20Z
- **Tasks:** 3/3 completed
- **Files modified:** 12 (5 modified pre-existing + 4 created + 3 pre-existing test-fixture fixes, some overlap)

## Accomplishments
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` installed per D-12 exception
- `Task`, `TaskCreate`, `AgendaItem`, `ScheduledBlock` types all carry parent-tracking fields; `agenda.ts` wires `AgendaItem.parentTaskId` for both tasks and blocks (never calendar events, per D-04)
- `lib/taskHierarchy.ts` — `groupTasksByParent`, `subtaskProgress`, `groupAgendaItemsByParent`, `moveInOrder`, `applyManualOrder`, all pure and unit-tested (13 tests)
- `lib/dragIntent.ts` — `resolveDropIntent` pointer-position classifier (nest/before/after), pure and framework-agnostic (5 tests)

## Task Commits

1. **Task 1: Install @dnd-kit + extend types + wire AgendaItem.parentTaskId** - `296b734` (feat)
2. **Task 2: lib/taskHierarchy.ts — grouping, progress-count, manual-reorder pure functions** - `87bddff` (feat)
3. **Task 3: lib/dragIntent.ts — nest/before/after pointer-position classifier** - `c3b023a` (feat)

_Note: tdd="true" tasks 2/3 were delivered as single feat commits (plan's `<action>` bundled implementation + tests in one block rather than separate RED/GREEN steps); all specified behaviors verified passing before commit._

## Files Created/Modified
- `frontend/src/lib/taskHierarchy.ts` - groupTasksByParent, subtaskProgress, groupAgendaItemsByParent, moveInOrder, applyManualOrder
- `frontend/src/lib/taskHierarchy.test.ts` - 13 unit tests covering all 12 spec'd behaviors
- `frontend/src/lib/dragIntent.ts` - resolveDropIntent pure pointer classifier
- `frontend/src/lib/dragIntent.test.ts` - 5 boundary-case unit tests
- `frontend/src/types/task.ts` - parent_task_id on Task/TaskCreate, parentTaskId on AgendaItem
- `frontend/src/types/plan.ts` - parent_task_id on ScheduledBlock (non-optional)
- `frontend/src/lib/agenda.ts` - parentTaskId populated in task-item and block-item construction
- `frontend/package.json` / `package-lock.json` - @dnd-kit/* dependencies
- `frontend/src/lib/agenda.test.ts`, `frontend/src/lib/rollup.test.ts` - fixture fix for new required ScheduledBlock.parent_task_id field

## Decisions Made
- `ScheduledBlock.parent_task_id` made non-optional (`number | null`, not `?:`) to match the existing `task_id` style, since backend `ScheduledBlockRead` always includes the field — this required adding `parent_task_id: null` to the two pre-existing `makeBlock()` test fixtures that construct full `ScheduledBlock` objects.
- `moveInOrder`/`applyManualOrder` implement D-03's reorder gesture as an in-memory/session-level manual order (not persisted to the backend) — this was the persistence-mechanism discretion explicitly left to Claude by CONTEXT.md; the reorder gesture itself is not optional and is fully implemented here for Wave 2 to wire up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing test fixtures broken by new required ScheduledBlock field**
- **Found during:** Task 1 verification (`npx tsc -b --noEmit`)
- **Issue:** Adding non-optional `parent_task_id: number | null` to `ScheduledBlock` broke two pre-existing test files (`agenda.test.ts`, `rollup.test.ts`) whose `makeBlock()` fixture helpers construct full `ScheduledBlock` object literals without the new field, causing a TS2322 type error.
- **Fix:** Added `parent_task_id: null,` to both `makeBlock()` fixture defaults.
- **Files modified:** `frontend/src/lib/agenda.test.ts`, `frontend/src/lib/rollup.test.ts`
- **Verification:** `npx tsc -b --noEmit` exits 0
- **Committed in:** `296b734` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the build green after the type contract change; no scope creep — only added the missing field to existing fixtures.

## Issues Encountered
- Two pre-existing `agenda.test.ts` failures (`buildAgenda` timed-task-ordering test, calendar-event-time test) are timezone-dependent: `agenda.ts`'s `buildDayItems()` uses local `Date.getHours()`/`getMinutes()` on UTC-fixed ISO test fixtures, and this execution environment's system timezone is `America/Chicago` (not UTC), so local hour ≠ UTC hour baked into test expectations. Confirmed pre-existing (reproduced identically against commit `ce93d2a`, the commit immediately prior to this plan's changes) and unrelated to `parent_task_id`/`parentTaskId` work. Logged to `.planning/phases/17-task-subtask-hierarchy-drag-drop/deferred-items.md`, not fixed (out of scope for this plan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wave 2 plans (17-04 Today timeline, 17-05 Tasks page) can now import `groupTasksByParent`, `subtaskProgress`, `groupAgendaItemsByParent`, `moveInOrder`, `applyManualOrder` from `lib/taskHierarchy.ts` and `resolveDropIntent`/`DropIntent` from `lib/dragIntent.ts` — the full grouping/reorder/classification contract is locked, tested, and ready to wire into `@dnd-kit` drag handlers.
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` are installed and available for Wave 2's actual drag-and-drop UI implementation.
- Pre-existing `agenda.test.ts` timezone-dependent failures (2 tests) remain unresolved — flagged in deferred-items.md, not blocking for this plan's scope but worth a dedicated fix before relying on time-of-day agenda assertions in future plans.

---
*Phase: 17-task-subtask-hierarchy-drag-drop*
*Completed: 2026-07-07*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commits (296b734, 87bddff, c3b023a) verified present in git log.
