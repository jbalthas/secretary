---
phase: quick-260617-bvj
plan: 01
subsystem: frontend, backend/tests
tags: [bug-fix, task-goal, taskdrawer, unlink]
dependency_graph:
  requires: []
  provides: [goal-unlink-fix]
  affects: [TaskDrawer, task-types, test-tasks]
tech_stack:
  added: []
  patterns: [exclude_unset-null-propagation, explicit-null-over-undefined]
key_files:
  modified:
    - frontend/src/components/TaskDrawer.tsx
    - frontend/src/types/task.ts
    - backend/tests/test_tasks.py
decisions:
  - Use GoalType.learning in regression test — "outcome" is not a valid enum value
metrics:
  duration: ~8 minutes
  completed: 2026-06-17
  tasks_completed: 2
  files_modified: 3
---

# Quick 260617-bvj: Fix task→goal unlink in TaskDrawer Summary

**One-liner:** Remove `?? undefined` from TaskDrawer's `goal_id` field so `null` reaches the backend and clears the FK under `exclude_unset=True` PATCH semantics.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Send goal_id explicitly + widen TaskCreate type | 8d4c565 | TaskDrawer.tsx, task.ts |
| 2 | Add backend regression test for goal unlink | ee98002 | test_tasks.py |

## What Was Done

**Task 1 (fix):** Changed `goal_id: goalId ?? undefined` to `goal_id: goalId` in `TaskDrawer.handleSave`. The `goalId` state is already `number | null`, so this sends `null` verbatim when "No goal" is selected. The backend's `model_dump(exclude_unset=True)` includes explicitly-set fields even when null, so the FK column is cleared. Also widened `TaskCreate.goal_id` from `number` to `number | null` to satisfy TypeScript. `Task.goal_id` (read type) was left as `number | undefined` — no change needed.

**Task 2 (test):** Added `test_unlink_task_from_goal` to `test_tasks.py`. Creates a goal + linked task, PATCHes with `{"goal_id": null}`, asserts 200 + `goal_id is None`, then re-fetches via GET and asserts the cleared value persists. Full suite: 8/8 passed.

## Verification

- `cd backend && uv run pytest tests/test_tasks.py -x -q` — 8 passed, 0 failed
- `cd frontend && tsc -b --noEmit` (run from main checkout with node_modules) — clean, 0 errors
- No regression to linking (existing create-with-goal_id path unchanged)

## Deviations from Plan

**1. [Rule 1 - Bug] Invalid GoalType "outcome" in test**
- **Found during:** Task 2 — first test run failed with `KeyError: 'id'` because POST /goals/ returned 422 for `type: "outcome"`
- **Issue:** Plan specified `{"title": "Ship v2", "type": "outcome"}` but GoalType enum only accepts `career | life | health | learning | financial`
- **Fix:** Changed to `"type": "learning"` matching the existing test_goals.py pattern
- **Files modified:** backend/tests/test_tasks.py
- **Commit:** ee98002 (included in same commit)

**2. [Rule 3 - Blocking] Worktree was behind master by ~20 commits**
- **Found during:** Pre-task file read — worktree was at phase 07 HEAD; TaskDrawer in worktree lacked goal-related code added in phase 09
- **Fix:** `git rebase master` in worktree — rebased cleanly with no conflicts; proceeded normally
- **Impact:** No files changed; just environment setup

## Known Stubs

None.

## Self-Check: PASSED

- `8d4c565` exists: confirmed
- `ee98002` exists: confirmed
- `backend/tests/test_tasks.py` contains `test_unlink_task_from_goal`: confirmed
- `frontend/src/components/TaskDrawer.tsx` contains `goal_id: goalId,` (no `?? undefined`): confirmed
- `frontend/src/types/task.ts` contains `goal_id?: number | null`: confirmed
