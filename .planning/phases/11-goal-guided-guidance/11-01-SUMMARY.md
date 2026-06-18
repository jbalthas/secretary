---
phase: 11-goal-guided-guidance
plan: "01"
subsystem: backend
tags: [migration, schema, settings, tdd, guidance]
dependency_graph:
  requires: []
  provides: [Task.completed_at, AppSettings.stall_threshold_days, AppSettings.last_guidance_sent_date, GET/PUT /settings/stall-threshold, Wave-0-test-stubs]
  affects: [backend/app/models/__init__.py, backend/app/routers/tasks.py, backend/app/routers/settings.py]
tech_stack:
  added: []
  patterns: [batch_alter_table migration, deferred-import test stub, nullable column no server_default]
key_files:
  created:
    - backend/migrations/versions/0010_guidance_columns.py
    - backend/tests/test_guidance.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/schemas/task.py
    - backend/app/schemas/settings.py
    - backend/app/routers/tasks.py
    - backend/app/routers/settings.py
    - backend/tests/test_tasks.py
    - backend/tests/test_settings.py
decisions:
  - "[11-01] completed_at nullable, no server_default — avoids NOT NULL on existing rows (matches migration 0009 precedent)"
  - "[11-01] stall_threshold_days coalesces None->7 on read (same pattern as work-hours coalesce)"
  - "[11-01] Wave 0 test stubs use deferred imports inside test body so test_guidance.py collects before guidance_service.py exists"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-06-18"
  tasks_completed: 3
  files_changed: 9
---

# Phase 11 Plan 01: Schema Foundation + Wave 0 Test Stubs Summary

Migration 0010 adds nullable `completed_at` on tasks and `stall_threshold_days` + `last_guidance_sent_date` on app_settings; PATCH /tasks stamps `completed_at` on False→True; GET/PUT /settings/stall-threshold round-trips with default 7; seven Wave 0 failing test stubs define the red target for Plans 11-02/11-03/11-04.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Migration 0010 + ORM columns | ac92c03 | 0010_guidance_columns.py, models/__init__.py |
| 2 | completed_at stamp + stall-threshold API | 9ce0c0a | routers/tasks.py, routers/settings.py, schemas/settings.py, schemas/task.py |
| 3 | Wave 0 failing test stubs | 6cb4809 | tests/test_guidance.py |

## Verification Results

- `alembic upgrade head` applied migration 0010 cleanly from 0009
- `pytest tests/test_tasks.py::test_completed_at_stamped tests/test_settings.py::test_stall_threshold_roundtrip` — 2 passed
- `pytest tests/test_guidance.py --collect-only` — 7 tests collected, 0 errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing field] Added completed_at to TaskRead schema**
- **Found during:** Task 2
- **Issue:** TaskRead did not include completed_at, so the test could not assert on it from the API response
- **Fix:** Added `completed_at: datetime | None = None` to TaskRead in schemas/task.py
- **Files modified:** backend/app/schemas/task.py
- **Commit:** 9ce0c0a

## Known Stubs

None. The seven test_guidance.py stubs are intentionally red (Wave 0 pattern) — they will be turned green by Plans 11-02 and 11-03.

## Self-Check: PASSED

- [x] backend/migrations/versions/0010_guidance_columns.py exists
- [x] backend/tests/test_guidance.py exists
- [x] Commits ac92c03, 9ce0c0a, 6cb4809 exist in git log
