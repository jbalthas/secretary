---
phase: 12-update-resolution-engine
plan: "01"
subsystem: backend
tags: [wave-0, tdd-stubs, migration, rapidfuzz, scheduler, ingest]
dependency_graph:
  requires: []
  provides:
    - rapidfuzz dependency installed
    - app/schemas/update.py (UpdateRequest, UpdateResponse, UpdateCandidate)
    - app/services/resolution_service.py stub (CONFIDENT_THRESHOLD=80, AMBIGUOUS_LOW=50)
    - app/services/checkin_service.py stub
    - migration 0015 (check_in_hour/check_in_minute + update_log table)
    - app/routers/updates.py stub router
    - app/scheduler.py schedule_checkin stub
    - tests/test_updates.py (10 RED tests, clean collection)
  affects:
    - backend/app/main.py (updates router wired, check-in lifespan block, logging)
    - backend/app/models/__init__.py (AppSettings columns, UpdateLog model)
tech_stack:
  added:
    - rapidfuzz>=3.9,<4.0 (pure text C-extension fuzzy matching, no LLM)
  patterns:
    - Deferred import inside test body (Phase 08 convention) — prevents collection errors on stubs
    - Nullable column + no server_default (Phase 10 AppSettings convention)
    - LOGGED lifespan exception (not silent pass) for NOTIF-07 reboot-survival guard
    - schedule_checkin stub in scheduler.py follows schedule_daily_brief pattern
key_files:
  created:
    - backend/app/schemas/update.py
    - backend/app/services/resolution_service.py
    - backend/app/services/checkin_service.py
    - backend/migrations/versions/0015_add_checkin_and_update_log.py
    - backend/app/routers/updates.py
    - backend/tests/test_updates.py
  modified:
    - backend/pyproject.toml (rapidfuzz added)
    - backend/app/models/__init__.py (AppSettings check_in_hour/minute, UpdateLog)
    - backend/app/main.py (logging, updates router, check-in lifespan block)
    - backend/app/scheduler.py (schedule_checkin stub)
decisions:
  - "[12-01] Wave 0 test strategy: all 10 Phase 12 tests authored RED in 12-01; deferred imports prevent collection errors; tests fail on NotImplementedError or wrong status code (not ImportError)"
  - "[12-01] schedule_checkin stub added to scheduler.py so test_schedule_checkin_registers_job import resolves; stub raises NotImplementedError (12-03 fills)"
  - "[12-01] test_checkin_notification_includes_url patches app.services.pushover.PushoverClient (not checkin_service.PushoverClient which doesn't exist yet in stub) — stub raises NotImplementedError making test RED on behavior"
  - "[12-01] check-in lifespan block logs exception via logger.exception (never bare except/pass) — satisfies NOTIF-07 reboot-survival guard"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-22"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 4
---

# Phase 12 Plan 01: Wave 0 Foundation Summary

**One-liner:** Wave 0 foundation for Phase 12 — rapidfuzz installed, schema/service stubs created, migration 0015 applied (check_in_hour/check_in_minute + update_log table), main.py wired with logged check-in lifespan, and 10 RED tests authored with clean collection.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add rapidfuzz dep + schema/service stubs | 91245a4 | pyproject.toml, schemas/update.py, services/resolution_service.py, services/checkin_service.py |
| 2 | AppSettings columns + UpdateLog + migration 0015 | b1e8173 | models/__init__.py, migrations/versions/0015_add_checkin_and_update_log.py |
| 3 | Wire main.py + 10 failing tests | 3009101 | main.py, scheduler.py, routers/updates.py, tests/test_updates.py |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing stub] schedule_checkin stub added to scheduler.py**
- **Found during:** Task 3 — test_schedule_checkin_registers_job imports `from app.scheduler import schedule_checkin`; without a stub this causes ImportError at test body time, violating the "RED on behavior, not ImportError" acceptance criterion
- **Fix:** Added `schedule_checkin(hour, minute) -> None: raise NotImplementedError` to scheduler.py; 12-03 fills it
- **Files modified:** backend/app/scheduler.py
- **Commit:** 3009101

**2. [Rule 1 - Bug] test_checkin_notification_includes_url patch target adjusted**
- **Found during:** Task 3 — patching `app.services.checkin_service.PushoverClient` fails with AttributeError because the stub module has no PushoverClient import yet
- **Fix:** Changed patch target to `app.services.pushover.PushoverClient`; the stub still raises NotImplementedError before the mock is used, keeping the test RED on NotImplementedError (not AttributeError/ImportError)
- **Files modified:** backend/tests/test_updates.py
- **Commit:** 3009101

## Verification Results

- `cd backend && python -m pytest tests/test_updates.py --collect-only -q` → 10 tests, zero collection errors
- `cd backend && python -m alembic heads` → `0015 (head)`
- `cd backend && python -c "import app.main, rapidfuzz"` → exits 0
- `cd backend && python -m pytest --collect-only -q` → 153 tests collected, no errors
- All 10 tests RED: NotImplementedError (resolution/scheduler stubs) or AssertionError on wrong HTTP status (ingest v1.1 not yet wired, check-in-time endpoint not yet created)

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `resolve_update` raises NotImplementedError | backend/app/services/resolution_service.py | 12-02 implements |
| `_parse_intent` raises NotImplementedError | backend/app/services/resolution_service.py | 12-02 implements |
| `send_checkin_notification` raises NotImplementedError | backend/app/services/checkin_service.py | 12-03 implements |
| `schedule_checkin` raises NotImplementedError | backend/app/scheduler.py | 12-03 implements |
| `router` in updates.py has no routes | backend/app/routers/updates.py | 12-02 adds /resolve endpoint |
| GET/PUT `/api/v1/settings/check-in-time` → 404 | (not yet created) | 12-03 adds endpoint |
| `schema_version: "1.1"` → 422 | backend/app/schemas/ingest.py | 12-04 extends IngestPayload |

All stubs are intentional Wave 0 placeholders. They do not prevent this plan's goal (clean collection + RED tests). Wave 2 plans resolve each stub.

## Self-Check: PASSED

Files confirmed present:
- backend/app/schemas/update.py — FOUND
- backend/app/services/resolution_service.py — FOUND
- backend/app/services/checkin_service.py — FOUND
- backend/migrations/versions/0015_add_checkin_and_update_log.py — FOUND
- backend/app/routers/updates.py — FOUND
- backend/tests/test_updates.py — FOUND

Commits confirmed:
- 91245a4 — FOUND
- b1e8173 — FOUND
- 3009101 — FOUND
