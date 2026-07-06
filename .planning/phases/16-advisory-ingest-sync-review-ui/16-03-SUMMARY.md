---
phase: 16-advisory-ingest-sync-review-ui
plan: 03
subsystem: api
tags: [fastapi, async, advisory, http, ci, grep-guard]

# Dependency graph
requires:
  - phase: 16-advisory-ingest-sync-review-ui/16-02
    provides: advisory_service.dry_run_advisory + apply_advisory (async, atomic, idempotent)
  - phase: 16-advisory-ingest-sync-review-ui/16-01
    provides: AdvisoryPayload, AdvisoryPreviewResult, AdvisoryResult, AdvisoryConfirmRequest schemas; AppSettings.last_advisory_at
provides:
  - "GET /api/v1/advisory/schema, POST /api/v1/advisory/preview, POST /api/v1/advisory/confirm, GET /api/v1/advisory/last-sync HTTP routes"
  - "advisory.router registered in main.py alongside ingest.router"
  - "ValueError -> HTTP 422 mapping for unknown goal/milestone external_key on preview and confirm"
  - "route-level test coverage (schema/preview/confirm/last-sync, 200 and 422 paths, idempotency)"
  - "CI workflow (.github/workflows/ci.yml) with LLM-import grep guard + backend test job"
affects: [16-04-sync-review-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "advisory router mirrors routers/ingest.py exactly: async def routes, Depends(get_session), response_model on preview/confirm"
    - "ValueError from advisory_service caught in route and re-raised as HTTPException(422, detail=str(e)) — same shape as ingest_service errors"
    - "GET /last-sync returns a plain dict {last_advisory_at: iso|null} — no dedicated response model needed for a single-field read"

key-files:
  created:
    - backend/app/routers/advisory.py
    - backend/tests/test_advisory_routes.py
    - .github/workflows/ci.yml
  modified:
    - backend/app/main.py

key-decisions:
  - "No existing .github/workflows directory — created a new minimal ci.yml (backend job: LLM-import grep guard + uv sync + pytest) rather than assuming one existed"
  - "test_advisory_routes.py uses asyncio.get_event_loop_policy().get_event_loop().run_until_complete(...) for goal-seeding helpers, matching the sync TestClient + async seed pattern already used in test_ingest.py-adjacent async DB setup helpers"

patterns-established:
  - "Route-level 422 test for unknown external_key mirrors the schema-level 422 test for missing rationale — both assert on the same HTTP boundary"

requirements-completed: [ADVISE-01, ADVISE-02, ADVISE-05]

# Metrics
duration: ~25min
completed: 2026-07-06
---

# Phase 16 Plan 03: Advisory HTTP Routes + CI Grep Guard Summary

**Async advisory router (schema/preview/confirm/last-sync) mirroring the existing ingest router pattern exactly, registered in main.py, with 7 route-level tests and a new CI workflow enforcing the no-server-side-LLM constraint via grep.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-06T00:53:00Z
- **Completed:** 2026-07-06T01:18:54Z
- **Tasks:** 3 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `backend/app/routers/advisory.py` exposes `GET /schema`, `POST /preview`, `POST /confirm`, `GET /last-sync` — all `async def` on `Depends(get_session)`, mirroring `routers/ingest.py`
- `ValueError` from `advisory_service` (unknown goal/milestone `external_key`) is caught in the route layer and converted to `HTTPException(422, ...)` on both `/preview` and `/confirm`
- `advisory.router` registered in `main.py` immediately after `ingest.router`, no reordering of existing registrations
- 7 route-level tests: schema shape, preview 200 (no DB writes), preview 422 (missing rationale via Pydantic, unknown goal via service ValueError), confirm 200 + idempotent replay, last-sync returns non-null ISO string after a confirm
- `.github/workflows/ci.yml` created (no prior workflow existed) with a backend job running the LLM-import grep guard followed by `uv sync` + `pytest`
- Locally verified: `grep -rE "anthropic|openai|litellm" backend/app/` returns no matches — guard passes

## Task Commits

1. **Task 1: advisory router + main.py registration** - `cf912be` (feat)
2. **Task 2: route-level tests (200/422, no-writes, idempotent)** - `d53af83` (test)
3. **Task 3: CI LLM-import grep guard** - `6bfcc48` (chore)

## Files Created/Modified
- `backend/app/routers/advisory.py` - 4 async routes (schema/preview/confirm/last-sync), 422 mapping
- `backend/app/main.py` - `advisory` import added to routers group; `app.include_router(advisory.router)` added after `ingest.router`
- `backend/tests/test_advisory_routes.py` - 7 tests using sync `TestClient` + `asyncio.get_event_loop_policy().get_event_loop().run_until_complete(...)` for goal seeding (mirrors `_seed_goal` pattern from `test_advisory_service.py`, with per-run unique keys via `_uid()`)
- `.github/workflows/ci.yml` - new file: backend job with grep guard step + pytest step

## Decisions Made
- No `.github/workflows/` directory existed prior to this plan — created `ci.yml` fresh rather than assuming an existing workflow to extend, per the task's fallback instruction
- Reused the `_uid(prefix)` unique-ID helper pattern from `test_advisory_service.py` (16-02) in the new route test file to avoid the same cross-test DB collision issue documented in the 16-02 SUMMARY

## Deviations from Plan

None — plan executed exactly as written. All four routes, the 422 mapping, main.py registration, and the CI guard step match the locked `<interfaces>` spec.

## Issues Encountered

- Full backend suite (`pytest -q`, no deselects) shows 4 failures (`test_brief.py::test_build_brief_body_empty_returns_placeholder`, `test_brief.py::test_build_brief_speech_empty`, `test_calendar.py::test_callback_stores_credentials`, `test_plan.py::test_staleness_detection`) plus 1 teardown error. All confirmed **pre-existing and order-dependent**, not caused by this plan's files:
  - `test_calendar.py::test_callback_stores_credentials` was already logged as pre-existing in the 16-01 SUMMARY (fails on pre-Phase-16 code).
  - The `test_brief.py`/`test_plan.py` failures stem from the shared `session`-scoped test DB (`conftest.py::create_test_db`) accumulating rows across test files with no per-test isolation; `test_advisory_service.py` (16-02) seeds goals titled "Advisory Goal" that leak into `test_brief.py`'s "empty state" assertions. Confirmed by re-running the full suite with `test_advisory_routes.py` excluded — the same class of order-dependent failures appears (different specific tests fail, proving the root cause is the shared-DB fixture, not this plan's new test file).
  - `tests/test_advisory_routes.py -q` in isolation (the plan's own verification gate): **7/7 passed**. Full suite `-x -q` sequential-stop check on just this plan's own new file plus everything before it in collection order also passes cleanly.
  - Logged in detail to `.planning/phases/16-advisory-ingest-sync-review-ui/deferred-items.md` as a test-infrastructure issue (out of scope for this plan; would require refactoring `conftest.py` isolation, e.g. function-scoped DB or per-test transaction rollback).

## User Setup Required

None - no external service configuration required. The new CI workflow will run automatically on the next push/PR to GitHub (requires `secrets`/environment nothing beyond default `GITHUB_TOKEN`).

## Next Phase Readiness
- `/api/v1/advisory/preview`, `/api/v1/advisory/confirm`, `/api/v1/advisory/schema`, `/api/v1/advisory/last-sync` are live and ready for the 16-04 Sync Review UI to call
- `last-sync` gives 16-04's header line ("last synced ...") a real backend data source
- CI guard is in place ahead of any future LLM-adjacent code touching `backend/app/`
- No blockers

---
*Phase: 16-advisory-ingest-sync-review-ui*
*Completed: 2026-07-06*

## Self-Check: PASSED

Files verified present:
- backend/app/routers/advisory.py: FOUND
- backend/app/main.py: FOUND
- backend/tests/test_advisory_routes.py: FOUND
- .github/workflows/ci.yml: FOUND
- .planning/phases/16-advisory-ingest-sync-review-ui/16-03-SUMMARY.md: FOUND (this file)

Commits verified present:
- cf912be (Task 1): FOUND
- d53af83 (Task 2): FOUND
- 6bfcc48 (Task 3): FOUND
