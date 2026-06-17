---
phase: quick-260617-ldm
plan: 01
subsystem: tasks
tags: [tasks, schema, frontend, planner]
requires:
  - Task.estimated_minutes column (migration 0007, pre-existing)
provides:
  - estimated_minutes settable end-to-end (backend schema + frontend types + TaskDrawer UI)
affects:
  - backend/app/schemas/task.py
  - frontend/src/types/task.ts
  - frontend/src/components/TaskDrawer.tsx
tech-stack:
  added: []
  patterns:
    - string-backed numeric input for clean blank state (matches dueTime/reminder fields)
    - blank input => undefined => omitted payload => null => planner 30-min default
key-files:
  created: []
  modified:
    - backend/app/schemas/task.py
    - backend/tests/test_tasks.py
    - frontend/src/types/task.ts
    - frontend/src/components/TaskDrawer.tsx
decisions:
  - Added estimated_minutes to TaskCreate only; TaskUpdate/TaskRead inherit, covering create/PATCH/read in one edit
  - No model change, no migration — column already exists from migration 0007
metrics:
  duration: ~5 min
  completed: 2026-06-17
---

# Quick Task 260617-ldm: Add per-task estimated_minutes (Duration) Summary

Exposed `Task.estimated_minutes` manually end-to-end so the user can pre-set a task's
duration in the TaskDrawer, controlling Phase 10 planner block sizing without re-ingesting.

## What Was Done

### Task 1 — Backend schema + regression test (TDD)
- Added `estimated_minutes: int | None = None` to `TaskCreate` in `backend/app/schemas/task.py`,
  placed after `recurrence_cron`. `TaskUpdate` and `TaskRead` inherit it, so create, PATCH, and read all gain the field in one edit.
- No model edit and no migration — the `estimated_minutes` Integer column already exists (migration 0007).
- Added three regression tests to `backend/tests/test_tasks.py`:
  - POST with `estimated_minutes: 45` returns 45.
  - POST without the field returns `null`.
  - PATCH to 90 persists (confirms `exclude_unset=True` round-trip).
- RED confirmed (KeyError on missing field), then GREEN: all 11 tests in `test_tasks.py` pass.
- Commit: `eb861b4`

### Task 2 — Frontend types + TaskDrawer input
- Added `estimated_minutes?: number | null;` to both `Task` and `TaskCreate` in `frontend/src/types/task.ts`.
- `TaskDrawer.tsx`:
  - New string-backed state `estimatedMinutes` for a clean blank state.
  - Hydrated in the `useEffect` block: `task?.estimated_minutes != null ? String(...) : ""`.
  - `handleSave` body adds `estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : undefined`
    (blank => omitted => stays null => planner uses its 30-min default).
  - New "Duration" `Collapsible` (placed after "Description") with a number input
    (`type="number" min={1}`, placeholder "e.g. 30").
- `npx tsc --noEmit` clean; `npm run build` succeeds.
- Commit: `361915a`

## Verification

- Backend: `cd backend && python -m pytest tests/test_tasks.py -x -q` — 11 passed (run via `.venv/Scripts/python.exe`, since system Python lacks pytest).
- Frontend: `cd frontend && npx tsc --noEmit && npm run build` — both succeed.

## Deviations from Plan

**[Rule 3 - Blocking] pytest invocation.** The plan's verify command `python -m pytest`
hit the system Python (Python 3.13) which has no pytest module. Ran the project's venv
interpreter instead: `.venv/Scripts/python.exe -m pytest`. No code/test change — execution detail only.

Otherwise the plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
- FOUND: backend/app/schemas/task.py (estimated_minutes present)
- FOUND: backend/tests/test_tasks.py (3 new tests)
- FOUND: frontend/src/types/task.ts (estimated_minutes on Task + TaskCreate)
- FOUND: frontend/src/components/TaskDrawer.tsx (Duration Collapsible + handleSave wiring)
- FOUND commit: eb861b4
- FOUND commit: 361915a
