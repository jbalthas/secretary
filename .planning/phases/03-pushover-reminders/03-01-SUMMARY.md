---
phase: 03-pushover-reminders
plan: "01"
subsystem: backend/config, backend/tests
tags: [pushover, config, tdd, red-phase, scheduler]
dependency_graph:
  requires: []
  provides: [pushover-config-fields, pushover-test-contracts, scheduler-test-contracts]
  affects: [backend/app/config.py, backend/tests/test_pushover.py, backend/tests/test_scheduler.py]
tech_stack:
  added: []
  patterns: [pydantic-settings env fields, TDD RED phase, monkeypatch httpx.Client.post, APScheduler MemoryJobStore for tests]
key_files:
  created:
    - backend/tests/test_pushover.py
    - backend/tests/test_scheduler.py
  modified:
    - backend/app/config.py
    - backend/.env.example
decisions:
  - Monkeypatch httpx.Client.post (not app.services.pushover.httpx) so tests are decoupled from module import path
  - MemoryJobStore reconfigured per-test to isolate scheduler state without starting the event loop
  - Empty string defaults for pushover_api_token/pushover_user_key so tests run without real credentials
metrics:
  duration: ~8 minutes
  completed: "2026-06-13"
  tasks_completed: 3
  files_changed: 4
---

# Phase 03 Plan 01: Pushover Foundation — Config + RED Tests Summary

**One-liner:** Pushover credential fields added to Settings with empty defaults; TDD RED test contracts written for PushoverClient payload and scheduler upsert/remove behavior.

## What Was Built

- Extended `Settings` with `pushover_api_token: str = ""` and `pushover_user_key: str = ""`
- Documented both vars in `.env.example`
- `test_pushover.py`: three failing tests encoding exact PushoverClient payload contract (token, user, title, message, priority fields; empty-message becomes single space; priority mapping high->1, others->0)
- `test_scheduler.py`: four failing tests encoding scheduler job-id convention and upsert/remove/null-reminder behavior using MemoryJobStore

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Pushover credential fields to Settings | ffd86e9 | backend/app/config.py, backend/.env.example |
| 2 | Write failing PushoverClient unit tests (RED) | 0fe36f2 | backend/tests/test_pushover.py |
| 3 | Write failing scheduler unit tests (RED) | 6c6d603 | backend/tests/test_scheduler.py |

## Verification

- `from app.config import settings; settings.pushover_api_token` resolves (verified)
- `test_pushover.py` is RED: `ModuleNotFoundError: No module named 'app.services'` (correct)
- `test_scheduler.py` is RED: `ModuleNotFoundError: No module named 'apscheduler'` (correct — Plan 02 installs it)
- `test_health.py` still passes (no regression)
- `test_tasks.py` was already failing pre-existing (worktree DB schema not migrated — out of scope)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. No UI or data rendering involved in this plan.

## Self-Check: PASSED

- backend/app/config.py: modified with pushover fields
- backend/.env.example: documented both vars
- backend/tests/test_pushover.py: created with 3 test functions
- backend/tests/test_scheduler.py: created with 4 test functions
- Commits ffd86e9, 0fe36f2, 6c6d603 verified present
