---
phase: quick-260707-cu1
plan: 01
subsystem: advisory-sync
tags: [react, fastapi, pydantic, error-handling, export]

# Dependency graph
requires:
  - phase: 16-advisory-ingest-sync-review-ui
    provides: useAdvisory hook, advisory router 422 error paths, export_service goal rendering
provides:
  - Shape-aware parse422 in useAdvisory.ts that handles both string and array 422 detail bodies
  - goal.external_key rendered in the exported Advisor Brief markdown
affects: [advisory-sync-ui, export-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "parse422 dispatches on typeof/Array.isArray(detail) before mapping — string detail (business-logic HTTPException) returns as a one-element array, array detail (FastAPI pydantic validation) keeps existing loc.path formatting, anything else returns []"

key-files:
  created: []
  modified:
    - frontend/src/hooks/useAdvisory.ts
    - frontend/src/hooks/useAdvisory.test.ts
    - backend/app/services/export_service.py
    - backend/tests/test_export.py

key-decisions:
  - "parse422 signature widened to unknown; call sites unchanged (parse422(body.detail ?? []))"
  - "external_key metadata bullet inserted immediately after the goal title line, omitted entirely when null — single insertion point covers both compact and full render paths"

patterns-established:
  - "422 detail shape dispatch: string => business-logic HTTPException message; array => FastAPI RequestValidationError; anything else => empty array (no crash)"

requirements-completed: [QUICK-260707-cu1]

# Metrics
duration: 15min
completed: 2026-07-07
---

# Quick Task 260707-cu1: Fix advisory 422 string-detail crash + missing external_key in brief Summary

**Shape-aware parse422 (string vs array 422 detail) plus goal.external_key now rendered in the exported Advisor Brief, both covered by new TDD tests**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `parse422` in `useAdvisory.ts` no longer throws a TypeError when the backend sends a plain-string 422 `detail` (business-logic errors like "unknown goal external_key: xyz"); the real message now surfaces to the user instead of the generic "check your connection" fallback
- The exported Advisor Brief markdown now includes each active goal's real `external_key`, so an external LLM advisor can copy it verbatim instead of inventing slugs that fail backend validation on write-back

## Task Commits

Each task was committed atomically (TDD RED -> GREEN per task):

1. **Task 1: Make parse422 handle both string and array 422 detail shapes**
   - `792db03` (test) — RED: two new tests (string detail on preview/confirm) fail against old array-only parse422
   - `2a34967` (fix) — GREEN: parse422 dispatches on `typeof`/`Array.isArray`; all 6 useAdvisory tests pass
2. **Task 2: Render goal.external_key in the exported Advisor Brief**
   - `93dc5f7` (test) — RED: `assert "ship-v2" in md` fails against old `_render_goal_section`
   - `5fa0411` (feat) — GREEN: external_key bullet added after title line; all 8 test_export.py tests pass

No refactor commits — both implementations were already minimal.

## Files Created/Modified
- `frontend/src/hooks/useAdvisory.ts` - `parse422(detail: unknown)` now branches on string/array/other before formatting
- `frontend/src/hooks/useAdvisory.test.ts` - added "surfaces string detail on 422 for preview" and "...for confirm" tests
- `backend/app/services/export_service.py` - `_render_goal_section` appends `- external_key: {goal.external_key}` when present, right after the title line
- `backend/tests/test_export.py` - added `assert "ship-v2" in md` to `test_bundle_contains_goal_section`

## Decisions Made
- Widened `parse422` signature to `unknown` rather than a union type — keeps call sites (`parse422(body.detail ?? [])`) untouched per plan instruction, all shape logic centralized inside the function
- external_key line placed before the `- target:` line (immediately after title) to match plan's specified position and existing bullet style

## Deviations from Plan

None — plan executed exactly as written. One environment-setup step was required but is not a plan deviation: this worktree had no `frontend/node_modules` or `backend/.venv`, so `npm install` and `uv sync` were run first to make the specified verification commands (`npx vitest run`, `pytest`) executable.

## Issues Encountered
- Running the full advisory regression suite (`test_advisory_routes.py test_advisory_service.py test_advisory_schema.py` together) hit a pre-existing `RuntimeError: There is no current event loop in thread 'MainThread'` in `test_advisory_schema.py::test_ingest_payload_type_standard_explicit` when run after other test files in the same pytest process. Confirmed this is unrelated to this task's changes: `test_advisory_schema.py` passes cleanly (10/10) when run in isolation, and this exact class of session-scoped test-ordering flakiness across advisory test files is already documented as pre-existing in STATE.md's `[Phase 16-03]` decision log. No files touched by this plan are implicated. Not fixed (out of scope per deviation rules scope boundary).

## Next Phase Readiness
- No blockers. Both bugs fixed and verified with passing tests (frontend: 6/6 useAdvisory.test.ts; backend: 8/8 test_export.py).
- Pre-existing advisory test-suite ordering flakiness (see Issues Encountered) remains open but unrelated; not introduced or worsened by this change.

---
*Phase: quick-260707-cu1*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 4 modified files found on disk; all 4 task commits (792db03, 2a34967, 93dc5f7, 5fa0411) found in git log.
