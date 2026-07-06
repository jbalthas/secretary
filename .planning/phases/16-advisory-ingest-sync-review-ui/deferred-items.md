# Deferred Items — Phase 16

Out-of-scope issues discovered during execution but not fixed (per scope boundary rules).

## test_calendar.py::test_callback_stores_credentials (pre-existing failure)

- **Found during:** 16-01 Task 2 verification (full-suite run)
- **Status:** Fails on `master`/pre-Phase-16 code too (confirmed via `git stash` + isolated run) — returns 404 instead of 200/302/307 on `/auth/google/callback`
- **Scope:** Unrelated to advisory schemas/models/migration work in this plan; not touched by any 16-01 file
- **Action:** Not fixed — out of scope for Phase 16. Flag for separate investigation.

## Shared session-scoped test DB pollution / test-order flakiness (pre-existing)

- **Found during:** 16-03 Task 2 verification (full-suite run)
- **Symptom:** `test_brief.py::test_build_brief_body_empty_returns_placeholder`, `test_brief.py::test_build_brief_speech_empty`, and `test_plan.py::test_staleness_detection` fail intermittently depending on test execution order/selection, because `conftest.py`'s `create_test_db` fixture is `scope="session"` and no test cleans up the goals/tasks it creates. `test_advisory_service.py` (from 16-02) seeds several goals titled "Advisory Goal" that leak into `test_brief.py`'s "empty state" assertions when run in the same session.
- **Confirmed pre-existing:** Reproduced with `test_advisory_routes.py` entirely absent and with a different test subset (`--ignore=tests/test_advisory_routes.py`), which surfaces a *different* set of order-dependent failures (`test_goals.py`, `test_ingest.py`, `test_plan.py` cases) — proving the flakiness is inherent to the shared session-scoped DB fixture, not caused by any 16-03 file.
- **Scope:** Test infrastructure issue (`conftest.py` fixture scope/isolation), not the advisory router/service code. Already flagged qualitatively in 16-02 SUMMARY.md ("Pre-existing test failures... confirmed pre-existing").
- **Action:** Not fixed — out of scope for Phase 16 (would require refactoring `conftest.py` test isolation, e.g. per-test transactions/rollback or function-scoped DB). `tests/test_advisory_routes.py -q` passes 7/7 in isolation; this is the plan's own verification gate. Flag for a dedicated test-infra cleanup task.
