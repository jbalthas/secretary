---
phase: 09-goals-ingest-ui
plan: 04
subsystem: frontend
tags: [goals, ingest, react, ui, llm-prompt]
requires:
  - "frontend/src/components/GoalSelect.tsx, hooks/useGoals.ts, types/goal.ts (Plan 02)"
  - "backend POST /api/v1/ingest/preview (Plan 01)"
  - "backend POST /api/v1/ingest/confirm + GET /ingest/schema (Phase 8)"
  - "frontend/src/components/TaskDrawer.tsx, RoutineDrawer.tsx (existing)"
provides:
  - "Goal dropdown wired into TaskDrawer + RoutineDrawer (GOAL-05)"
  - "Ingest page: LLM prompt, paste/upload, dry-run preview diff, confirm (INGEST-03/05)"
  - "Documented LLM ingest prompt artifact (deferred from Phase 8)"
affects:
  - "frontend/src/pages/Ingest.tsx"
  - "frontend/src/components/TaskDrawer.tsx"
  - "frontend/src/components/RoutineDrawer.tsx"
tech-stack:
  added: []
  patterns:
    - "Tasks omit goal_id when unset; routines always send explicit goal_id (int or null) to unlink under exclude_unset=True"
    - "GoalSelect fed by useGoals() from parent page (no double-fetch)"
    - "Stateless preview-then-confirm: client resends full payload on confirm"
key-files:
  created:
    - "frontend/src/lib/ingestPrompt.ts"
    - "frontend/src/hooks/useIngest.ts"
  modified:
    - "frontend/src/pages/Ingest.tsx (replaced Plan-02 placeholder)"
    - "frontend/src/components/TaskDrawer.tsx"
    - "frontend/src/components/RoutineDrawer.tsx"
    - "frontend/src/pages/Tasks.tsx"
    - "frontend/src/pages/Settings.tsx"
key-decisions:
  - "Routines always send explicit goal_id (null to unlink) because backend uses exclude_unset=True; tasks omit when unset"
  - "Single shared payload state for both paste and file-upload paths (readAsText into the textarea)"
requirements-completed: [GOAL-05, INGEST-03, INGEST-05]
duration: ~8min
completed: 2026-06-17
---

# Phase 09 Plan 04: Drawer Goal Linking + Ingest Page Summary

**Goal dropdowns wired into the Task and Routine drawers (GOAL-05) plus a full Ingest page — copyable LLM prompt, JSON paste/upload, dry-run preview diff, and disabled-on-submit confirm with field-level 422 errors (INGEST-03/05).**

## Performance

- **Tasks:** 3 implementation tasks + 1 human-verify gate (approved)
- **Files modified:** 7 (2 created, 5 modified)
- **Completed:** 2026-06-17

## Accomplishments
- Goal dropdown in TaskDrawer (after Priority) and RoutineDrawer (after Action), fed by `useGoals()` from the parent pages
- Ingest page: copyable schema-1.0 LLM prompt, textarea paste + `.json` upload into one shared payload, Run Preview → grouped per-entity create/update diff (no write), Confirm Import (disabled-on-submit) → redirect to `/goals`
- Client-side "Invalid JSON" guard and field-level HTTP 422 "Validation Errors" list
- Documented LLM ingest prompt artifact (deferred from Phase 8) shipped in `frontend/src/lib/ingestPrompt.ts`

## Task Commits

1. **Task 1: Goal dropdown in TaskDrawer + RoutineDrawer (+ parent wiring)** — `3b32720` (feat)
2. **Task 2: LLM prompt artifact + useIngest hook** — `beba15f` (feat)
3. **Task 3: Ingest page — prompt, paste/upload, preview diff, confirm, errors** — `6ee3342` (feat)
4. **Deferred-items note (pre-existing calendar test)** — `3a2ad71` (docs)

Cross-plan integration fix (orchestrator, post-merge): `5df94ba` — Goals.tsx passes the now-required `goals` prop to its TaskDrawer instance.

## Files Created/Modified
- `frontend/src/lib/ingestPrompt.ts` — documented schema-1.0 LLM prompt constant
- `frontend/src/hooks/useIngest.ts` — preview + confirm + loading/error state hook
- `frontend/src/pages/Ingest.tsx` — paste/upload + preview diff + confirm UI (replaced placeholder)
- `frontend/src/components/TaskDrawer.tsx` — goal dropdown (GoalSelect); omits goal_id when unset
- `frontend/src/components/RoutineDrawer.tsx` — goal dropdown; sends explicit goal_id (null to unlink)
- `frontend/src/pages/Tasks.tsx`, `frontend/src/pages/Settings.tsx` — pass `goals` from useGoals() into drawers

## Decisions Made
- Routines always send explicit `goal_id` (int or `null`) so unlinking works under the backend's `exclude_unset=True`; tasks omit `goal_id` when unset.
- Both paste and file-upload feed one shared payload state (`readAsText` writes into the textarea).

## Deviations from Plan
None affecting plan scope. One cross-plan integration gap surfaced at merge (TaskDrawer's new required `goals` prop was missing from 09-03's Goals.tsx TaskDrawer instance); fixed by the orchestrator in `5df94ba`.

## Issues Encountered
- Pre-existing unrelated failure `backend/tests/test_calendar.py::test_callback_stores_credentials` (fails on master independent of this plan; frontend-only changes here). Logged in `deferred-items.md`.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Full Goals + Ingest UI complete; backend ingest preview/confirm wired end-to-end.
- Phase 10 (Day Auto-Organize) can build on `estimated_minutes` and Goal entities now surfaced in the UI.

---
*Phase: 09-goals-ingest-ui*
*Completed: 2026-06-17*
