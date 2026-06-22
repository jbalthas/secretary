---
phase: 12-update-resolution-engine
plan: "04"
subsystem: api
tags: [fastapi, pydantic, sqlalchemy, ingest, idempotency]

requires:
  - phase: 12-01
    provides: UpdateLog model with unique update_id index; Task.completed_at column; Wave 0 test stubs in test_updates.py

provides:
  - UpdateAction enum (done, reschedule, drop) in ingest schema
  - IntraDayUpdateImport Pydantic model with update_id, entity_type, entity_id, action, reschedule_to
  - IngestPayload accepts schema_version "1.0" AND "1.1" (back-compat preserved)
  - IngestPayload.updates optional list (defaults empty)
  - _apply_update helper in ingest_service wired into apply_import Phase 5 loop
  - GET /api/v1/tasks/{task_id} endpoint for task retrieval by ID

affects: [phase-13-update-loop-ui, ingest-pipeline, update-resolution]

tech-stack:
  added: []
  patterns:
    - "Stateless idempotency for done/drop: re-applying completed=True leaves identical state"
    - "UpdateLog guard for reschedule idempotency: duplicate update_id = early return"
    - "Phase 5 updates loop inside existing apply_import transaction: no separate transaction"

key-files:
  created: []
  modified:
    - backend/app/schemas/ingest.py
    - backend/app/services/ingest_service.py
    - backend/app/routers/tasks.py

key-decisions:
  - "drop reuses completed=True (no separate drop flag/column) — Phase 13 slipped-vs-done rollup must treat completed=True as ambiguous"
  - "done/drop are stateless-idempotent; reschedule uses UpdateLog guard (stateless unsafe for reschedule since re-apply moves time again)"
  - "GET /{task_id} added to tasks router — required for test verification, omitted from original plan"

patterns-established:
  - "Intra-day update loop runs as Phase 5 inside the same async with session.begin() block as the existing upsert phases"

requirements-completed: [INGEST-08]

duration: 15min
completed: 2026-06-22
---

# Phase 12 Plan 04: Update Resolution Engine — Ingest Extension Summary

**INGEST-08: ingest contract extended to accept intra-day update payloads (schema_version 1.1) with UpdateAction done/drop/reschedule applied idempotently inside the existing apply_import transaction**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-22T16:25:00Z
- **Completed:** 2026-06-22T16:29:11Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `UpdateAction` enum and `IntraDayUpdateImport` Pydantic model to ingest schema
- Extended `IngestPayload.schema_version` to `Literal["1.0", "1.1"]` preserving full back-compat
- Implemented `_apply_update` in `ingest_service.py` wired as Phase 5 inside the existing transaction
- done/drop are stateless-idempotent (re-applying completed=True is a no-op); reschedule guarded by UpdateLog unique constraint
- Added `GET /api/v1/tasks/{task_id}` endpoint needed by test verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Add IntraDayUpdateImport + updates field + schema_version 1.1** - `780f29d` (feat)
2. **Task 2: Apply updates idempotently inside apply_import** - `ece9a13` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/app/schemas/ingest.py` - Added UpdateAction enum, IntraDayUpdateImport model, updated IngestPayload schema_version + updates field
- `backend/app/services/ingest_service.py` - Added _apply_update helper and Phase 5 updates loop inside apply_import
- `backend/app/routers/tasks.py` - Added GET /{task_id} endpoint

## Decisions Made
- **drop = completed=True**: No separate drop flag for v2.1. Phase 13 slipped-vs-done rollup must not treat completed=True as unambiguously "done" (documented in plan must_haves).
- **Stateless idempotency for done/drop**: Re-applying the same done/drop action leaves identical DB state — no double-mutation possible.
- **UpdateLog guard for reschedule**: Stateless approach unsafe for reschedule (duplicate would move the time again), so UpdateLog unique update_id check gates re-application.
- **GET /tasks/{task_id}**: Added as a Rule 2 fix — the test verification needed this endpoint which was missing from the router.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added GET /api/v1/tasks/{task_id} endpoint**
- **Found during:** Task 2 (Apply updates idempotently inside apply_import)
- **Issue:** test_ingest_intra_day_update_applies calls `client.get(f"/api/v1/tasks/{task_id}")` but the tasks router had no GET-by-id endpoint (only GET list, POST, PATCH, DELETE). Result was 405 Method Not Allowed.
- **Fix:** Added `@router.get("/{task_id}", response_model=TaskRead)` endpoint to tasks router
- **Files modified:** backend/app/routers/tasks.py
- **Verification:** test_ingest_intra_day_update_applies passes; no existing tests broken
- **Committed in:** ece9a13 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical endpoint)
**Impact on plan:** Required for test correctness. The endpoint is a natural addition that should have been in the tasks router from the start.

## Issues Encountered
- Pre-existing test failure: `test_callback_stores_credentials` in `test_calendar.py` returns 404 (unrelated to this plan, confirmed pre-existing by stash test)

## Known Stubs
None — all functionality is fully wired.

## Next Phase Readiness
- INGEST-08 complete: ingest endpoint now accepts schema_version 1.1 with updates list
- Phase 13 (Update Loop UI) can route messy LLM dumps through POST /api/v1/ingest/confirm with an updates array
- Phase 13 must account for: drop and done both map to completed=True (no separate flag)

---
*Phase: 12-update-resolution-engine*
*Completed: 2026-06-22*

## Self-Check: PASSED
- `backend/app/schemas/ingest.py` — exists, contains IntraDayUpdateImport, UpdateAction, updates field
- `backend/app/services/ingest_service.py` — exists, contains _apply_update, UpdateLog, for u in payload.updates
- `backend/app/routers/tasks.py` — exists, contains GET /{task_id} endpoint
- Commits `780f29d` and `ece9a13` confirmed in git log
