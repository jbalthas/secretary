# Deferred Items — Phase 09 goals-ingest-ui

Out-of-scope discoveries logged during execution (not fixed — see GSD scope boundary rule).

| Discovered in | Item | Status |
|---------------|------|--------|
| 09-01 | `backend/tests/test_calendar.py::test_callback_stores_credentials` fails on master (pre-existing, unrelated to ingest preview). Verified failing with this plan's changes stashed. | Deferred — pre-existing, not caused by 09-01 |
| 09-04 | Same `test_callback_stores_credentials` failure still present (HTTP 404). 09-04 changed only frontend files; backend untouched. | Deferred — pre-existing, out of scope |
