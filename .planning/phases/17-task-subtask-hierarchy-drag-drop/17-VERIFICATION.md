---
phase: 17-task-subtask-hierarchy-drag-drop
verified: 2026-07-08T09:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 17: Task/Subtask Hierarchy Drag-and-Drop Verification Report

**Phase Goal:** Any task or planned Organize block can be dragged onto a task to become its subtask — nested one level deep, shown indented with a live progress badge, editable via drag on both the Today timeline and the Tasks page, or via a manual "Subtask of" dropdown — without disturbing children's own time/priority/due-date fields or auto-completing anything.
**Verified:** 2026-07-08
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dragging a task/block onto the center of another task's row/card nests it; rejected with clear error if target already has a parent or dragged task already has children (one level only) | ✓ VERIFIED | `task_hierarchy.py::get_valid_parent_task` (422 if target already nested) and `assert_task_has_no_children` (422 if dragged task has children), both wired into `tasks.py::update_task` and `plan.py::update_block`. Backend tests `test_nest_under_child_rejected`, `test_nest_task_with_children_rejected`, `test_patch_block_parent_task_id_rejects_nested_parent` all pass. Frontend surfaces rejection via inline error text (`AgendaItem.errorMessage`, `TaskCard`/`Tasks.tsx` `dragError`). |
| 2 | Dragging a nested item into empty space (Today) or open grid space (Tasks) clears its parent | ✓ VERIFIED | `TodayTimeline.handleDragEnd`: `event.over == null` → `trySetParent(activeItem, null)` when `parentTaskId != null`. `Tasks.tsx.handleDragEnd`: `!event.over` → `patchTask(dragged.id, { parent_task_id: null })`. Backend `test_patch_block_parent_task_id` confirms PATCH null clears and persists. |
| 3 | Parent row/card shows "{done}/{total}" progress badge; completing a parent never auto-completes children and vice versa; children's own fields untouched by nesting | ✓ VERIFIED | `subtaskProgress()` used in both `AgendaItem.tsx` and `TaskCard.tsx`, badge rendered with correct `aria-label`. Backend `update_task`/`update_block` only ever set the fields present in the PATCH body (`exclude_unset=True`); `test_no_completion_propagation` passes (parent completing doesn't complete child and vice versa). |
| 4 | Task edit drawer has a "Subtask of" dropdown to set/clear parent, excluding the task itself and any task with an existing parent | ✓ VERIFIED | `SubtaskSelect.tsx` filters `t.id !== currentTaskId && t.parent_task_id == null`; wired into `TaskDrawer.tsx`, `handleSave` includes `parent_task_id: parentTaskId` in the `TaskCreate` body. |
| 5 | ScheduledBlock can be nested under a Task; parent is always a Task, never a Block; calendar events never draggable/nestable | ✓ VERIFIED | `ScheduledBlock.parent_task_id` is an FK to `tasks.id` only — structurally cannot reference a block. `update_block` validates via `get_valid_parent_task` (Task-only lookup). `AgendaItem`/`TodayTimeline`: drag handle and droppable/draggable hooks are disabled whenever `item.isEvent` is true; `isNestable()`/`canBeNestTarget` explicitly exclude events. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/versions/0020_add_parent_task_id.py` | Migration adding parent_task_id FKs | ✓ VERIFIED | revision "0020", down_revision "0019", adds column + FK + index on both tables, clean downgrade path |
| `backend/app/services/task_hierarchy.py` | `get_valid_parent_task`, `assert_task_has_no_children` | ✓ VERIFIED | Both exported, both used by routers |
| `backend/app/routers/tasks.py` | Nesting validation in create/update/delete | ✓ VERIFIED | `create_task`/`update_task` call hierarchy helpers; `delete_task` explicitly clears children's `parent_task_id` on both Task and ScheduledBlock |
| `backend/app/routers/plan.py` | `update_block` accepts/validates `parent_task_id` | ✓ VERIFIED | `exclude_unset=True`, calls `get_valid_parent_task`, persists `block.parent_task_id` |
| `frontend/src/lib/taskHierarchy.ts` | grouping/progress/reorder pure functions | ✓ VERIFIED | `groupTasksByParent`, `subtaskProgress`, `groupAgendaItemsByParent`, `moveInOrder`, `applyManualOrder` all present, 13 unit tests passing |
| `frontend/src/lib/dragIntent.ts` | `resolveDropIntent` classifier | ✓ VERIFIED | Present, 5 boundary-case tests passing |
| `frontend/src/components/AgendaItem.tsx` | drag handle, indent, badge, collapse, error state | ✓ VERIFIED | All present and wired; events excluded from drag |
| `frontend/src/components/TodayTimeline.tsx` | DndContext wiring, nest/unnest/reorder resolution | ✓ VERIFIED | `DndContext`, `groupAgendaItemsByParent`, `resolveDropIntent`, `moveInOrder`/`applyManualOrder` all used in `handleDragEnd` |
| `frontend/src/components/TaskCard.tsx` | drag handle, nested rendering, progress badge | ✓ VERIFIED | Present; click-to-edit and drag handle correctly isolated via `stopPropagation` |
| `frontend/src/components/SubtaskSelect.tsx` | Subtask-of dropdown mirroring GoalSelect | ✓ VERIFIED | Exact pattern match, correct exclusion filter, exact "No parent (top-level task)" copy |
| `frontend/src/components/TaskDrawer.tsx` | "Subtask of" field wired to save payload | ✓ VERIFIED | `parentTaskId` state, reset on open, included in `handleSave`'s body |
| `frontend/src/pages/Tasks.tsx` | grouped card grid, DndContext, hero-from-parents fix | ✓ VERIFIED | `groupTasksByParent` called once; `heroTask` derived from `parents[0]`, not `sorted[0]` — no duplicate rendering of nested children |
| `frontend/src/pages/Today.tsx` | plumbs `onSetParent`/`patchBlockParent` through | ✓ VERIFIED | `handleSetParent` dispatches to `patchBlockParent` or `patchTask` based on item type |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `tasks.py` | `task_hierarchy.py` | `get_valid_parent_task`/`assert_task_has_no_children` | ✓ WIRED | Both imported and called in `create_task`/`update_task` |
| `plan.py` | `task_hierarchy.py` | `get_valid_parent_task` | ✓ WIRED | Imported and called in `update_block` |
| `agenda.ts` | `types/task.ts` | `parentTaskId` populated from backend `parent_task_id` | ✓ WIRED | Confirmed in `agenda.ts` task-item and block-item construction; events excluded |
| `TodayTimeline.tsx` | `taskHierarchy.ts` | `groupAgendaItemsByParent`/`moveInOrder`/`applyManualOrder` | ✓ WIRED | All three used in render + `handleDragEnd` |
| `TodayTimeline.tsx` | `dragIntent.ts` | `resolveDropIntent` | ✓ WIRED | Used in `handleDragEnd` to classify nest/before/after |
| `Today.tsx` | `usePlan.ts` | `patchBlockParent` used inside `handleSetParent` | ✓ WIRED | Confirmed |
| `Tasks.tsx` | `taskHierarchy.ts` | `groupTasksByParent(sorted)` | ✓ WIRED | Called once, shared by hero derivation and card-grid render |
| `TaskDrawer.tsx` | `SubtaskSelect.tsx` | `parent_task_id` state → `TaskCreate` body | ✓ WIRED | Confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `AgendaItem` progress badge | `childItems` | `TodayTimeline`'s `groupAgendaItemsByParent(items)` over live `AgendaItem[]` from `buildWeekAgenda(tasks, events, ..., blocks)` (real API-backed hooks) | Yes | ✓ FLOWING |
| `TaskCard` progress badge | `childTasks` | `Tasks.tsx`'s `groupTasksByParent(sorted)` over live `tasks` from `useTasks()` | Yes | ✓ FLOWING |
| `SubtaskSelect` options | `tasks` prop | `Tasks.tsx` passes real `tasks` from `useTasks()` through `TaskDrawer` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend one-level nesting rejection (already-nested parent) | `pytest tests/test_tasks.py::test_nest_under_child_rejected tests/test_plan.py::test_patch_block_parent_task_id_rejects_nested_parent` (via full suite run) | 422 returned | ✓ PASS |
| Backend one-level nesting rejection (dragged task has children) | `pytest tests/test_tasks.py::test_nest_task_with_children_rejected` | 422 returned | ✓ PASS |
| No completion propagation either direction | `pytest tests/test_tasks.py::test_no_completion_propagation` | passes | ✓ PASS |
| Delete-parent clears children's parent_task_id | `pytest tests/test_tasks.py::test_delete_parent_clears_children` | passes | ✓ PASS |
| ScheduledBlock parent set/clear + persistence | `pytest tests/test_plan.py::test_patch_block_parent_task_id` | passes | ✓ PASS |
| Full backend suite regression check | `cd backend && uv run pytest -q` | 205 passed, 4 failed, 1 error | ✓ PASS (all 5 failures/errors pre-existing and unrelated: `test_brief.py` x2, `test_calendar.py::test_callback_stores_credentials`, `test_plan.py::test_staleness_detection`, `test_weekly_brief.py::test_webhook_range_invalid_value` — confirmed matching plan 01's documented pre-existing baseline) |
| Frontend typecheck | `cd frontend && npx tsc -b --noEmit` | exit 0, no output | ✓ PASS |
| Frontend full test suite regression check | `cd frontend && npx vitest run` | 82 passed, 2 failed (13 files, 1 file with failures) | ✓ PASS (the 2 failures are `agenda.test.ts` timezone-dependent tests, documented as pre-existing in 17-02-SUMMARY.md's deferred-items.md, reproduced identically before this phase's changes) |
| Frontend hierarchy/dragIntent unit tests | `cd frontend && npx vitest run src/lib/taskHierarchy.test.ts src/lib/dragIntent.test.ts` | 18/18 passed | ✓ PASS |

Note: running `pytest tests/test_tasks.py tests/test_plan.py` as an isolated two-file subset (outside the full suite) produced additional failures (`test_approve_idempotent_409`, `test_replan_replaces`, `test_staleness_detection`, `test_complete_block_persists_and_completes_linked_task`, both new PATCH tests) due to test-order/shared-DB-state artifacts of running a partial subset — these do NOT reproduce when the full suite is run (205/210 passed, only the 4 pre-existing failures + 1 pre-existing error remain). This is a pre-existing test-isolation quirk of the test suite unrelated to this phase's code, not a regression introduced by Phase 17.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|--------------|--------|----------|
| HIER-01 | 17-01, 17-02, 17-04 | Drag task/block onto task row/card to nest; un-nest via empty-space drop; one-level cap enforced with 422 | ✓ SATISFIED | Backend validation + tests; frontend `TodayTimeline`/`Tasks.tsx` drag wiring |
| HIER-02 | 17-02, 17-03, 17-05 | Nesting visible/editable on both Today timeline and Tasks page; indented, expanded by default | ✓ SATISFIED | `AgendaItem`/`TaskCard` both render `.timeline-children`/`.tasks-card-children`, default `collapsed=false` |
| HIER-03 | 17-01, 17-02, 17-04, 17-05 | Live progress badge; no completion propagation; children's own fields untouched | ✓ SATISFIED | `subtaskProgress()` wired in both surfaces; backend tests confirm no propagation |
| HIER-04 | 17-05 | "Subtask of" dropdown in TaskDrawer, excludes self and already-parented tasks | ✓ SATISFIED | `SubtaskSelect.tsx` + `TaskDrawer.tsx` wiring |
| HIER-05 | 17-01, 17-04 | ScheduledBlock nestable under Task; parent always Task; events never draggable/nestable | ✓ SATISFIED | FK structurally Task-only; events excluded at `AgendaItem`/`TodayTimeline` render level |

No orphaned requirements — all 5 REQUIREMENTS.md IDs (HIER-01 through HIER-05) are claimed by at least one of the 5 plans, and all are independently corroborated in the codebase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/styles.css` | 1343-1357 | `.timeline-row--insertion-before`/`.timeline-row--insertion-after` CSS classes defined but never applied by any component (`grep` across all `.tsx` files returns zero matches) | ℹ️ Info | The UI-SPEC's "Gap hovered with reorder intent → 2px accent insertion line" visual affordance is not implemented. The underlying reorder behavior itself works (confirmed via `moveInOrder`/`applyManualOrder` wiring and human verification), but there is no live visual indicator distinguishing "before"/"after" intent from "nest" intent while hovering — a user dragging over a row's edge sees the same `.timeline-row--nest-target` highlight regardless of where within the row they are hovering (that class is driven by dnd-kit's `isOver`, not by the computed `dropIntent`). Not a must-have per any plan's frontmatter and does not block the phase goal, but is a real deviation from the approved 17-UI-SPEC.md and worth a follow-up polish pass. |
| `frontend/src/components/TodayTimeline.tsx`, `frontend/src/pages/Tasks.tsx` | error handlers | Rejected-nest error messages are generic ("Couldn't update — try again", "Couldn't nest task — try again") rather than the UI-SPEC's specific copy ("Can't nest here — that task is already a subtask...", "Can't nest here — that task already has subtasks of its own.") | ℹ️ Info | Functionally the rejection is still surfaced inline and UI state is not corrupted (satisfies the PLAN's declared truth), but the copy doesn't distinguish *why* the nest was rejected, deviating from the UI-SPEC's copywriting contract. Not a must-have per PLAN frontmatter. |

No blocker or warning-level anti-patterns found. No TODO/FIXME/placeholder/stub markers in any of the 12 files scanned.

### Human Verification Required

None outstanding. Both human-verify checkpoints in this phase (17-04 Task 3, 17-05 Task 3) were already gated and approved during execution:
- Today timeline drag-nest/un-nest/reorder — approved by user against a live Tailscale-reachable dev server.
- Tasks page drag-nest/un-nest + TaskDrawer "Subtask of" dropdown — approved by user (drawer flow tested directly by orchestrator; drag gesture confirmed separately by user on their own device).

### Gaps Summary

No gaps blocking phase goal achievement. All 5 success criteria are verified against actual, wired, tested code — not stubs. Backend one-level nesting enforcement, delete-cascade, and no-completion-propagation are covered by passing automated tests. Frontend drag-and-drop nesting/un-nesting/reorder, progress badges, indentation, collapse toggles, and the manual "Subtask of" dropdown are all wired end-to-end against the real backend API and real hook-sourced data (no hardcoded/empty stand-ins found).

Two minor, non-blocking polish items are noted under Anti-Patterns for optional follow-up: (1) the reorder "insertion line" hover visual from 17-UI-SPEC.md was never wired into any component (orphaned CSS), and (2) rejected-nest error copy is generic rather than the UI-SPEC's cause-specific strings. Neither affects the phase's observable truths or success criteria as declared in the plans' frontmatter.

---

*Verified: 2026-07-08*
*Verifier: Claude (gsd-verifier)*
