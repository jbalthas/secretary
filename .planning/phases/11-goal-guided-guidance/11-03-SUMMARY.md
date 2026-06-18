---
phase: 11-goal-guided-guidance
plan: "03"
subsystem: backend
tags: [guidance, scoring, endpoint, fastapi]
dependency_graph:
  requires: [11-01]
  provides: [GUIDE-02, next-best-task-endpoint]
  affects: [11-04]
tech_stack:
  added: []
  patterns: [D-06 scoring, async router, selectin lazy load]
key_files:
  created:
    - backend/app/routers/guidance.py
  modified:
    - backend/app/main.py
    - backend/app/models/__init__.py
    - backend/app/schemas/task.py
    - backend/tests/test_guidance.py
decisions:
  - D-06 scoring uses neutral values (0.5) for missing goal urgency or due_proximity to avoid excluding ungrouped tasks
  - Tasks already in ScheduledBlock today are NOT excluded from scoring — banner reflects intent not schedule
metrics:
  duration: "~10 minutes"
  completed: "2026-06-18"
  tasks_completed: 2
  files_changed: 5
---

# Phase 11 Plan 03: next-best-task Endpoint Summary

Implements `GET /api/v1/guidance/next-best-task` with D-06 priority scoring to feed the Today tab "Focus on:" banner.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | TDD failing tests | 9a51201 | tests/test_guidance.py, models/__init__.py, schemas/task.py |
| 1 (GREEN) | guidance.py next-best-task endpoint | df8ca71 | backend/app/routers/guidance.py |
| 2 | Register guidance router in main.py | 36c9ddf | backend/app/main.py |

## What Was Built

`backend/app/routers/guidance.py` — async FastAPI router with:
- `PRIORITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}`
- `_score_task(task, today)` implementing D-06: `priority_weight x goal_urgency x due_proximity`
- `GET /next-best-task` querying all `completed==False, is_habit==False` tasks, returning the max-scored task or `null`
- Neutral values: goal_urgency=0.5 (no linked goal), due_proximity=0.5 (no due_date)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing fields] Updated worktree models/__init__.py and schemas/task.py**
- **Found during:** Task 1 (TDD RED)
- **Issue:** Worktree copies of models/__init__.py (missing `completed_at`, `list_name`, `stall_threshold_days`, `last_guidance_sent_date`) and schemas/task.py (missing `completed_at`, `list_name`) were behind the main branch state needed by Phase 11
- **Fix:** Updated both files to include all Phase 11 fields from 11-01
- **Files modified:** backend/app/models/__init__.py, backend/app/schemas/task.py
- **Commit:** 9a51201

**2. [Rule 3 - Blocking] Resolve merge conflict in models/__init__.py**
- **Found during:** Task 1 setup
- **Issue:** The main checkout had a git merge conflict marker between two worktrees (`completed_at` vs `list_name`); both fields are required
- **Fix:** Resolved by keeping both fields in the worktree copy
- **Commit:** 9a51201

## Verification

- `pytest tests/test_guidance.py::test_next_best_task_scoring` — PASSED
- `pytest tests/test_guidance.py::test_next_best_task_empty` — PASSED
- `GET /api/v1/guidance/next-best-task` returns HTTP 200 (verified via pytest TestClient)

## Self-Check: PASSED

- `backend/app/routers/guidance.py` — FOUND
- `backend/app/main.py` contains `guidance` import and `app.include_router(guidance.router)` — FOUND
- Commits 9a51201, df8ca71, 36c9ddf — FOUND
