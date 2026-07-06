# Deferred Items — Phase 15

## Pre-existing test failure (out of scope for plan 15-02)

- **test:** `backend/tests/test_calendar.py::test_callback_stores_credentials`
- **status:** fails with 404 (route `/auth/google/callback` returns 404)
- **verified pre-existing:** stashed all 15-02 working changes and the test still fails — unrelated to export work (CAL-02 OAuth callback, not EXPORT-*)
- **action:** NOT fixed (scope boundary — only auto-fix issues caused by current task's changes)
