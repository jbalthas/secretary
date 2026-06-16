# Deferred Items — Phase 07

Out-of-scope discoveries logged during execution. NOT fixed here.

## Pre-existing test failure (out of scope)

- **Test:** `backend/tests/test_calendar.py::test_callback_stores_credentials`
- **Symptom:** `assert 404 in (200, 302, 307)` — the OAuth callback route returns 404.
- **Status:** Fails identically on `master` (commit 588893e) BEFORE any Plan 02 changes
  (verified via `git stash` + run). It is unrelated to the Outlook ICS sync work
  (no `start_dt`/sync engine involvement) — it concerns the Google OAuth callback
  route registration.
- **Action:** Left untouched per the executor Scope Boundary (only auto-fix issues
  directly caused by this plan's changes). Should be triaged separately.
