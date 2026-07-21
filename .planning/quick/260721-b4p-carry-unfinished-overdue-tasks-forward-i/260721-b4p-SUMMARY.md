---
phase: quick-260721-b4p
plan: 01
subsystem: ui
tags: [react, agenda, today-view, vitest]

requires: []
provides:
  - Overdue-carry-forward of incomplete past-due tasks into the Today group (frontend-only)
  - overdue?: boolean flag on AgendaItem
  - Overdue badge component styling
affects: [today-view, tasks-agenda]

tech-stack:
  added: []
  patterns:
    - "buildDayItems 5th param (carryOverdue: boolean) gates carry-forward per call site instead of comparing dateKey to wall-clock now — keeps the function deterministic for tests"
    - "String YYYY-MM-DD lexicographic comparison for date-before checks (no Date parsing)"

key-files:
  created: []
  modified:
    - frontend/src/types/task.ts
    - frontend/src/lib/agenda.ts
    - frontend/src/lib/agenda.test.ts
    - frontend/src/components/AgendaItem.tsx
    - frontend/src/styles.css

key-decisions:
  - "Carried overdue items get time: null so nowView.ts's markTimeline treats them as 'upcoming' rather than 'past' on a stale clock time"
  - "Overdue items returned as [...overdueItems, ...allDayItems, ...timed] so they sort above all-day items in the Today group"
  - "rollup.ts left untouched per hard constraint — 'slipped' accounting stays pinned to the exact due date"

patterns-established:
  - "Display-level carry-forward implemented purely in the agenda builder; no backend write, no due_date mutation"

requirements-completed: [QUICK-260721-B4P]

duration: 25min
completed: 2026-07-21
---

# Quick Task 260721-b4p: Carry Unfinished Overdue Tasks Forward Summary

**Incomplete tasks whose due date has passed now surface in the Today group's timeline with an Overdue badge, instead of silently disappearing from the UI — frontend-display-only, no due_date write.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-21T13:05:30Z
- **Tasks:** 2/2 completed
- **Files modified:** 5

## Accomplishments
- `buildDayItems` in `frontend/src/lib/agenda.ts` gained a `carryOverdue` boolean 5th param; when true, incomplete tasks with `due_date` before the target day are mapped into a separate `overdueItems` list (`overdue: true`, `time: null`) and prepended ahead of all-day items
- `buildAgenda` always carries (it is the today view); `buildWeekAgenda` only carries on `offset === 0` (the Today group), so overdue items never leak into Tomorrow or later day groups
- `AgendaItem.overdue?: boolean` added to the shared type; `AgendaItem.tsx` renders an `.overdue-badge` pill (reusing `.priority-high`'s red) immediately before the priority badge
- 6 new regression tests + 2 existing fixtures updated (yesterday-dated tasks switched to `completed: true` so they correctly stay excluded now that incomplete-yesterday tasks are carried forward by design)

## Task Commits

Each task was committed atomically:

1. **Task 1: Carry incomplete past-due tasks into the Today group** - `d5be4ec` (test, TDD RED→GREEN in one commit per plan's `tdd="true"` + inline verification)
2. **Task 2: Render the Overdue badge** - `6ac1fbd` (feat)

**Plan metadata:** (this commit, pending)

_Note: Task 1 is marked `tdd="true"` in the plan; tests were written first and confirmed failing (RED) via `npx vitest run src/lib/agenda.test.ts` before implementation, then confirmed passing (GREEN) — both stages landed in a single commit since the plan's task-commit granularity is per-task, not per-RED/GREEN step._

## Files Created/Modified
- `frontend/src/types/task.ts` - added `overdue?: boolean` to `AgendaItem`
- `frontend/src/lib/agenda.ts` - `buildDayItems` 5th param `carryOverdue`; overdue task filter/mapping; return order `[...overdueItems, ...allDayItems, ...timed]`; `buildAgenda` passes `true`, `buildWeekAgenda` passes `offset === 0`
- `frontend/src/lib/agenda.test.ts` - 6 new tests (carry-forward, completed-exclusion, no-leak-into-other-days, ordering, `time`/`taskId` shape, today-task-not-overdue) + 2 regression fixtures updated
- `frontend/src/components/AgendaItem.tsx` - `overdue-badge` span rendered before the priority badge block
- `frontend/src/styles.css` - `.overdue-badge` rule added next to `.priority-badge`/`.priority-high`

## Decisions Made
- Gated carry-forward via an explicit `carryOverdue` param rather than comparing `dateKey` to wall-clock `now` inside `buildDayItems`, preserving the injectable-`now` deterministic-test convention from plan 02-05
- Confirmed `frontend/src/lib/nowView.ts` and `frontend/src/hooks/useNextBestTask.ts` need no changes — `markTimeline` already treats `time === null` as "upcoming", and next-best-task selection is server-side and out of scope for this frontend-only change

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Two pre-existing test failures in `frontend/src/lib/agenda.test.ts` were observed both before and after this task's changes (confirmed via `git stash` + re-run on unmodified `master`):
- `buildAgenda > places a timed task (10:30) between standup (09:00) and lunch (12:00)`
- `buildAgenda > maps calendar event to AgendaItem with isEvent:true and no priority`

Root cause: `buildDayItems`' calendar-event time mapping uses `d.getHours()/d.getMinutes()` (local time) against UTC-suffixed fixture strings, so results depend on the executing machine's local timezone offset. Unrelated to any file this task touches (event-time mapping is untouched code). Logged to `.planning/quick/260721-b4p-carry-unfinished-overdue-tasks-forward-i/deferred-items.md`, not fixed, per scope boundary rules — out of scope for a frontend-only carry-forward task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Overdue carry-forward is complete and isolated to the Today view; no follow-up work required by this task's brief
- The two pre-existing timezone-flaky tests remain open in `deferred-items.md` for a future fix (likely: switch `buildDayItems`' event-time formatting to UTC getters, matching the pattern already used elsewhere in the file, e.g. `weekdayDateFmt`'s `timeZone: "UTC"`)

---
*Phase: quick-260721-b4p*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 7 claimed files found on disk; both task commits (d5be4ec, 6ac1fbd) verified present in git log.
