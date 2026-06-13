---
phase: 03-pushover-reminders
plan: "03"
subsystem: backend
tags: [apscheduler, tasks, reminders, fastapi, pytest]

requires:
  - phase: 03-02
    provides: upsert_reminder, remove_reminder from app.scheduler

provides:
  - "tasks.py CRUD endpoints calling upsert_reminder on create/update and remove_reminder on delete/complete"
  - "Router-level reminder lifecycle test suite (5 tests)"

affects: [phase-04-google-calendar, phase-05-voice]

tech-stack:
  added: []
  patterns:
    - "Monkeypatch scheduler helpers at import site (app.routers.tasks.upsert_reminder) for router-level isolation"
    - "Completion-aware update path: completed=True -> remove_reminder; else -> upsert_reminder"

key-files:
  created:
    - backend/tests/test_task_reminders.py
  modified:
    - backend/app/routers/tasks.py

key-decisions:
  - "update_task checks task.completed after refresh to decide remove vs upsert — avoids needing a separate complete endpoint"
  - "delete_task calls remove_reminder(task_id) using the id local (task is already deleted from DB, task object unusable)"

patterns-established:
  - "Monkeypatch at app.routers.tasks.<helper> — not app.scheduler.<helper> — to test what the router actually calls"

requirements-completed: [NOTIF-01]

duration: 10min
completed: 2026-06-12
---

# Phase 03 Plan 03: Task Reminder Lifecycle Wiring Summary

**upsert_reminder/remove_reminder wired into CRUD endpoints (create, update/complete, delete) with 5 router-level lifecycle tests covering all scheduler call paths — full suite 20 passed.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- tasks.py imports and calls upsert_reminder on create and update (non-complete), remove_reminder on complete and delete
- Completion-aware PATCH: `if task.completed: remove_reminder` else `upsert_reminder`
- 5 test cases covering create-with-reminder, create-without-reminder, complete, delete, and clear-reminder-via-update

## Task Commits

1. **Task 1: Wire upsert_reminder/remove_reminder into CRUD endpoints** - `21399c2` (feat)
2. **Task 2: Router-level reminder lifecycle tests** - `86a639d` (test)

## Files Created/Modified

- `backend/app/routers/tasks.py` - Added scheduler import + calls in create, update, delete
- `backend/tests/test_task_reminders.py` - 5 lifecycle tests with monkeypatched scheduler helpers

## Decisions Made

- Monkeypatch at `app.routers.tasks.upsert_reminder` (not `app.scheduler`) so tests verify what the router calls
- `delete_task` uses `task_id` (local var) not `task.id` since task is deleted before calling remove_reminder

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing 03-02 files (scheduler.py, services/, tests/)**
- **Found during:** Task 1 setup
- **Issue:** Worktree branch was behind master; scheduler.py and all 03-02 artifacts were absent
- **Fix:** `git merge master --no-edit` — fast-forward brought in all 03-02 commits
- **Files modified:** all 03-02 files (scheduler.py, services/pushover.py, conftest.py, etc.)
- **Verification:** `uv run pytest tests/ -q` — 15 passed before starting plan tasks
- **Committed in:** merge commit (pre-existing)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Merge was necessary prerequisite; no scope creep.

## Issues Encountered

None beyond the worktree merge.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- NOTIF-01 automated coverage complete (20 tests GREEN)
- Manual reboot gate test remains a phase-gate step (requires real Pi + Pushover credentials)
- Phase 04 (Google Calendar) can proceed independently

---
*Phase: 03-pushover-reminders*
*Completed: 2026-06-12*
