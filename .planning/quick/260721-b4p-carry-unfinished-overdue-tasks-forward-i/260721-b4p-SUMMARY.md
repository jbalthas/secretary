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
    - frontend/src/lib/taskHierarchy.ts
    - frontend/src/lib/taskHierarchy.test.ts

key-decisions:
  - "Carried overdue items get time: null so nowView.ts's markTimeline treats them as 'upcoming' rather than 'past' on a stale clock time"
  - "Overdue items returned as [...overdueItems, ...allDayItems, ...timed] so they sort above all-day items in the Today group"
  - "rollup.ts left untouched per hard constraint — 'slipped' accounting stays pinned to the exact due date"
  - "groupAgendaItemsByParent promotes an item to topLevel whenever its parentTaskId isn't present in the current item list (checked via a taskId Set), instead of unconditionally filing it under childrenByTaskId — fixes a latent orphan-drop bug that browser verification against real DB data surfaced once carry-forward started producing items with a parentTaskId whose parent had no due_date"

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

---

## Addendum: Golden-path browser verification fix (post-completion)

Browser verification against real DB data (task id=4 "Bike Maintenance", due
2026-07-08, completed=false, parent_task_id=3; parent task id=3 has
due_date=null; today=2026-07-21) found the carried-forward task was counted
("1 items" in the "Your day" heading) but rendered nothing — `today-timeline`
was empty. The originally reported bug ("tasks that are not marked off should
remain until complete") was therefore not actually fixed for any carried task
that has a `parent_task_id` pointing at a parent not present in today's
agenda.

### Root cause

`groupAgendaItemsByParent` in `frontend/src/lib/taskHierarchy.ts` unconditionally
filed any item with a non-null `parentTaskId` into `childrenByTaskId`,
regardless of whether that parent actually existed in the current item list.
`TodayTimeline` only renders `topLevel` items directly and reaches children via
`childrenByTaskId.get(parent.taskId)` — so when the parent (task 3, no
due_date) never appeared in today's items, task 4 was filed as an orphaned
child with no parent row to hang off of and silently dropped. This is a
pre-existing latent bug in the hierarchy grouping logic, not something
introduced by the carry-forward feature itself — but carry-forward is what
first produces overdue items whose original parent legitimately has no
due_date, so it's the first path that triggers it on real data.

### Fix

**1. [Rule 1 - Bug] Promote orphaned agenda items to topLevel in `groupAgendaItemsByParent`**
- **Found during:** post-completion golden-path browser verification (coordinator-reported)
- **Issue:** An item whose `parentTaskId` pointed at a task absent from the current item list was filed into `childrenByTaskId` and never rendered, since no top-level row existed to nest it under
- **Fix:** Build a `Set<number>` of `taskId`s present in the item list first. An item is now nested under `childrenByTaskId` only when `item.parentTaskId != null` AND that id is in the present-taskId set; otherwise it is promoted to `topLevel`. `topLevel` is built by iterating `items` once (not `.filter()`), so promoted orphans keep their original position — a promoted overdue orphan still sorts above all-day items in the Today group, since `buildDayItems` already places overdue items first
- **Files modified:** `frontend/src/lib/taskHierarchy.ts`
- **Tests added:** `frontend/src/lib/taskHierarchy.test.ts` — (a) orphaned child (parent absent from items) appears in `topLevel` and never in `childrenByTaskId`; (b) child with parent present still nests exactly as before (regression); (c) an agenda-level integration case piping `buildAgenda()` output (real-data-shaped: overdue task with a `parent_task_id` whose parent has no `due_date`, alongside an all-day task) through `groupAgendaItemsByParent`, asserting the overdue orphan is promoted to `topLevel` ahead of the all-day item and never appears in any `childrenByTaskId` list
- **Verification:** `npx vitest run src/lib/taskHierarchy.test.ts` — 16/16 passed. Full suite `npx vitest run` — 124/126 passed (same 2 pre-existing timezone-dependent failures noted above, confirmed no new failures). `npx tsc --noEmit` — clean.
- **Committed in:** `3f02983`

**Total deviations (this addendum):** 1 auto-fixed (Rule 1 - bug in an existing, previously-untested function that carry-forward's real-data shape exposed).
**Impact:** Necessary for the plan's actual goal (user sees carried-forward tasks) to hold on real data with task hierarchy in use. No scope creep — fix is confined to the grouping function's presence check; D-03/D-10 drag-and-nest behavior for present-parent cases is unchanged and covered by the existing/updated tests.

### Updated verification (real output)

```
cd frontend && npx vitest run src/lib/taskHierarchy.test.ts
  Test Files  1 passed (1)
       Tests  16 passed (16)

cd frontend && npx vitest run
  Test Files  1 failed | 13 passed (14)
       Tests  2 failed | 124 passed (126)
  (failures: agenda.test.ts > "places a timed task..." and
   agenda.test.ts > "maps calendar event..." — both pre-existing,
   local-timezone-dependent, logged in deferred-items.md, confirmed
   present on master before any of this task's changes)

cd frontend && npx tsc --noEmit
  (no output — clean)
```
