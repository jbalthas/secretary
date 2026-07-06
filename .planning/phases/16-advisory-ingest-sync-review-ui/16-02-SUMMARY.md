---
phase: 16-advisory-ingest-sync-review-ui
plan: 02
subsystem: api
tags: [sqlalchemy, pydantic, advisory, ingest, idempotency, atomic, dry-run]

# Dependency graph
requires:
  - phase: 16-advisory-ingest-sync-review-ui/16-01
    provides: AdvisoryPayload + GoalAdjustment + MilestoneAdjustment + TaskCreation schemas, AdvisoryLog model, AppSettings.last_advisory_at, Goal.priority_rank
  - phase: 8-goals-ingest-backend
    provides: ingest_service._upsert_task + _exists + apply_import flush+goal_key_to_id pattern
provides:
  - dry_run_advisory: read-only field-level diff (goals/milestones/new_tasks) with no DB writes
  - apply_advisory: atomic (session.begin) + idempotent (AdvisoryLog) advisory application
  - AdvisoryFieldChange + AdvisoryEntityDiff + AdvisoryPreviewResult + AdvisoryResult + AdvisoryConfirmRequest schemas
  - TaskImport.estimated_minutes extension (benefits ingest path too)
  - _upsert_task carries estimated_minutes on create AND update branches
  - 9 high-value correctness tests: no-writes, field-level-diff, unknown-key, atomic-rollback, idempotent-replay, notes-not-persisted, new-task-upsert, estimated-minutes, milestone-rename
affects: [16-03-advisory-routes, 16-04-sync-review-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "apply_advisory idempotency: SELECT AdvisoryLog by advisory_id before any writes; if found, deserialize result_json and return with replayed=True"
    - "Atomic advisory apply: single async with session.begin() around goals->milestones->tasks write sequence; DB error mid-apply leaves zero rows persisted"
    - "New task external_key: f'advisory-{advisory_id}-{i}' stable per-advisory stable slug; re-confirm resolves same Task.external_key UNIQUE row"
    - "Goal key caching: goal_key_to_id dict built from adjusted goals, extended lazily by _resolve_goal_id for milestone/task lookups without extra queries"
    - "Test isolation: _uid(prefix) generates uuid-suffixed keys per test run to prevent cross-run DB state collisions in the session-scoped test DB"

key-files:
  created:
    - backend/app/services/advisory_service.py
    - backend/tests/test_advisory_service.py
  modified:
    - backend/app/schemas/advisory.py
    - backend/app/schemas/ingest.py
    - backend/app/services/ingest_service.py

key-decisions:
  - "Session rollback before session.begin(): the idempotency SELECT auto-begins a transaction; calling await session.rollback() after the no-op check lets session.begin() open a fresh single transaction for the apply (avoids 'transaction already active' error)"
  - "Test isolation via _uid(prefix): hardcoded advisory_id/external_key strings collide when advisory tests run in the same pytest session-scoped DB as each other or as advisory_schema tests; replaced all hardcoded IDs with uuid-suffixed keys generated fresh per test"
  - "Teardown RuntimeError in conftest is pre-existing: asyncio.get_event_loop_policy().get_event_loop() fails post-pytest-asyncio teardown; does not affect test pass/fail, already documented in 16-01 SUMMARY"
  - "notes field: read-only in dry_run_advisory response (payload.notes forwarded to AdvisoryPreviewResult.notes), never assigned to any Goal/Milestone/Task field in apply_advisory (ADVISE-06)"

patterns-established:
  - "advisory_service.apply_advisory: idempotency check -> rollback -> session.begin() block -> result -> AdvisoryLog.add"
  - "_resolve_goal_id: cached lookup helper defined inside apply_advisory to avoid repeated SELECT Goal queries for goals not in the adjustment list"

requirements-completed: [ADVISE-02, ADVISE-04, ADVISE-05, ADVISE-06, ADVISE-08]

# Metrics
duration: ~30min
completed: 2026-07-05
---

# Phase 16 Plan 02: Advisory Service (dry_run + apply, atomic + idempotent) Summary

**Async advisory service with read-only field-level diff preview and atomic+idempotent confirm that reuses ingest_service._upsert_task for new tasks, persists estimated_minutes, and stamps last_advisory_at — all behind an AdvisoryLog idempotency gate.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-07-05T00:00:00Z
- **Completed:** 2026-07-05T00:30:00Z
- **Tasks:** 2 completed (Task 1 was committed at c8dbbc4 prior to this session)
- **Files modified:** 5 (2 created, 3 modified in Task 1 + 2)

## Accomplishments
- `dry_run_advisory` performs zero DB writes and returns `AdvisoryFieldChange`-level diff for goal adjustments, milestone adjustments (including title rename preview), and new task creations
- `apply_advisory` wraps all writes in `async with session.begin()` (full atomicity); idempotent on `advisory_id` via `AdvisoryLog` SELECT before any write
- New tasks reuse `ingest_service._upsert_task` directly (no fork), keyed as `f"advisory-{advisory_id}-{i}"` for stable re-confirm
- `estimated_minutes` persists from `TaskCreation` -> `TaskImport` -> `Task.estimated_minutes` on create AND update branches
- `last_advisory_at` stamped on `AppSettings` inside the apply transaction
- 9 passing tests covering all key correctness properties: atomic rollback, idempotent replay, no-writes preview, notes-not-persisted, field-level diff, new-task upsert, estimated-minutes persistence, milestone rename

## Task Commits

1. **Task 1: diff/result/confirm schemas + TaskImport.estimated_minutes extension** - `c8dbbc4` (feat)
2. **Task 2: advisory_service preview + apply + tests** - `98d0e78` (feat)

## Files Created/Modified
- `backend/app/services/advisory_service.py` - dry_run_advisory + apply_advisory (110 lines)
- `backend/tests/test_advisory_service.py` - 9 correctness tests with per-run unique IDs
- `backend/app/schemas/advisory.py` - AdvisoryFieldChange, AdvisoryEntityDiff, AdvisoryPreviewResult, AdvisoryResult, AdvisoryConfirmRequest appended
- `backend/app/schemas/ingest.py` - TaskImport.estimated_minutes field added
- `backend/app/services/ingest_service.py` - _upsert_task sets Task.estimated_minutes on create and update

## Decisions Made
- Session rollback before `session.begin()`: the idempotency SELECT auto-begins a transaction; `await session.rollback()` after the early-return path clears it so the `async with session.begin()` block opens cleanly
- Test IDs use `uuid.uuid4().hex[:8]` suffix via `_uid()` helper to prevent cross-run collisions in the session-scoped test DB
- `_resolve_goal_id` defined as inner async function inside `apply_advisory` to cache `goal_key_to_id` lookups without leaking state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Test isolation: unique per-run IDs to prevent cross-test DB collisions**
- **Found during:** Task 2 — tests passed alone but failed when run alongside test_advisory_schema.py
- **Issue:** Hardcoded `advisory_id` strings like `"idem-id-1"` collide in the session-scoped shared test DB; second run finds the AdvisoryLog row and incorrectly returns `replayed=True` on the first confirm
- **Fix:** Added `_uid(prefix)` helper using `uuid.uuid4().hex[:8]`; replaced all hardcoded advisory IDs and goal external_keys with unique-per-run values
- **Files modified:** `backend/tests/test_advisory_service.py`
- **Verification:** `uv run python -m pytest tests/test_advisory_service.py tests/test_advisory_schema.py -q` -> 19 passed
- **Committed in:** `98d0e78` (Task 2 commit, same commit as the service)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical test isolation)
**Impact on plan:** Necessary for test suite correctness. No scope creep.

## Issues Encountered
- Pre-existing teardown `RuntimeError` in conftest.py (`asyncio.get_event_loop_policy().get_event_loop()` fails post-pytest-asyncio) appears as ERROR at teardown of whichever test runs last; does not fail any test; was already present in 16-01 SUMMARY
- Pre-existing test failures in `test_brief.py`, `test_calendar.py`, `test_plan.py` (test ordering / DB state pollution from shared session-scoped fixture) confirmed pre-existing — unrelated to plan 16-02 files; not introduced by this plan

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `advisory_service.dry_run_advisory` and `apply_advisory` ready for 16-03 route layer to call
- `AdvisoryConfirmRequest` schema ready for the `/advisory/confirm` POST body
- `AdvisoryPreviewResult` ready for the `/advisory/preview` GET response
- No blockers

---
*Phase: 16-advisory-ingest-sync-review-ui*
*Completed: 2026-07-05*

## Self-Check: PASSED

Files verified present:
- backend/app/services/advisory_service.py: FOUND
- backend/tests/test_advisory_service.py: FOUND
- .planning/phases/16-advisory-ingest-sync-review-ui/16-02-SUMMARY.md: FOUND (this file)

Commits verified present:
- c8dbbc4 (Task 1): FOUND
- 98d0e78 (Task 2): FOUND
