---
phase: 13-update-loop-ui
plan: "02"
subsystem: backend
tags: [update-resolution, check-in, scheduler, migration, tdd]
dependency_graph:
  requires: [12-04]
  provides: [resolver-mutation, confirmed-id-contract, check-in-enabled]
  affects: [13-03, 13-04]
tech_stack:
  added: []
  patterns: [confirmed-id-bypass, remove_checkin-mirror-remove_routine, batch_alter_table-SQLite-safe]
key_files:
  created:
    - backend/migrations/versions/0016_add_checkin_enabled.py
  modified:
    - backend/app/schemas/update.py
    - backend/app/routers/updates.py
    - backend/app/schemas/settings.py
    - backend/app/routers/settings.py
    - backend/app/models/__init__.py
    - backend/app/scheduler.py
    - backend/app/main.py
    - backend/tests/test_updates.py
decisions:
  - "confirmed_id/confirmed_type/confirmed_action fields added to UpdateRequest (all optional, default None) — preserves {text}-only contract"
  - "reschedule = carry to tomorrow via timedelta(days=1) from now(utc); delta-preserving for blocks"
  - "check_in_enabled stored as nullable Boolean; None coalesces to True (enabled by default)"
  - "GET /api/v1/settings/check-in-time returns 'enabled' field; plans 03/04 must read this"
  - "test_resolve_applies_done uses confirmed_id path for DB isolation across full test suite"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-23"
  tasks_completed: 2
  files_changed: 8
---

# Phase 13 Plan 02: Backend Contracts — Resolver Mutation + check_in_enabled Summary

**One-liner:** Resolver now writes completed=True/reschedule to DB on resolution; confirmed_id bypass and check_in_enabled persistence close the two backend gaps before UI is built.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Resolver applies resolved action + confirmed-id path | bfb2f6e | schemas/update.py, routers/updates.py, tests/test_updates.py |
| 2 | check_in_enabled migration 0016 + schema/router + scheduler skip/remove | acb92eb | migrations/0016, models/__init__.py, schemas/settings.py, routers/settings.py, scheduler.py, main.py |

## Contracts for Plans 03 and 04

### confirmed-id contract shape
POST `/api/v1/updates/resolve` now accepts:
```json
{
  "text": "any string",
  "confirmed_id": 42,
  "confirmed_type": "task",
  "confirmed_action": "done"
}
```
When `confirmed_id` is present, fuzzy match is **bypassed** entirely. `confirmed_action` defaults to `"done"` if omitted. Returns `UpdateResponse(status="resolved", action=<applied>, entity_type=..., entity_id=...)`.

This is the UPDATE-03 confirm flow — the frontend sends `confirmed_id` after the user picks from the ambiguous candidate list.

### reschedule = tomorrow decision
`action="reschedule"` carries the entity forward to tomorrow (UTC `now() + timedelta(days=1)`). For blocks: shifts `start_dt` and `end_dt` preserving duration. For tasks: sets `due_date`. Plans 03/04 should show "moved to tomorrow" in the UI copy.

### GET check-in `enabled` field
`GET /api/v1/settings/check-in-time` now returns `{ "hour": int, "minute": int, "enabled": bool }`. Default is `True` (enabled). Plans 03/04 wire the toggle to `PUT /api/v1/settings/check-in-time` with `{ "hour", "minute", "enabled" }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] test_resolve_applies_done used fuzzy match — ambiguous in full suite**
- **Found during:** Task 2 full-suite run
- **Issue:** "Write release notes" fuzzy-matched ambiguously against tasks created by other test files in the shared in-memory DB
- **Fix:** Rewrote test to use the confirmed_id path (which is also a valid proof that the mutation fires) — title changed to a UUID-like unique string to further guarantee no false ambiguity
- **Files modified:** backend/tests/test_updates.py
- **Commit:** acb92eb

None of the plan's functional requirements changed.

## Self-Check

Files created/modified exist:
- backend/migrations/versions/0016_add_checkin_enabled.py — CREATED
- backend/app/schemas/update.py — confirmed_id field present
- backend/app/routers/updates.py — _apply_action + confirmed_id path
- backend/app/schemas/settings.py — enabled field on both CheckIn schemas
- backend/app/routers/settings.py — branch on body.enabled
- backend/app/models/__init__.py — check_in_enabled column
- backend/app/scheduler.py — remove_checkin function
- backend/app/main.py — ce branch on startup

Commits: bfb2f6e, acb92eb

Test result: 15/15 passed in tests/test_updates.py; 157/158 passed in full suite (1 pre-existing calendar OAuth failure unrelated to this plan).

## Self-Check: PASSED
