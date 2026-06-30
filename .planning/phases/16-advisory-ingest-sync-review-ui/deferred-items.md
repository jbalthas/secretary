# Deferred Items — Phase 16

Out-of-scope issues discovered during execution but not fixed (per scope boundary rules).

## test_calendar.py::test_callback_stores_credentials (pre-existing failure)

- **Found during:** 16-01 Task 2 verification (full-suite run)
- **Status:** Fails on `master`/pre-Phase-16 code too (confirmed via `git stash` + isolated run) — returns 404 instead of 200/302/307 on `/auth/google/callback`
- **Scope:** Unrelated to advisory schemas/models/migration work in this plan; not touched by any 16-01 file
- **Action:** Not fixed — out of scope for Phase 16. Flag for separate investigation.
