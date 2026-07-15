# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## backend-ci-test-failures — order-dependent pytest event-loop RuntimeError + test state leaks causing CI failures
- **Date:** 2026-07-15
- **Error patterns:** RuntimeError, no current event loop, MainThread, test_staleness_detection, test_webhook_range_invalid_value, test_callback_stores_credentials, 404, assert 404 in (200, 302, 307), pytest-asyncio, event loop policy, follow_redirects, Goal rows leaking, empty state assertion
- **Root cause:** Three independent causes: (1) pytest-asyncio's per-test event loop teardown reset asyncio's global loop policy thread-local state, so later sync tests calling asyncio.get_event_loop_policy().get_event_loop() raised RuntimeError instead of auto-creating a loop; (2) test_brief.py "empty state" tests never cleared the Goal table, so Goal rows seeded by an earlier-running test file leaked into brief output assertions; (3) FastAPI TestClient defaults follow_redirects=True (unlike raw httpx.Client) and test_callback_stores_credentials never set follow_redirects=False, so it auto-followed the 302 from /auth/google/callback into /settings (a frontend-only SPA route with no backend handler), producing a spurious 404 unrelated to the callback route itself.
- **Fix:** Added a `run_async(coro)` helper in tests/conftest.py backed by one module-level `asyncio.new_event_loop()` (independent of asyncio's global policy so pytest-asyncio can't reset it); replaced all 9 call sites of `asyncio.get_event_loop_policy().get_event_loop().run_until_complete(...)` across conftest.py, test_advisory_routes.py, and test_plan.py with `run_async(...)`. Added `s.query(Goal).delete()` to both test_brief.py empty-state test cleanup blocks. Added `follow_redirects=False` to the client.get() call in test_callback_stores_credentials.
- **Files changed:** backend/tests/conftest.py, backend/tests/test_advisory_routes.py, backend/tests/test_plan.py, backend/tests/test_brief.py, backend/tests/test_calendar.py
---
