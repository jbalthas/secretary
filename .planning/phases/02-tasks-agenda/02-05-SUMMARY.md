---
phase: 02-tasks-agenda
plan: 05
subsystem: frontend
tags: [agenda, today-view, vitest, tdd, calendar]
dependency_graph:
  requires: [02-02, 02-03]
  provides: [today-agenda-view, buildAgenda, AgendaItem]
  affects: [frontend/src/pages/Today.tsx]
tech_stack:
  added: [vitest, jsdom]
  patterns: [TDD red-green, buildAgenda merge/sort, injectable now for deterministic tests]
key_files:
  created:
    - frontend/src/lib/agenda.ts
    - frontend/src/lib/agenda.test.ts
    - frontend/src/components/AgendaItem.tsx
  modified:
    - frontend/src/pages/Today.tsx
    - frontend/vite.config.ts
    - frontend/package.json
decisions:
  - buildAgenda accepts injectable `now: Date` so tests are deterministic (no tz drift)
  - All-day detection: due_date time component T00:00:00 = all-day (no meaningful time)
  - PLACEHOLDER_EVENTS as named export so Phase 4 can swap in real calendar events
metrics:
  duration: ~40min
  completed_date: "2026-06-12"
  tasks_completed: 3
  files_changed: 6
requirements: [CAL-05]
---

# Phase 02 Plan 05: Today Agenda View Summary

Today agenda view merging today's tasks with hardcoded placeholder calendar events into a chronological timeline, all-day tasks pinned at top, calendar events styled distinctly (italic, no priority badge), with vitest unit coverage of the buildAgenda merge/sort logic.

## Tasks Completed

| # | Name | Commit | Notes |
|---|------|--------|-------|
| 1 | Add vitest + buildAgenda merge logic (tested) | 159b95e | TDD green; agenda.test.ts covers sort, all-day, exclusions |
| 2 | AgendaItem component + Today page | fa10cb5 | Build passes; Today renders merged agenda |
| 3 | Verify merged agenda on phone browser | (human-verify) | Approved by user |

## What Was Built

- `frontend/src/lib/agenda.ts` — `buildAgenda(tasks, now)` merges today's incomplete tasks with `PLACEHOLDER_EVENTS` (Team standup 09:00, Lunch 12:00); all-day items first, timed items sorted ascending by HH:mm string comparison.
- `frontend/src/lib/agenda.test.ts` — vitest suite covering: timed task sorts between standup and lunch, all-day task appears first, completed task excluded, non-today task excluded.
- `frontend/src/components/AgendaItem.tsx` — renders a task or calendar event row; events render italic with no priority badge; tasks show priority badge and time; all-day items show no time.
- `frontend/src/pages/Today.tsx` — replaced stub; calls `useTasks()` + `buildAgenda()`; renders "All day" section header when all-day items exist; empty state when agenda is empty.
- `frontend/vite.config.ts` / `package.json` — vitest added with jsdom environment; `npm test` script wired.

## Verification

- `npm test -- --run` exits 0 (all agenda tests pass)
- `npm run build` exits 0
- Human checkpoint: approved — Today tab shows placeholder events, tasks due today appear in chronological order with priority badges, all-day tasks appear under All day header, calendar events render in italic without priority badge.

## Decisions Made

1. Injectable `now` parameter on `buildAgenda` — tests pass a fixed date so results are deterministic regardless of when tests run.
2. All-day detection via `T00:00:00` time component — simple, matches how the task API stores "date only" due dates.
3. `PLACEHOLDER_EVENTS` as a named export — Phase 4 (Google Calendar sync) can replace or augment this array without touching buildAgenda's signature.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `PLACEHOLDER_EVENTS` in `frontend/src/lib/agenda.ts` contains two hardcoded events (Team standup, Lunch). These are intentional placeholders per D-10; Phase 4 (calendar sync) will replace them with real Google Calendar events.

## Self-Check: PASSED

- `frontend/src/lib/agenda.ts` — created (Task 1, commit 159b95e)
- `frontend/src/lib/agenda.test.ts` — created (Task 1, commit 159b95e)
- `frontend/src/components/AgendaItem.tsx` — created (Task 2, commit fa10cb5)
- `frontend/src/pages/Today.tsx` — modified (Task 2, commit fa10cb5)
- Human checkpoint approved
