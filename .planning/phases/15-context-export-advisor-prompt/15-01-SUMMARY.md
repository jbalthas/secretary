---
phase: 15-context-export-advisor-prompt
plan: 01
subsystem: testing
tags: [pytest, tdd, fastapi, sqlalchemy, react, typescript, llm-prompt]

# Dependency graph
requires:
  - phase: 14-progression-substrate
    provides: GoalProgressSnapshot model (progress_pct, snapshotted_on) used by trend tests
provides:
  - "backend/tests/test_export.py — 8 contractual RED tests (EXPORT-01..06 + no-LLM CI guard)"
  - "frontend/src/lib/advisorPrompt.ts — ADVISOR_PROMPT with literal [SCHEMA BLOCK] placeholder (PROMPT-01)"
affects: [15-02-export-backend, 15-03-advisor-ui, 16-advisory-ingest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deferred service import inside test body so the file collects before the service module exists (Phase 08 pattern)"
    - "Triple _Session patch (export_service + brief + guidance_service) to one in-memory test Session"
    - "[SCHEMA BLOCK] literal placeholder; regenerated from model_json_schema() in Phase 16"

key-files:
  created:
    - backend/tests/test_export.py
    - frontend/src/lib/advisorPrompt.ts
  modified: []

key-decisions:
  - "Tests assert export bundle contract {markdown, session_id, generated_at}; markdown starts with '# Advisor Brief'"
  - "ScheduledBlock seeds use date_key string comparison for slipped detection (avoids tz conversion)"
  - "advisorPrompt.ts ships [SCHEMA BLOCK] literal twice (top comment + placeholder line); Phase 16 swaps the placeholder"

patterns-established:
  - "Wave 0 RED scaffold: 1 always-pass CI guard + N deferred-import contract tests"

requirements-completed: [EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06, PROMPT-01]

# Metrics
duration: 3min
completed: 2026-06-29
---

# Phase 15 Plan 01: Export/Advisor Wave 0 Scaffold Summary

**8 RED contract tests defining the export-bundle API plus the static advisor system prompt with a [SCHEMA BLOCK] placeholder — the verification target and frontend unblocker for Wave 1.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-29T19:01:20Z
- **Completed:** 2026-06-29T19:03:58Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `backend/tests/test_export.py`: 8 named, contractual test functions that collect cleanly before `export_service.py` exists, via deferred in-body imports.
- `test_no_llm_imports` CI guard passes against current `backend/app/` — locks the no-server-side-LLM hard constraint.
- `test_velocity_label` + 6 export_service-dependent tests are RED (1 fail + 6 error) — the exact RED→GREEN target for 15-02.
- `frontend/src/lib/advisorPrompt.ts`: `ADVISOR_PROMPT` exports all 8 PROMPT-01 sections with the literal `[SCHEMA BLOCK]` flagged for Phase 16 replacement; type-checks clean.

## Task Commits

1. **Task 1: RED test scaffold (test_export.py)** - `3baad83` (test)
2. **Task 2: advisorPrompt.ts with [SCHEMA BLOCK]** - `1a22119` (feat)

## Files Created/Modified
- `backend/tests/test_export.py` - 8-test Wave 0 scaffold: CI guard + velocity-logic + endpoint/goal/block/ordering/calendar-privacy/trend contract tests; `export_session` fixture triple-patches `_Session`.
- `frontend/src/lib/advisorPrompt.ts` - `ADVISOR_PROMPT` string constant with role framing, in/out-of-scope lists, new-task scope, `[SCHEMA BLOCK]` placeholder, example payload, notes guidance, session_id echo.

## Decisions Made
- Calendar privacy test seeds both an all-day (`start_date`) and a timed (`start_dt`) event with identical sensitive titles and asserts the title string never appears in the markdown (D-05).
- Block-summary test uses `date_key` string comparison (`< today.isoformat()`) for slipped detection per RESEARCH Pitfall 3.
- Example payload in the prompt includes a top-level `payload_type: "advisory"` to foreshadow the Phase 16 discriminator without creating any backend model.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- pytest was not on the system Python; used the project venv interpreter `backend/.venv/Scripts/python.exe` for all test runs. No code impact.

## Known Stubs
- `[SCHEMA BLOCK]` in `frontend/src/lib/advisorPrompt.ts` is an INTENTIONAL placeholder. Phase 16's final plan does a one-line find-replace with `AdvisoryPayload.model_json_schema()` output. `AdvisoryPayload` does not yet exist and must NOT be created in this phase. Documented in-file and in the plan objective.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 15-02 (export backend) has a locked RED→GREEN target: implement `export_service.build_export_bundle()`, `_velocity_label()`, and `GET /api/v1/export/bundle` until all 8 tests pass.
- 15-03 (advisor UI) can import `ADVISOR_PROMPT` without a missing-module error.
- No blockers.

---
*Phase: 15-context-export-advisor-prompt*
*Completed: 2026-06-29*

## Self-Check: PASSED
- FOUND: backend/tests/test_export.py
- FOUND: frontend/src/lib/advisorPrompt.ts
- FOUND: .planning/phases/15-context-export-advisor-prompt/15-01-SUMMARY.md
- FOUND commit: 3baad83 (Task 1)
- FOUND commit: 1a22119 (Task 2)
