---
phase: 13-update-loop-ui
plan: "03"
subsystem: frontend
tags: [update-loop, candidate-card, rollup, today-page, quick-update]
dependency_graph:
  requires: [13-01, 13-02]
  provides: [quick-update-box, candidate-confirmation-ui, rollup-card, deep-link]
  affects: [13-04]
tech_stack:
  added: []
  patterns: [useUpdate-hook, local-skipped-set, phase-state-machine, deep-link-replaceState]
key_files:
  created:
    - frontend/src/types/update.ts
    - frontend/src/hooks/useUpdate.ts
    - frontend/src/components/CandidateCard.tsx
    - frontend/src/components/RollupCard.tsx
  modified:
    - frontend/src/pages/Today.tsx
    - frontend/src/styles.css
decisions:
  - "useUpdate hook is stateless (no UI state) — Today.tsx owns all update-flow state (text, phase, candidates, candStatus, updError)"
  - "CandidateCard uses a local Set<number> for skipped candidates — avoids lifting skip state to Today"
  - "pre-existing agenda.test.ts failures (2 tests) confirmed pre-exist before Plan 03 changes — not introduced by this plan"
metrics:
  duration_minutes: 3
  completed_date: "2026-06-23"
  tasks_completed: 3
  files_changed: 6
---

# Phase 13 Plan 03: Update Loop UI — Today Tab Surfaces Summary

**One-liner:** Quick-update textarea + candidate disambiguation card + end-of-day rollup card wired into Today.tsx, consuming Wave 0 libs and Wave 1 backend contracts.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | update.ts types + useUpdate hook + CSS classes | 6625d45 | types/update.ts, hooks/useUpdate.ts, styles.css |
| 2 | CandidateCard + RollupCard components | aeacc47 | components/CandidateCard.tsx, components/RollupCard.tsx |
| 3 | Wire update box, candidate flow, rollup, deep-link into Today.tsx | 6ae508a | pages/Today.tsx |

## What Was Built

### Surface 1: Quick-Update Input Box
- Always-visible `textarea.update-input` above `FocusBanner` on Today tab
- `useUpdate().submit(text)` POSTs to `/api/v1/updates/resolve`
- Phase state machine: idle → submitting → success-flash (1.5s) → idle
- Enter submits (Shift+Enter = newline); button labeled "Log update" / "Logging…" / "Done"
- On resolved: clears textarea, flashes "Done", re-fetches tasks + blocks via `refresh()` + `fetchBlocks()`
- On network error: shows error text below input row

### Surface 2: Candidate Confirmation Card
- Renders in place of the update-input-row when `status === "ambiguous"` or `"no_match"`
- Per-candidate "Confirm match" button calls `useUpdate().confirm(text, c, "done")` with `confirmed_id`
- "Skip" removes candidate from local display via `Set<number>` state
- "None of these — dismiss" clears card and textarea
- On confirmed resolve: same flash + refetch as direct resolve

### Surface 3: End-of-Day Rollup Card
- `RollupCard` gated by `isAfterWorkHours(workEnd)` — returns null before work hours end
- Derives rollup via `deriveRollup(tasks, blocks, todayKey)` — completed with line-through/opacity, slipped with "Slipped" badge
- Returns null when both completedCount and slippedCount are 0 (all done → hide card)
- Positioned between FocusBanner and day sections

### Deep-Link Support
- `useEffect` reads `?update=1` on mount, focuses textarea, strips param via `history.replaceState`

### CSS Classes Added (10 new)
`.update-input-row`, `.update-input`, `.btn-save--inline`, `.candidate-card`, `.candidate-row`, `.btn-candidate-confirm`, `.btn-candidate-skip`, `.rollup-card`, `.rollup-heading`, `.rollup-list`, `.rollup-item`

## Deviations from Plan

None — plan executed exactly as written. Pre-existing agenda.test.ts failures (2 tests about calendar event time ordering) confirmed to pre-exist before this plan's changes via `git stash` check.

## Known Stubs

None. All surfaces are wired to live API endpoints from Wave 1.

## Self-Check

Files exist:
- frontend/src/types/update.ts — CREATED (exports UpdateResponse, UpdateCandidate, UpdateStatus)
- frontend/src/hooks/useUpdate.ts — CREATED (contains confirmed_id)
- frontend/src/components/CandidateCard.tsx — CREATED (contains "Confirm match", "None of these — dismiss", local skipped state)
- frontend/src/components/RollupCard.tsx — CREATED (contains isAfterWorkHours gate, deriveRollup, "Day Rollup")
- frontend/src/pages/Today.tsx — MODIFIED (contains updates/resolve via useUpdate, CandidateCard, RollupCard, ?update=1 deep-link, Enter+!shiftKey handler, refresh()+fetchBlocks() calls)
- frontend/src/styles.css — MODIFIED (contains .update-input-row, .candidate-card, .rollup-card, .btn-save--inline + all 10 classes)

Commits: 6625d45, aeacc47, 6ae508a

Build: `npm run build` exits 0 (TypeScript + Vite).
Tests: 47/49 pass; 2 failures are pre-existing agenda.test.ts issues unrelated to this plan.

## Self-Check: PASSED
