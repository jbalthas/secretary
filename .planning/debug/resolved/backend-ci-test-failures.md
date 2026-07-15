---
status: resolved
trigger: "Investigate issue: backend-ci-test-failures"
created: 2026-07-15T00:00:00Z
updated: 2026-07-15T15:50:00Z
---

## Current Focus

hypothesis: CONFIRMED and fixed - see Resolution section. All 3 root causes found and fixed: (1) event-loop RuntimeError from pytest-asyncio resetting the global loop policy, (2) test_brief.py leftover Goal rows breaking "empty state" assertions, (3) test_calendar.py TestClient auto-following a 302 into a nonexistent frontend route.
test: ran full `uv run python -m pytest -q` suite 3x fresh (deleted test_secretary.db each time to match CI clean checkout).
expecting: 209 passed, 0 failed, 0 errors, all 3 runs.
next_action: none - resolved. Confirmed fixed by user: commit bb47239 pushed to origin/master, GitHub Actions run 29450408105 completed successfully (backend job passed in 23s, all steps green including "Run tests").

## Symptoms

expected: `uv run pytest` (from backend/) passes cleanly, CI job goes green.
actual: |
  FAILED tests/test_calendar.py::test_callback_stores_credentials - assert 404 in (200, 302, 307)
   +  where 404 = <Response [404 Not Found]>.status_code
  FAILED tests/test_plan.py::test_staleness_detection - RuntimeError: There is no current event loop in thread 'MainThread'.
  ERROR tests/test_weekly_brief.py::test_webhook_range_invalid_value - RuntimeError: There is no current event loop in thread 'MainThread'.
  4 failed, 205 passed, 1 warning, 1 error in 10.83s
  (4th failed test not shown in excerpt - to be found by running pytest locally)
errors: |
  1. RuntimeError: There is no current event loop in thread 'MainThread' - test_plan.py::test_staleness_detection, test_weekly_brief.py::test_webhook_range_invalid_value (order-dependent flake suspected)
  2. test_callback_stores_credentials gets 404 instead of (200, 302, 307) - OAuth callback route possibly unreachable in test app
started: pre-existing on multiple recent master commits; previously deferred in Phase 16-01/16-03 notes, never fixed
reproduction: cd backend && uv run pytest

## Eliminated

## Evidence

- timestamp: 2026-07-15T00:00
  checked: backend/pyproject.toml, backend/tests/conftest.py
  found: requires-python >=3.12; pytest-asyncio>=0.23 in dev deps. conftest.py session-scoped create_test_db fixture uses asyncio.get_event_loop_policy().get_event_loop().run_until_complete() pattern at lines 19 and 37. grep found same pattern also in test_advisory_routes.py (6 call sites) and test_plan.py (1 call site, line 352).
  implication: matches prior hypothesis description; need to confirm actual Python version used in CI/local run (pyc cache shows cpython-313, contradicts requires-python >=3.12 statement - worth checking uv-managed python version).

- timestamp: 2026-07-15T00:05
  checked: ran `uv run python -m pytest -q` in backend/ with stale test_secretary.db present from a prior run
  found: 11 failed, 1 error (KeyError: 0, "assert 100 == 0" etc) - many more failures than CI reports
  implication: FALSE LEAD - stale sqlite test_secretary.db file (leftover, not gitignored/cleaned between runs) pollutes state and causes cascading failures unrelated to the real bug. Must delete test_secretary.db* before each run.

- timestamp: 2026-07-15T00:06
  checked: deleted test_secretary.db/-shm/-wal, reran full suite
  found: "4 failed, 205 passed, 1 warning, 1 error in 24.78s" - EXACTLY matches CI summary line. The 4 failures are test_brief.py::test_build_brief_body_empty_returns_placeholder, test_brief.py::test_build_brief_speech_empty, test_calendar.py::test_callback_stores_credentials, test_plan.py::test_staleness_detection (RuntimeError event loop). Plus 1 error: test_weekly_brief.py::test_webhook_range_invalid_value (RuntimeError event loop).
  implication: Reproduced exact CI failure set locally. Confirms 4th failed test (missed in original excerpt) is test_brief.py::test_build_brief_speech_empty (test_build_brief_body_empty_returns_placeholder is presumably a 5th? wait total is 4 - recount). Now investigate 3 distinct clusters: (a) test_brief.py x2 failures - new, not mentioned in original symptom report, (b) test_calendar.py 404, (c) event loop RuntimeError x2 (test_plan.py + test_weekly_brief.py).

- timestamp: 2026-07-15T00:10
  checked: isolated run `tests/test_advisory_service.py tests/test_weekly_brief.py::test_webhook_range_invalid_value`
  found: the "ERROR" reported against test_weekly_brief.py::test_webhook_range_invalid_value is actually raised during session-scoped `create_test_db` fixture TEARDOWN (conftest.py:37, `_teardown()` call), which pytest attributes to whichever test happened to run last in the session. Same RuntimeError root cause as test_plan.py::test_staleness_detection - by the time the session fixture tears down, pytest-asyncio (via async tests in test_advisory_service.py which use @pytest.mark.asyncio) has already reset asyncio's global loop policy state.
  implication: single root cause explains both the test_plan.py failure and the test_weekly_brief.py "error" - CONFIRMED root cause per hypothesis. Not two separate flakes, one mechanism.

- timestamp: 2026-07-15T00:15
  checked: grep for get_event_loop usage across backend/tests - found in conftest.py (2x: _setup/_teardown of session-scoped create_test_db fixture), test_advisory_routes.py (6x across test_preview_ok, test_confirm_ok, test_confirm_idempotent, test_last_sync_endpoint), test_plan.py (1x in test_staleness_detection). Also checked app/ code - no get_event_loop usage in application code, only in tests.
  implication: 9 call sites total need fixing.

- timestamp: 2026-07-15T00:20
  checked: whether swapping to plain per-call asyncio.run() would be safe - the session-scoped async SQLAlchemy engine/connection pool is shared across all these call sites AND across FastAPI TestClient's own async request handling (Starlette TestClient uses an anyio blocking portal thread with its own persistent loop for actual HTTP requests, already a THIRD loop distinct from these manual helper calls). Since the app already works correctly with the engine spanning at least 2 distinct loops (main-thread manual loop + TestClient portal loop) today, a THIRD stable dedicated loop is no additional risk. But asyncio.run() per call site would create/destroy a new loop on every single call (9 call sites, many invoked repeatedly), so the connection pool would need to churn a new aiosqlite connection bound to a fresh loop every time - a materially different lifecycle than "one shared main-thread loop" and higher risk of cross-loop connection reuse failures than the current implicit single-shared-loop behavior.
  implication: chose fix option (b) - a single dedicated `run_async()` helper backed by ONE module-level event loop created in conftest.py (not registered via asyncio's global policy, so pytest-asyncio can't touch/reset it), reused for the whole test session. This exactly preserves the original "one shared loop across the whole session" semantics while being fully decoupled from pytest-asyncio's per-test loop lifecycle.

- timestamp: 2026-07-15T00:30
  checked: implemented run_async() helper in conftest.py (module-level `_test_loop = asyncio.new_event_loop()`), updated conftest.py _setup/_teardown, test_advisory_routes.py (6 call sites + import), test_plan.py (1 call site + import) to use it. Ran full suite.
  found: "3 failed, 206 passed in 24.87s" - zero event-loop RuntimeErrors remain (was 2 broken: test_plan.py::test_staleness_detection + teardown error). Confirms fix works.
  implication: event-loop cluster FULLY RESOLVED. Remaining 3 failures are test_brief.py::test_build_brief_body_empty_returns_placeholder, test_brief.py::test_build_brief_speech_empty, test_calendar.py::test_callback_stores_credentials.

- timestamp: 2026-07-15T00:35
  checked: test_brief.py failing tests' assertions - "Good morning. You have 12 active goals. Top goals: Advisory Goal, Advisory Goal, Advisory Goal." instead of expected "Good morning. Nothing scheduled today."; checked app/services/brief.py build_brief_body/build_brief_speech - both query active Goal rows (select(Goal).where(Goal.status == "active")) in addition to tasks/events.
  found: test_build_brief_body_empty_returns_placeholder and test_build_brief_speech_empty only clear Task and CalendarEvent tables before asserting "nothing scheduled" - they never clear the Goal table. test_advisory_routes.py (runs alphabetically earlier: test_advisory_routes < test_brief) seeds Goal rows via _seed_goal() with status=active and never cleans them up (unlike fake_credentials_json/fake_sync_session fixtures in conftest.py which do clean up after themselves).
  implication: NOT related to the event-loop bug - separate test-isolation bug. These "empty state" tests need to also clear the Goal table for a genuinely empty state, matching their stated intent ("no tasks, no events -> Nothing scheduled today").

- timestamp: 2026-07-15T00:40
  checked: added `s.query(Goal).delete()` to both test_brief.py empty-state tests' cleanup blocks, reran full suite.
  found: "1 failed, 208 passed in 24.54s" - both test_brief.py failures fixed, no new regressions introduced elsewhere (no test later in alphabetical order appears to depend on goals seeded by test_advisory_routes.py persisting).
  implication: test_brief.py cluster FULLY RESOLVED. Only test_calendar.py::test_callback_stores_credentials (404) remains - proceeding to investigate that independently per fix_guidance.

- timestamp: 2026-07-15T00:45
  checked: read app/routers/auth.py fully - /auth/google/callback route exists, correctly returns RedirectResponse(url="/settings?connected=true", status_code=302) on success. Checked FastAPI's TestClient.__init__ signature - default `follow_redirects=True` (unlike raw httpx.Client which defaults to False). test_auth_redirect (passing test, same file) explicitly passes `follow_redirects=False`; test_callback_stores_credentials did NOT.
  found: reproduced manually with a scratch script hitting the same app: with follow_redirects=False, GET /auth/google/callback returns 302 to /settings?connected=true (correct, matches test expectation). With follow_redirects=True (the test's actual behavior, since it never set the flag), TestClient chases the redirect and issues a second GET to /settings?connected=true, which has no backend route (frontend-only SPA route, served by nginx/static hosting in prod, absent from the FastAPI test app) - THAT second request is what returns 404, not the callback route itself.
  implication: ROOT CAUSE CONFIRMED - test bug, not application bug. test_callback_stores_credentials omits `follow_redirects=False` (present on the sibling test_auth_redirect for the same reason), so TestClient's default auto-follow chases the 302 into a route that doesn't exist in the backend-only test app.

- timestamp: 2026-07-15T00:50
  checked: added `follow_redirects=False` to the client.get() call in test_callback_stores_credentials, reran full suite fresh (deleted test_secretary.db first).
  found: "209 passed in 24.18s" - zero failures, zero errors. Reran two more times (fresh test_secretary.db deleted before each run, matching CI's clean-checkout behavior): "209 passed in 24.13s", "209 passed in 24.63s". Fully stable across 3 consecutive full-suite runs.
  implication: All 3 failure clusters resolved. 209 distinct test items collected (the earlier "210 collected" figure in the task included the fixture-teardown error in its arithmetic, not a 210th distinct test item - 205 passed + 4 failed = 209 real items + 1 non-item fixture teardown error summed to "210" in the original loose count).

## Resolution

root_cause: |
  Three independent, previously-conflated root causes:

  1. EVENT LOOP RuntimeError (test_plan.py::test_staleness_detection failure +
     test_weekly_brief.py::test_webhook_range_invalid_value "error"): Both were
     caused by the SAME single mechanism, not two separate flakes. Tests in
     test_advisory_service.py (@pytest.mark.asyncio, alphabetically earlier)
     are run by pytest-asyncio using its own function-scoped event loop, which
     is created and torn down per test. This resets asyncio's global loop
     policy thread-local state (_local._loop = None while _local._set_called
     stays True). Any LATER plain-sync-test call to
     asyncio.get_event_loop_policy().get_event_loop() (used in conftest.py's
     session-scoped create_test_db fixture teardown, and in
     test_advisory_routes.py / test_plan.py to run manual async DB setup
     helpers) then hits the "no current loop" branch, which only auto-creates
     a new loop when _set_called is False - so it raises RuntimeError instead.
     The test_weekly_brief.py "error" was actually the create_test_db fixture's
     session-teardown call failing at the very end of the run; pytest
     attributes session-fixture teardown errors to whichever test ran last.

  2. test_brief.py test isolation bug (test_build_brief_body_empty_returns_placeholder,
     test_build_brief_speech_empty): app/services/brief.py's build_brief_body()
     and build_brief_speech() both include active Goal rows in their output.
     These two tests only cleared the Task and CalendarEvent tables before
     asserting "nothing scheduled", never the Goal table. test_advisory_routes.py
     (alphabetically earlier) seeds Goal rows via _seed_goal() with
     status=active and never cleans them up, so leftover goals leaked into
     these "empty state" assertions.

  3. test_calendar.py::test_callback_stores_credentials 404: not an application
     bug. FastAPI's TestClient defaults follow_redirects=True (unlike raw
     httpx.Client). The test never set follow_redirects=False, so after
     GET /auth/google/callback correctly returned 302 to
     /settings?connected=true, TestClient auto-followed that redirect into a
     second request - and /settings is a frontend-only SPA route with no
     backend handler, so THAT second, unintended request is what produced the
     observed 404.

fix: |
  1. Added a `run_async(coro)` helper in tests/conftest.py backed by a single
     module-level `asyncio.new_event_loop()` created at import time, entirely
     independent of asyncio's global event loop policy (so pytest-asyncio's
     per-test loop teardown can't invalidate it). Replaced all 9 call sites of
     `asyncio.get_event_loop_policy().get_event_loop().run_until_complete(...)`
     (2 in conftest.py, 6 in test_advisory_routes.py, 1 in test_plan.py) with
     `run_async(...)`. This preserves the original "one shared loop for the
     whole session" semantics (verified safe given the app's async DB engine
     already spans multiple independent loops today via TestClient's own
     anyio portal thread) while avoiding asyncio.run()-per-call-site's higher
     risk of cross-loop connection-pool reuse failures.
  2. Added `s.query(Goal).delete()` to the DB-clearing block in both
     test_brief.py "empty state" tests, alongside the existing Task and
     CalendarEvent clears.
  3. Added `follow_redirects=False` to the `client.get(...)` call in
     test_callback_stores_credentials, matching the pattern already used by
     the sibling test_auth_redirect test in the same file.

verification: |
  Ran `uv run python -m pytest -q` from backend/ three consecutive times,
  deleting test_secretary.db/-shm/-wal before each run to match CI's clean
  checkout. All three runs: "209 passed" with zero failures/errors. No new
  regressions introduced (full suite green, not just the previously-failing
  tests). Also confirmed the unrelated stale test_secretary.db file (leftover
  from earlier local runs, not present in a fresh CI checkout) is a separate,
  pre-existing local-dev confound unrelated to the CI failures - deleting it
  before each run reproduced the exact CI failure signature before the fix
  was applied, confirming the repro was accurate.
files_changed:
  - backend/tests/conftest.py
  - backend/tests/test_advisory_routes.py
  - backend/tests/test_plan.py
  - backend/tests/test_brief.py
  - backend/tests/test_calendar.py
