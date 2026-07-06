---
phase: quick-260624-kmx
plan: 01
subsystem: frontend
tags: [today-page, now-view, ux, components]
dependency_graph:
  requires: []
  provides: [NowHero, MomentumStrip, TodayTimeline, nowView.ts]
  affects: [frontend/src/pages/Today.tsx]
tech_stack:
  added: []
  patterns: [pure-derivation-lib, props-driven-components, css-token-convention]
key_files:
  created:
    - frontend/src/lib/nowView.ts
    - frontend/src/components/NowHero.tsx
    - frontend/src/components/MomentumStrip.tsx
    - frontend/src/components/TodayTimeline.tsx
  modified:
    - frontend/src/pages/Today.tsx
    - frontend/src/styles.css
decisions:
  - NowHero falls back to estimated_minutes when contextLine is null (richer UX at no extra cost)
  - markTimeline all-day items marked "upcoming"; HH:MM string compare is safe since agenda.ts pre-sorts items
  - Integration applied append-only onto the real branch; all executor-recreated Phase 13 files discarded (see Integration Note)
metrics:
  completed: 2026-06-24
  tasks_completed: 3
  files_changed: 6
---

# Quick 260624-kmx: Redesign Today Page into Now View

**One-liner:** Today tab restaged as the "Now" view — RIGHT NOW hero card (next-best task), two-stat momentum strip (done/remaining today), and a vertical timeline rail for today's agenda with a now-marker and phase-dimming.

## What Was Built

**`frontend/src/lib/nowView.ts`** — Four pure helpers:
- `deriveMomentum(tasks, blocks, todayKey)` — delegates to existing `deriveRollup`, maps completedCount/slippedCount to doneToday/remainingToday
- `nextEventLabel(events, now)` — picks soonest timed upcoming event, formats as "Next: 2:30 PM"
- `markTimeline(items, nowHHMM)` — returns `Array<{ item, phase }>` (past/now/upcoming); all-day → upcoming; first timed item >= now → now
- `currentHHMM(now)` — formats Date as "HH:MM"

**`NowHero`** — Prominent card with accent left border: RIGHT NOW label, task title, context line (next event time, or `~N min` from `estimated_minutes` as fallback), and "Start focus" button. Positive empty state when no next-best task.

**`MomentumStrip`** — Two stat cells (big number + label): Done Today / Remaining, derived honestly from `deriveMomentum`. No streak — the frontend `Task` type has no `completed_at`, so a streak isn't derivable without backend work; "Remaining" substituted.

**`TodayTimeline`** — Vertical rail with a `::before` spine. Each row's node is colored by phase: past (dimmed), now (accent + ring), upcoming (hollow). Past rows opacity-dimmed. Item body delegates to the existing `AgendaItem` so toggle behavior is unchanged.

**`Today.tsx`** — Title changed "This Week" → "Now"; `FocusBanner` replaced by `NowHero` above the fold; `MomentumStrip` below; update box / candidate flow / `RollupCard` preserved; today's group rendered via `TodayTimeline`; rest-of-week via the existing `DaySection`.

## Integration Note (important)

The executor ran in an isolated worktree that branched from a **stale base** (`fab9f8e`, *before* the Phase 13-03/13-04 commits on `codex/preserve-completed-calendar-items`). It therefore did not have the real Phase 13 files (`rollup.ts`, `RollupCard`, `useUpdate`, `CandidateCard`, `timeUtils.ts`, `types/update.ts`, the `usePlan.patchBlock`/`ScheduledBlock.completed` additions, and the Phase 13 CSS) and **recreated its own copies** to make the plan compile.

Merging that branch back would have regressed real work. Audit before integrating:
- The recreated Phase 13 files were **near-identical** to the real ones — except `usePlan.ts` (dropped the `propose` work-hours params + `deleteBlock` error handling) and `rollup.ts` (dropped a clarifying comment). Both regressions.
- The worktree's `styles.css` had **lost a block of `.organize-*` classes** vs. the real branch.

**Resolution:** discarded every executor-recreated file. Applied **only** the redesign onto the real branch — the 4 new files plus the surgical `Today.tsx` diff (verified clean against the real file) and an append-only `/* Now view */` block on the real `styles.css`. The worktree branch (`worktree-agent-ad093b9e2e61015f9`) was not merged.

## Verification

- `npx tsc --noEmit` — clean (0 errors), against the real Phase 13 files
- `npm run build` — clean (vite 8, 320 kB / 95.7 kB gzip)
- `npm test` — 47/49 pass. The 2 failures are in `agenda.test.ts`, are **pre-existing and timezone-dependent** (test hardcodes `15:00`, machine TZ yields `10:00`), and are unrelated to this change (`agenda.ts`/`agenda.test.ts` untouched).

## Known Stubs

The "Start focus" button is wired to an optional `onStart` prop defaulting to no-op — there is intentionally no focus backend in this pass. First-pass scope; meant to be iterated on.
