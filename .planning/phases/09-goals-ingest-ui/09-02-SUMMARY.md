---
phase: 09-goals-ingest-ui
plan: 02
subsystem: ui
tags: [react, typescript, vite, react-router, goals, ingest]

requires:
  - phase: 08-goals-ingest-backend
    provides: GoalRead/GoalCreate/GoalUpdate schemas, /api/v1/goals endpoint, IngestPreviewResult shape
provides:
  - TypeScript Goal/Milestone/Ingest types (frontend/src/types/goal.ts)
  - goal_id field on Task/TaskCreate and Routine/RoutineInput
  - useGoals hook (plain-fetch, mirrors useTasks)
  - GoalSelect prop-driven dropdown component
  - Goals bottom-nav tab (Today/Tasks/Goals/Settings)
  - /goals and /ingest routes with placeholder pages
  - net-new CSS for goals + ingest UI
affects: [09-03-goals-page, 09-04-ingest-page-drawers]

tech-stack:
  added: []
  patterns:
    - "GoalSelect is prop-driven (goals passed in) — parent owns single useGoals() to avoid double-fetch/stale data"
    - "Placeholder page stubs created in Plan 03/04-owned files so routes resolve; marked with replacement comment"

key-files:
  created:
    - frontend/src/types/goal.ts
    - frontend/src/hooks/useGoals.ts
    - frontend/src/components/GoalSelect.tsx
    - frontend/src/pages/Goals.tsx
    - frontend/src/pages/Ingest.tsx
  modified:
    - frontend/src/types/task.ts
    - frontend/src/types/routine.ts
    - frontend/src/components/BottomNav.tsx
    - frontend/src/App.tsx
    - frontend/src/styles.css

key-decisions:
  - "GoalSelect prop-driven (overrides RESEARCH Pattern 4 internal-useGoals) per Pitfall 2"
  - "Routine goal_id typed number|null to allow explicit unlink in Plan 04"

patterns-established:
  - "Prop-driven shared selects: parent owns the data hook, child receives the list"

requirements-completed: [GOAL-04, GOAL-05]

duration: 3min
completed: 2026-06-16
---

# Phase 09 Plan 02: Goals + Ingest UI Foundation Summary

**Shared frontend contracts for the Goals/Ingest feature: TS types, useGoals hook, prop-driven GoalSelect, a Goals bottom-nav tab, /goals + /ingest routes with placeholder pages, and net-new CSS — all compiling and building green.**

## Performance

- **Duration:** ~3 min (excluding dependency install)
- **Started:** 2026-06-16T14:13:31Z
- **Completed:** 2026-06-16T14:16:14Z
- **Tasks:** 2
- **Files modified:** 10 (5 created, 5 modified)

## Accomplishments
- Goal/Milestone/Ingest TypeScript types matching backend GoalRead + IngestPreviewResult
- goal_id surfaced on Task/TaskCreate and Routine/RoutineInput (number|null on routine for unlink)
- useGoals hook (goals + refresh/createGoal/patchGoal) fetching /api/v1/goals/
- Prop-driven GoalSelect dropdown (No goal + active goals)
- Goals tab added to bottom nav between Tasks and Settings
- /goals and /ingest routes resolve to placeholder pages (no 404)
- New CSS block (progress bars, type/diff badges, goal/milestone rows, prompt block, error list, text buttons) appended verbatim from UI-SPEC

## Task Commits

1. **Task 1: Types + useGoals hook** - `3be81b3` (feat)
2. **Task 2: GoalSelect + BottomNav tab + App routes + CSS** - `7534dc4` (feat)

## Files Created/Modified
- `frontend/src/types/goal.ts` - Goal, GoalCreate, GoalUpdate, Milestone, MilestoneCreate, IngestEntityDiff, IngestPreviewResult, GoalType, GoalStatus
- `frontend/src/types/task.ts` - added goal_id?: number to Task + TaskCreate
- `frontend/src/types/routine.ts` - added goal_id?: number | null to Routine + RoutineInput
- `frontend/src/hooks/useGoals.ts` - plain-fetch hook mirroring useTasks
- `frontend/src/components/GoalSelect.tsx` - prop-driven native goal dropdown
- `frontend/src/components/BottomNav.tsx` - added Target Goals tab
- `frontend/src/App.tsx` - /goals and /ingest routes + imports
- `frontend/src/pages/Goals.tsx` - placeholder stub (replaced in Plan 03)
- `frontend/src/pages/Ingest.tsx` - placeholder stub (replaced in Plan 04)
- `frontend/src/styles.css` - appended net-new goals/ingest CSS block

## Decisions Made
- GoalSelect is prop-driven, intentionally overriding RESEARCH.md Pattern 4 (internal useGoals) per Pitfall 2 — parent owns the single useGoals() instance, child receives the goals list, preventing double-fetch and stale data.
- Routine goal_id typed `number | null` (not just `number`) so Plan 04's RoutineDrawer can send explicit null to unlink.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed frontend dependencies**
- **Found during:** Task 1 verification
- **Issue:** `npx tsc` failed — node_modules absent in this worktree, blocking all type/build verification
- **Fix:** Ran `npm install` in frontend/ (114 packages, 0 vulnerabilities)
- **Files modified:** none committed (node_modules gitignored)
- **Verification:** `npx tsc --noEmit` and `npm run build` both succeed
- **Committed in:** N/A (install only, no tracked file changes)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to run the plan's own verification commands. No scope creep.

## Known Stubs

- `frontend/src/pages/Goals.tsx` and `frontend/src/pages/Ingest.tsx` are intentional placeholder stubs, explicitly required by this plan (Task 2 step 3) so routes resolve. They are owned by and fully replaced in Plans 09-03 (Goals) and 09-04 (Ingest). Each carries a top comment marking the replacing plan.

## Issues Encountered
- Worktree branch was behind master and lacked the phase 09 plan and phase 08 backend; merged master into the worktree branch to obtain plan + backend contracts before executing. No conflicts.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All shared contracts (goal types, useGoals, GoalSelect, routes, nav tab, CSS) exist; Plans 03 and 04 can build in parallel without redefining anything.
- Plans 03/04 must replace the placeholder Goals.tsx / Ingest.tsx stubs.

## Self-Check: PASSED

All created files exist on disk; both task commits (3be81b3, 7534dc4) present in git history.

---
*Phase: 09-goals-ingest-ui*
*Completed: 2026-06-16*
