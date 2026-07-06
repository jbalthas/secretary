---
phase: 16-advisory-ingest-sync-review-ui
plan: 01
subsystem: database
tags: [pydantic, sqlalchemy, alembic, advisory, ingest, schema-validation]

# Dependency graph
requires:
  - phase: 15-context-export-advisor-prompt
    provides: advisorPrompt.ts example payload (field names for AdvisoryPayload), [SCHEMA BLOCK] placeholder to be regenerated at end of Phase 16
provides:
  - AdvisoryPayload + GoalAdjustment + MilestoneAdjustment + TaskCreation Pydantic schemas (extra=forbid, required rationale, create-only TaskCreation)
  - IngestPayload.payload_type backward-compat discriminator (defaults "standard")
  - AdvisoryLog model (advisory_id idempotency table, mirrors UpdateLog)
  - AppSettings.last_advisory_at column
  - Goal.priority_rank column
  - Migration 0018 (advisory_log table + last_advisory_at + priority_rank)
affects: [16-02-advisory-service, 16-03-advisory-routes, 16-04-sync-review-ui, 16-05-advisor-prompt-schema-regen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AdvisoryLog mirrors UpdateLog exactly (unique advisory_id + result_json + created_at) for advisory idempotency"
    - "payload_type Literal discriminator pattern extended from IngestPayload (standard) to AdvisoryPayload (advisory) for future payload-type dispatch"

key-files:
  created:
    - backend/app/schemas/advisory.py
    - backend/tests/test_advisory_schema.py
    - backend/migrations/versions/0018_advisory_log_priority_rank_last_advisory_at.py
  modified:
    - backend/app/schemas/ingest.py
    - backend/app/models/__init__.py
    - backend/app/models/goal.py

key-decisions:
  - "AdvisoryPayload.generated_at is a required datetime (no default) per plan interface spec, even though the advisorPrompt.ts EXAMPLE PAYLOAD block in frontend/src/lib/advisorPrompt.ts omits it — test constructs the example dict with generated_at added, matching the documented contract rather than the illustrative snippet"
  - "Forbidden-ops test (test_goal_adjustment_cannot_change_status_title_type) proves ADVISE-03 at the schema level: status/title/type keys on GoalAdjustment raise ValidationError via extra=forbid, with no need for service-layer blocking logic"

patterns-established:
  - "Schema-level correctness gates: extra=forbid + required rationale + omitted fields (no id on TaskCreation, no status/title/type on GoalAdjustment) make forbidden operations structurally impossible rather than runtime-checked"

requirements-completed: [ADVISE-01, ADVISE-03]

# Metrics
duration: 18min
completed: 2026-06-30
---

# Phase 16 Plan 01: Advisory Schemas + AdvisoryLog Model + Migration 0018 Summary

**AdvisoryPayload Pydantic schema (extra=forbid, required rationale, create-only TaskCreation) plus AdvisoryLog idempotency table, AppSettings.last_advisory_at, Goal.priority_rank, and migration 0018 — the data layer for the advisory ingest half of the loop.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-30T20:01:00Z
- **Completed:** 2026-06-30T20:19:00Z
- **Tasks:** 3 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `AdvisoryPayload` + `GoalAdjustment` + `MilestoneAdjustment` + `TaskCreation` schemas defined exactly per `frontend/src/lib/advisorPrompt.ts` field names, with `extra="forbid"` on every model and `rationale: str` required on all three item models
- `IngestPayload` extended with `payload_type: Literal["standard"] = "standard"` — verified zero regression against existing ingest payloads (no `payload_type` key still validates)
- `AdvisoryLog` table added (mirrors `UpdateLog`), plus `AppSettings.last_advisory_at` and `Goal.priority_rank` columns
- Migration 0018 applies and reverses cleanly (`alembic upgrade head` -> 0018, `alembic downgrade -1` -> 0017, re-upgrade -> 0018)
- ADVISE-03 forbidden-ops gate proven at schema level: no path to create a goal, change goal status/title/type, or edit/complete/delete an existing task — all blocked by `extra="forbid"` and field omission, not runtime checks

## Task Commits

Each task was committed atomically:

1. **Task 1: advisory schemas + payload_type backward-compat + RED tests** - `76ce723` (test)
2. **Task 2: AdvisoryLog model + AppSettings.last_advisory_at + Goal.priority_rank** - `59fc638` (feat)
3. **Task 3: Alembic migration 0018** - `9d32195` (chore)

**Plan metadata:** (pending — final commit follows this summary)

## Files Created/Modified
- `backend/app/schemas/advisory.py` - AdvisoryPayload, GoalAdjustment, MilestoneAdjustment, TaskCreation (all extra=forbid)
- `backend/app/schemas/ingest.py` - added `payload_type: Literal["standard"] = "standard"` to IngestPayload
- `backend/tests/test_advisory_schema.py` - 10 tests: example payload validation, forbidden extras, required rationale (x3), no-id TaskCreation, milestone rename optionality, forbidden goal status/title/type, ingest backward-compat (x2)
- `backend/app/models/__init__.py` - AdvisoryLog model; AppSettings.last_advisory_at
- `backend/app/models/goal.py` - Goal.priority_rank
- `backend/migrations/versions/0018_advisory_log_priority_rank_last_advisory_at.py` - advisory_log table, app_settings.last_advisory_at, goals.priority_rank; down_revision="0017"

## Decisions Made
- `generated_at` treated as required per the locked `<interfaces>` spec in the plan, even though the advisorPrompt.ts illustrative example dict in the doc comment omits it (the doc's prose example is non-exhaustive; the field is explicitly listed in "Field names are FIXED" and the `<interfaces>` Python class). Test payload includes it.
- No new dependencies; no service/route logic touched (out of scope for this plan by design — data layer only)

## Deviations from Plan

None — plan executed exactly as written. All hard constraints honored: `extra="forbid"` on every advisory model (4/4), `rationale: str` required on all three item models (3/3), `TaskCreation` has no `id` field, `IngestPayload` backward-compat preserved, migration 0018 chains from 0017, no LLM imports introduced.

## Issues Encountered

Pre-existing, out-of-scope test failure discovered during full-suite verification: `tests/test_calendar.py::test_callback_stores_credentials` fails (404 instead of 200/302/307 on `/auth/google/callback`) on the base branch prior to any 16-01 changes (confirmed via `git stash` + isolated run). Not caused by this plan's files; logged to `.planning/phases/16-advisory-ingest-sync-review-ui/deferred-items.md` and left unfixed per scope boundary rules. Full suite otherwise green: 181 passed, 1 deselected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `backend/app/schemas/advisory.py` shapes are ready for 16-02 (advisory service) to consume directly
- `AdvisoryLog` table + `AppSettings.last_advisory_at` ready for the idempotency/staleness logic in 16-02/16-03
- `Goal.priority_rank` ready for 16-02 apply logic and 16-04 frontend display
- Pre-existing `test_calendar.py` failure remains open — does not block Phase 16 continuation but should be triaged separately

---
*Phase: 16-advisory-ingest-sync-review-ui*
*Completed: 2026-06-30*

## Self-Check: PASSED

All claimed files verified present; all claimed commit hashes (76ce723, 59fc638, 9d32195) verified present in git log.
