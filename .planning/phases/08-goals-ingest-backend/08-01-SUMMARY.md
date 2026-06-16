---
phase: 08-goals-ingest-backend
plan: 01
subsystem: testing
tags: [pytest, fastapi, testclient, goals, ingest, tdd, wave-0]

requires:
  - phase: 07-outlook-calendar-ics-feed-integration
    provides: "stable test infrastructure (conftest.py, TestClient pattern)"

provides:
  - "backend/tests/test_goals.py — 10 collectable RED stubs for GOAL-01/02/03/06"
  - "backend/tests/test_ingest.py — 10 collectable RED stubs for INGEST-01/02/04/06/07"
  - "Executable acceptance contract for all Wave 1-3 implementation tasks"

affects: [08-02, 08-03, 08-04]

tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: write all test stubs before any implementation; tests must collect but fail (RED)"
    - "Defer service imports inside test functions when the module does not yet exist to keep --collect-only clean"
    - "monkeypatch at source module path (app.services.celebrate.*) for celebration hook isolation"
    - "monkeypatch at app.services.ingest_service._upsert_task with nonlocal call_count for rollback injection"

key-files:
  created:
    - backend/tests/test_goals.py
    - backend/tests/test_ingest.py
  modified: []

key-decisions:
  - "Deferred ingest_service import to inside test_rollback_on_mid_commit_failure body so test_ingest.py collects before ingest_service.py exists"
  - "monkeypatch.setattr uses string path 'app.services.ingest_service._upsert_task' so it resolves at runtime, not at collection time"

patterns-established:
  - "test_goals.py: _link_task() module-level helper for task-goal linkage in progress tests"
  - "test_ingest.py: _payload(**overrides) module-level builder for composable ingest payloads"

requirements-completed: [GOAL-01, GOAL-02, GOAL-03, GOAL-06, INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07]

duration: 2min
completed: 2026-06-16
---

# Phase 08 Plan 01: Wave 0 Test Stubs Summary

**20 pytest-collectable RED stubs across test_goals.py and test_ingest.py establishing the full executable acceptance contract for the Goals + Ingest backend phase**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-16T02:01:17Z
- **Completed:** 2026-06-16T02:03:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `backend/tests/test_goals.py` with 10 tests covering goal CRUD, archive, progress computation (tasks + milestones unified ratio), milestone CRUD, and celebration monkeypatching
- Created `backend/tests/test_ingest.py` with 10 tests covering schema endpoint, version mismatch, extra field rejection, cron validation, transactional write, rollback injection, idempotency, completed field preservation, habit creation, and habit-goal linkage
- Both files collect cleanly (`--collect-only` exits 0, 20 tests total); full pre-existing suite still collects (74 tests, no import errors)
- Both files fail (RED) because Goals and Ingest routers do not yet exist

## Task Commits

1. **Task 1: Create backend/tests/test_goals.py** - `818ba16` (test)
2. **Task 2: Create backend/tests/test_ingest.py** - `1e6890e` (test)

## Files Created/Modified

- `backend/tests/test_goals.py` — 10 RED stubs for GOAL-01/02/03/06; includes _link_task() helper and monkeypatch patterns for celebration hooks
- `backend/tests/test_ingest.py` — 10 RED stubs for INGEST-01/02/04/06/07; includes _payload() builder and rollback injection via monkeypatch

## Decisions Made

- Deferred `ingest_service` import to inside `test_rollback_on_mid_commit_failure` rather than at module top — required because `app.services.ingest_service` does not exist yet and a top-level import causes a collection error
- Used `monkeypatch.setattr("app.services.ingest_service._upsert_task", ...)` (string path) so the patch target resolves at runtime when the module exists, not at collection time

## Deviations from Plan

None — plan executed exactly as written. The deferred import was required to satisfy the plan's own acceptance criterion (files must collect cleanly before implementation).

## Issues Encountered

- Initial `test_ingest.py` had a top-level `from app.services import ingest_service` import that caused a collection error. Fixed by moving import inside the test function body.

## User Setup Required

None — no external service configuration required.

## Known Stubs

Both files are intentionally all stubs — this is Wave 0. Every test is expected to fail until the corresponding implementation wave (1-3) builds the routers/services/models.

## Next Phase Readiness

- `cd backend && uv run pytest tests/test_goals.py tests/test_ingest.py -x` is the automated verify command for every subsequent task in this phase
- Wave 1 (Plan 02): Goal + Milestone ORM models + Alembic migrations
- Wave 2 (Plan 03): Goals router — test_goals.py turns green
- Wave 3 (Plan 04): Ingest service + router — test_ingest.py turns green

---
*Phase: 08-goals-ingest-backend*
*Completed: 2026-06-16*
