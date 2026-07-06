---
phase: 16-advisory-ingest-sync-review-ui
plan: 05
subsystem: api
tags: [pydantic, json-schema, prompt-engineering, advisory]

# Dependency graph
requires:
  - phase: 16-advisory-ingest-sync-review-ui/16-01
    provides: AdvisoryPayload/GoalAdjustment/MilestoneAdjustment/TaskCreation Pydantic schemas (final field shapes, incl. MilestoneAdjustment.new_title)
  - phase: 16-advisory-ingest-sync-review-ui/16-04
    provides: Sync page staleness check that reads session_id + generated_at from the pasted advisory reply
provides:
  - "backend/scripts/regen_advisor_schema.py — repeatable script printing AdvisoryPayload.model_json_schema() as pretty JSON"
  - "frontend/src/lib/advisorPrompt.ts with the real generated schema block (no more [SCHEMA BLOCK] placeholder)"
  - "Advisor prompt echo instruction and EXAMPLE PAYLOAD updated to require both session_id AND generated_at (closes the self-contained staleness loop from 16-04)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema-block embedding: a small backend script prints model_json_schema() as pretty JSON; the frontend prompt constant is a static embed, not a runtime fetch — regenerate + re-embed manually whenever AdvisoryPayload changes"

key-files:
  created:
    - backend/scripts/regen_advisor_schema.py
  modified:
    - frontend/src/lib/advisorPrompt.ts

key-decisions:
  - "Milestone IN-SCOPE prose updated to say the milestone is matched by goal_external_key + current title, and renamed via new_title — reflects the final AdvisoryPayload.MilestoneAdjustment shape from 16-01 rather than the illustrative Phase 15 draft wording"
  - "EXAMPLE PAYLOAD's milestone_adjustments entry keeps title (match key) and adds new_title (rename target) side by side, matching the generated schema's field list"

patterns-established: []

requirements-completed: [PROMPT-01]

# Metrics
duration: 12min
completed: 2026-07-06
---

# Phase 16 Plan 05: Advisory Prompt Schema Regen Summary

**Replaced the advisorPrompt.ts `[SCHEMA BLOCK]` placeholder with the real `AdvisoryPayload.model_json_schema()` output via a new repeatable regen script, and updated the prompt's echo instruction + example payload to require both `session_id` and `generated_at` so Phase 16's staleness check is fully self-contained.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-06T21:40:00Z
- **Completed:** 2026-07-06T21:52:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `backend/scripts/regen_advisor_schema.py` created — imports `AdvisoryPayload` and prints `model_json_schema()` as indented JSON; runs cleanly via `uv run python scripts/regen_advisor_schema.py` from `backend/`
- `frontend/src/lib/advisorPrompt.ts`'s `[SCHEMA BLOCK]` placeholder replaced with the live-generated JSON schema (verified zero backticks/`${` inside the embedded block, keeping the template literal valid)
- Prompt's milestone IN-SCOPE bullet and EXAMPLE PAYLOAD updated to match the final schema: milestones matched by `goal_external_key` + `title`, renamed via optional `new_title`
- Echo instruction renamed from "SESSION_ID ECHO" to "SESSION_ID AND GENERATED_AT ECHO"; both fields added to the EXAMPLE PAYLOAD and the closing instruction paragraph

## Task Commits

Each task was committed atomically:

1. **Task 1: regen script that prints the advisory JSON schema** - `5efaeb9` (feat)
2. **Task 2: embed schema + echo instruction into advisorPrompt.ts** - `5eba286` (feat)

**Plan metadata:** (pending — final commit follows this summary)

## Files Created/Modified
- `backend/scripts/regen_advisor_schema.py` - prints `AdvisoryPayload.model_json_schema()` as pretty JSON for re-embedding
- `frontend/src/lib/advisorPrompt.ts` - embedded generated schema block; dual `session_id`/`generated_at` echo instruction + example; milestone rename via `new_title` reflected in prose and example

## Decisions Made
- No hand-written schema anywhere — the embedded JSON is a verbatim copy of the script's stdout
- Kept the embed as a static string (no build-time codegen step) per the plan's hard constraint that `advisorPrompt.ts` stays a static const, mirroring `ingestPrompt.ts`

## Deviations from Plan

None — plan executed exactly as written. Both hard constraints honored: schema sourced only from `AdvisoryPayload.model_json_schema()` (no hand-writing), and the embedded JSON contains no backtick or `${` (verified via grep before commit). No LLM imports were added anywhere (`grep -rc "anthropic\|openai\|litellm" backend/app/` returns clean).

## Issues Encountered

Running the script and `python -c` verification with the system `python` failed with `ModuleNotFoundError: No module named 'app'` because the project uses `uv` for its Python environment (per project CLAUDE.md tech stack) rather than a bare `python` on PATH — resolved by invoking via `uv run python scripts/regen_advisor_schema.py`, which resolves `app` correctly from `backend/`'s `pyproject.toml`. Not a plan defect; the plan's verification command works as written once run through `uv`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 16 (advisory-ingest-sync-review-ui) is now fully delivered: this was the last plan (5 of 5) per ROADMAP
- PROMPT-01 requirement complete — the advisor prompt's schema block is the real generated schema, and the prompt's echo instruction is self-contained for the 7-day staleness check introduced in 16-04
- No blockers; milestone v2.2 "LLM Advisory Loop" progress: Phase 14 (Progression Substrate) status should be double-checked before declaring the milestone complete — STATE.md v2.2 phase map still lists it "Not started" as of this plan's start

---
*Phase: 16-advisory-ingest-sync-review-ui*
*Completed: 2026-07-06*

## Self-Check: PASSED

All claimed files verified present (backend/scripts/regen_advisor_schema.py, frontend/src/lib/advisorPrompt.ts); all claimed commit hashes (5efaeb9, 5eba286) verified present in git log.
