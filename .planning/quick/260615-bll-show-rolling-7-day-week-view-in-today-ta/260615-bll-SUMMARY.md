---
phase: quick
plan: 260615-bll
subsystem: frontend
tags: [agenda, calendar, today-tab, week-view]
dependency_graph:
  requires: []
  provides: [buildWeekAgenda, DayGroup, rolling-7-day-today-view]
  affects: [frontend/src/pages/Today.tsx, frontend/src/lib/agenda.ts]
tech_stack:
  added: []
  patterns: [Intl.DateTimeFormat UTC formatter for deterministic labels, helper-extraction refactor]
key_files:
  created: []
  modified:
    - frontend/src/lib/agenda.ts
    - frontend/src/lib/agenda.test.ts
    - frontend/src/pages/Today.tsx
decisions:
  - Use Intl.DateTimeFormat with timeZone UTC + Date.UTC noon anchor to make weekday labels deterministic across host timezones
  - Extract buildDayItems helper so both buildAgenda and buildWeekAgenda share identical per-day filter/map/sort logic
  - DayGroup type exported from agenda.ts (not added to types/task.ts — agenda-specific concern)
  - Reconciled with the mark-done feature (260615-bi1) that landed on master concurrently — week view shows completed items crossed-out and wires onToggle through DaySection
metrics:
  completed_date: "2026-06-15"
  tasks_completed: 2
  files_modified: 3
---

# Quick 260615-bll: Rolling 7-Day Week View in Today Tab — Summary

**One-liner:** Rolling 7-day agenda (Today through +6) via `buildWeekAgenda`, with per-day headings, all-day-first ordering, "Nothing scheduled" on empty days, and the existing mark-done checkboxes preserved per day.

## What Was Built

**`frontend/src/lib/agenda.ts`**
- Extracted `buildDayItems(tasks, events, dateKey)` — the per-day filter/map/sort logic previously inlined in `buildAgenda`.
- `buildAgenda` now delegates to `buildDayItems` with today's dateKey (behavior unchanged).
- Added `buildWeekAgenda(tasks, events, now)` returning 7 `DayGroup` objects (offset 0–6 from `now`).
- Labels: "Today", "Tomorrow", then `Intl.DateTimeFormat("en-US", { weekday:"short", month:"short", day:"numeric", timeZone:"UTC" })` anchored at `Date.UTC(y, m, d, 12)` for determinism.
- Exported `DayGroup` interface `{ dateKey: string; label: string; items: AgendaItem[] }`.
- `buildDayItems` populates the mark-done fields (`completed`, `taskId`, `googleId`) and includes completed items so they render crossed-out.

**`frontend/src/pages/Today.tsx`**
- Replaced `buildAgenda` with `buildWeekAgenda`; title changed to "This Week".
- Added `DaySection` component: day heading, optional "All day" subsection, timed items list.
- Empty days render their heading + "Nothing scheduled" (all 7 days always visible).
- `handleToggle` (patchTask / patchEvent) threaded through `DaySection` to each `AgendaItem`.

**`frontend/src/lib/agenda.test.ts`**
- All existing `buildAgenda` tests retained (including the mark-done assertions).
- Added `buildWeekAgenda` suite: 7-group length/dateKey, label format, day bucketing, per-day ordering, completed-item inclusion, window exclusion.
- 20 tests pass.

## Reconciliation Note

The executor ran in a worktree based on the pre-mark-done commit (`fcb844a`), while `master` had concurrently gained the mark-done feature (`260615-bi1`) touching the same three files. The two changes were merged by hand in the main tree rather than fast-forwarding the stale worktree branch, so both features coexist. The stale worktree branch was discarded.

## Verification

- `npx vitest run src/lib/agenda.test.ts`: 20 passed
- `npx tsc -b`: clean
