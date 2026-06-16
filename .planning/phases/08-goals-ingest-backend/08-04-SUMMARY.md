---
phase: 08-goals-ingest-backend
plan: 04
subsystem: api
tags: [fastapi, pydantic, sqlalchemy, ingest, idempotent, transactional, upsert]

requires:
  - phase: 08-02
    provides: Goal/Milestone/Task/Routine ORM models with external_key, is_habit, goal_id FK columns; PRAGMA foreign_keys=ON
  - phase: 08-03
    provides: goals.router registered in main.py; GoalRead/MilestoneRead schemas; compute_progress service

provides:
  - IngestPayload Pydantic model: Literal["1.0"] schema_version, extra="forbid" on all sub-models, cron validation on RoutineImport.cron and HabitImport.recurrence_cron
  - GoalImport, TaskImport, RoutineImport, HabitImport, MilestoneImport import models with field constraints
  - IngestResult schema with per-entity created/updated counts
  - apply_import transactional upsert: single async with session.begin(), flush-then-resolve, select-then-update preserving completed/reminder_at/enabled
  - _upsert_task module-level function as monkeypatch injection point for rollback testing
  - GET /api/v1/ingest/schema returns IngestPayload.model_json_schema()
  - POST /api/v1/ingest/confirm: validates payload, writes goals->tasks->routines->habits atomically, idempotent on external_key
  - ingest.router registered in main.py after goals.router
  - external_key field added to TaskRead schema

affects: [09-goals-ingest-ui, 10-day-auto-organize]

tech-stack:
  added: []
  patterns:
    - "Literal['1.0'] as schema_version for versioned payload validation; FastAPI surfaces 422 automatically"
    - "ConfigDict(extra='forbid') on every import sub-model prevents silently ignoring unknown LLM output fields"
    - "flush-then-resolve: session.flush() after goal upserts to assign DB IDs within the same transaction before child FK resolution"
    - "select-then-update-or-create pattern for upsert on nullable unique external_key (preserves PK and runtime fields)"
    - "module-level _upsert_task allows monkeypatching for rollback injection tests"
    - "TestClient(raise_server_exceptions=False) to capture 500 responses instead of propagating RuntimeError"

key-files:
  created:
    - backend/app/schemas/ingest.py
    - backend/app/services/ingest_service.py
    - backend/app/routers/ingest.py
  modified:
    - backend/app/main.py
    - backend/app/schemas/task.py
    - backend/tests/test_ingest.py

key-decisions:
  - "Ingest schema_version is Literal['1.0'] — FastAPI/Pydantic surfaces 422 automatically on mismatch, no custom handler needed"
  - "Single async with session.begin() wraps ALL upserts (goals->tasks->routines->habits); mid-commit RuntimeError rolls back cleanly (D-09)"
  - "session.flush() after goal upserts assigns .id within the same transaction so child rows can reference goal_id before commit"
  - "select-then-update-or-create (not session.merge, not INSERT OR REPLACE) preserves PK and user-edited runtime fields (D-07/D-08)"
  - "TestClient(raise_server_exceptions=False) required in test_ingest.py so monkeypatched RuntimeError yields a 500 response instead of propagating"
  - "external_key added to TaskRead so test_confirm_writes_all can verify external_key is returned on GET /tasks/"

patterns-established:
  - "Pattern: IngestPayload.model_json_schema() as the sole GET /schema response — no additional wrapper needed"
  - "Pattern: flush-then-collect for multi-entity transactions: collect (key, row) pairs before flush, build key->id dict after flush"

requirements-completed: [INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07]

duration: 4min
completed: 2026-06-16
---

# Phase 08 Plan 04: Ingest Pydantic Models, Service, and Router Summary

**Versioned ingest endpoint (schema_version "1.0") with extra=forbid validation, single-transaction flush-then-resolve upsert, and idempotent external_key matching; all 10 INGEST-* Wave 0 tests green**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-16T02:19:23Z
- **Completed:** 2026-06-16T02:23:50Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created `schemas/ingest.py` with `IngestPayload` (schema_version `Literal["1.0"]`, `extra="forbid"`), `GoalImport`, `TaskImport`, `RoutineImport` (cron validated), `HabitImport` (recurrence_cron validated), `MilestoneImport`, `IngestResult`
- Created `services/ingest_service.py` with `apply_import` wrapping all entity upserts in one `async with session.begin()`, `session.flush()` after goals for FK resolution within the transaction, and module-level `_upsert_task` for rollback-test monkeypatching
- Created `routers/ingest.py` with `GET /schema` returning `IngestPayload.model_json_schema()` and `POST /confirm` delegating to `ingest_service.apply_import`
- Registered `ingest.router` in `main.py` after `goals.router`
- All 10 INGEST-* Wave 0 tests pass; full suite 102/103 (1 pre-existing `test_callback_stores_credentials` failure unrelated to this plan)

## Task Commits

1. **Task 1: Ingest Pydantic models** - `8d1ac2a` (feat)
2. **Task 2: Ingest service** - `0d779a6` (feat)
3. **Task 3: Ingest router + main.py registration** - `c083bcb` (feat)

## Files Created/Modified

- `backend/app/schemas/ingest.py` - IngestPayload, GoalImport, TaskImport, RoutineImport, HabitImport, MilestoneImport, IngestResult
- `backend/app/services/ingest_service.py` - apply_import transactional upsert; _upsert_goal/task/routine/habit helpers
- `backend/app/routers/ingest.py` - GET /ingest/schema, POST /ingest/confirm
- `backend/app/main.py` - Added ingest to imports and include_router
- `backend/app/schemas/task.py` - Added external_key field to TaskRead
- `backend/tests/test_ingest.py` - Set raise_server_exceptions=False on TestClient

## Decisions Made

- `Literal["1.0"]` for schema_version — any other value triggers automatic Pydantic 422 with field-level error
- Single `async with session.begin()` covers all entity types; `RuntimeError` inside rolls back the entire transaction to zero rows (D-09 zero-row guarantee)
- `session.flush()` after the goals loop assigns DB IDs within the transaction; child rows resolve `goal_id` from the in-memory map built after flush
- `TestClient(raise_server_exceptions=False)` needed in `test_ingest.py` so the monkeypatched `RuntimeError` returns a 500 HTTP response instead of propagating as an exception to the test frame

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added external_key to TaskRead schema**
- **Found during:** Task 3 (running test_ingest.py::test_confirm_writes_all)
- **Issue:** `test_confirm_writes_all` calls `GET /api/v1/tasks/` and checks `t.get("external_key")`. TaskRead was missing the `external_key` field added to the Task model in Plan 02, so the response never included it (all values were None in response JSON).
- **Fix:** Added `external_key: str | None = None` to `TaskRead`
- **Files modified:** `backend/app/schemas/task.py`
- **Verification:** test_confirm_writes_all passes
- **Committed in:** c083bcb (Task 3 commit)

**2. [Rule 1 - Bug] Set raise_server_exceptions=False on TestClient**
- **Found during:** Task 3 (running test_ingest.py::test_rollback_on_mid_commit_failure)
- **Issue:** `TestClient` by default re-raises server-side exceptions instead of converting them to HTTP 500 responses. The rollback test monkeypatches `_upsert_task` to raise `RuntimeError`; without `raise_server_exceptions=False`, the RuntimeError propagated to the test frame instead of returning `r.status_code >= 400`.
- **Fix:** `client = TestClient(app, raise_server_exceptions=False)` — Starlette returns 500 instead of raising
- **Files modified:** `backend/tests/test_ingest.py`
- **Verification:** test_rollback_on_mid_commit_failure passes; zero-row guarantee confirmed
- **Committed in:** c083bcb (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - bugs in wave 0 test stubs)
**Impact on plan:** Both fixes required for tests to work correctly. No scope creep.

## Issues Encountered

- Worktree branched before master had Plan 03's commits (goals router, schemas, main.py update). Merged master mid-execution (fast-forward with one conflict in main.py resolved manually). Plan 03's goals router was incorporated, then ingest router added on top.

## Known Stubs

None — ingest endpoint reads from and writes to real DB; no hardcoded empty values or placeholder responses.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ingest contract fully operational: `GET /api/v1/ingest/schema` returns JSON Schema, `POST /api/v1/ingest/confirm` validates + writes atomically
- Ingest schema_version is "1.0" — Phase 9 UI paste/upload flow posts against this contract
- All INGEST-* requirements complete; Phase 8 backend is done
- Phase 9 (Goals + Ingest UI) builds paste/upload + dry-run preview on top of this ingest endpoint

---
*Phase: 08-goals-ingest-backend*
*Completed: 2026-06-16*
