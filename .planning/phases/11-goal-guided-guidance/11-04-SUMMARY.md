---
phase: 11-goal-guided-guidance
plan: "04"
subsystem: frontend
tags: [hooks, today, settings, guidance, focus-banner]
dependency_graph:
  requires: ["11-01", "11-03"]
  provides: ["GUIDE-02-ui", "GUIDE-03-ui"]
  affects: [frontend/src/pages/Today.tsx, frontend/src/pages/Settings.tsx]
tech_stack:
  added: []
  patterns: [one-shot-fetch-hook, get-put-settings-hook]
key_files:
  created:
    - frontend/src/hooks/useNextBestTask.ts
    - frontend/src/hooks/useStallThreshold.ts
  modified:
    - frontend/src/pages/Today.tsx
    - frontend/src/pages/Settings.tsx
decisions:
  - FocusBanner is in-file component (not extracted) — read-only, no TaskDrawer interaction per 11-UI-SPEC
  - Meta line (goal name · priority) omitted from banner — Task type has no resolved goal title
metrics:
  duration: ~10min
  completed: "2026-06-18"
  tasks_completed: 2
  files_changed: 4
---

# Phase 11 Plan 04: FocusBanner + Guidance Settings Summary

Today "Focus on:" banner fed by GET /guidance/next-best-task and Settings Guidance section with validated stall-threshold (1-365 days) GET/PUT input.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | useNextBestTask + useStallThreshold hooks | 4853ad8 | frontend/src/hooks/useNextBestTask.ts, frontend/src/hooks/useStallThreshold.ts |
| 2 | FocusBanner in Today.tsx + Guidance section in Settings.tsx | 918642f | frontend/src/pages/Today.tsx, frontend/src/pages/Settings.tsx |

## Decisions Made

- FocusBanner is an in-file component (not extracted to components/) — read-only with no interactions, belongs conceptually to Today.tsx
- Banner meta line (goal name · priority) omitted because Task type does not expose a resolved goal title string — avoids a secondary fetch per 11-UI-SPEC note
- Guidance section placed after Work Hours, before Google Home — follows page flow from planning to ambient config

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both endpoints are wired to live backend routes from 11-01 and 11-03.

## Self-Check: PASSED

- frontend/src/hooks/useNextBestTask.ts: FOUND
- frontend/src/hooks/useStallThreshold.ts: FOUND
- frontend/src/pages/Today.tsx modified: confirmed (contains useNextBestTask, FocusBanner, "Focus on", aria-label="Suggested focus")
- frontend/src/pages/Settings.tsx modified: confirmed (contains useStallThreshold, "Stall threshold (days)", validation message)
- Commits 4853ad8 and 918642f: FOUND
