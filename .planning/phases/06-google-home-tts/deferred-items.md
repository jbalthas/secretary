# Deferred Items — Phase 06 Google Home TTS

## From Plan 02

### Test isolation pollution in full suite

**Discovered:** Plan 02 — Task 2 verification (full suite run)

**Issue:** Running `pytest tests/` causes `test_settings.py::test_set_tts_enabled` (which commits `tts_enabled=False` to `test_secretary.db`) to run before `test_tts.py::test_tts_endpoint_calls_speak` and `test_tts_endpoint_enabled` (alphabetical ordering: settings < tts). Those TTS tests expect `tts_enabled=True` (default, no row) but find `False` in the DB.

**Impact:** Two tests fail when running the full suite together. They pass correctly when run via the plan's verification command (`pytest tests/test_tts.py tests/test_settings.py::test_get_tts_enabled tests/test_settings.py::test_set_tts_enabled`).

**Fix options:**
1. Add per-test cleanup fixture in `conftest.py` that deletes/resets the `app_settings` row after each test
2. Add `autouse=True` fixtures in individual test modules that reset relevant DB state
3. Use pytest ordering plugin to enforce test file execution order

**Owner:** Future cleanup sprint or Phase 06 completion sweep
