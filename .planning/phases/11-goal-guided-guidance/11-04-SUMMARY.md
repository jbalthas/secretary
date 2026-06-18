---
phase: 11-goal-guided-guidance
plan: "04"
subsystem: ui
tags: [react, hooks, typescript, guidance, focus-banner, settings]

requires:
  - phase: 11-01
    provides: stall_threshold_days setting and /guidance/next-best-task endpoint
  - phase: 11-03
    provides: GET/PUT /settings/stall-threshold endpoints

provides:
  - useNextBestTask hook (one-shot fetch of /guidance/next-best-task)
  - useStallThreshold hook (get/put /settings/stall-threshold)
  - FocusBanner component in Today.tsx above the agenda
  - Guidance section with stall-threshold input in Settings.tsx

affects: [future phases using guidance surface or settings patterns]

tech-stack:
  added: []
  patterns:
    - "One-shot on-mount fetch hook (useNextBestTask mirrors usePlan)"
    - "Get/put settings hook with local input state (useStallThreshold mirrors useWorkHours)"
    - "In-file supplementary component (FocusBanner) rendered conditionally above agenda"

key-files:
  created:
    - frontend/src/hooks/useNextBestTask.ts
    - frontend/src/hooks/useStallThreshold.ts
  modified:
    - frontend/src/pages/Today.tsx
    - frontend/src/pages/Settings.tsx

key-decisions:
  - "FocusBanner meta line (goal name · priority) omitted — Task type does not expose resolved goal title; no secondary fetch"
  - "Banner is read-only and does not open TaskDrawer per 11-UI-SPEC Interaction Notes"

patterns-established:
  - "useStallThreshold: get/put settings hook pattern, mirrors useWorkHours exactly"
  - "useNextBestTask: silent-fail one-shot hook — supplementary UI never shows errors"

requirements-completed: [GUIDE-02, GUIDE-03]

duration: ~30min
completed: 2026-06-18
---

# Phase 11 Plan 04: Goal-Guided Guidance UI Summary

**Today "Focus on:" banner (indigo left border, read-only) fed by /guidance/next-best-task, and Settings Guidance section with validated stall-threshold (1–365 days) GET/PUT via useStallThreshold hook**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-18
- **Completed:** 2026-06-18
- **Tasks:** 2 auto + 1 checkpoint (human-verify approved)
- **Files modified:** 4

## Accomplishments

- `useNextBestTask` hook: one-shot fetch on mount, silent-fail (banner is supplementary)
- `useStallThreshold` hook: get/put pair mirroring useWorkHours pattern exactly
- FocusBanner rendered between page-title h1 and groups.map in Today.tsx — absent when null/error
- Guidance section in Settings.tsx with integer 1–365 validation, red border on error, save/reload cycle

## Task Commits

1. **Task 1: useNextBestTask + useStallThreshold hooks** - `4853ad8` (feat)
2. **Task 2: FocusBanner in Today.tsx + Guidance section in Settings.tsx** - `918642f` (feat)
3. **Task 3: checkpoint:human-verify** — approved by user

## Files Created/Modified

- `frontend/src/hooks/useNextBestTask.ts` — one-shot fetch, returns `{ task: Task | null }`, silent-fail
- `frontend/src/hooks/useStallThreshold.ts` — get/put hook, `{ days, loading, save }`
- `frontend/src/pages/Today.tsx` — imports useNextBestTask, renders FocusBanner above agenda
- `frontend/src/pages/Settings.tsx` — imports useStallThreshold, adds Guidance section after Work Hours

## Decisions Made

- FocusBanner meta line (goal · priority) omitted because Task type does not expose a resolved goal title; no secondary fetch per plan instruction.
- Banner is read-only (no onClick, no TaskDrawer) per 11-UI-SPEC Interaction Notes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 11 is now fully complete — all four plans executed and human-verified. The full guidance pipeline (backend scheduler nudge, next-best-task API, and frontend surfaces) is live.

---
*Phase: 11-goal-guided-guidance*
*Completed: 2026-06-18*
