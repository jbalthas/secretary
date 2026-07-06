---
phase: 13-update-loop-ui
plan: "01"
subsystem: frontend-lib
tags: [tdd, pure-functions, rollup, time-utils, vitest]
dependency_graph:
  requires: []
  provides: [isAfterWorkHours, deriveRollup]
  affects: [Today.tsx (Wave 2)]
tech_stack:
  added: []
  patterns: [vitest fake timers, pure lib functions, partial-object cast pattern]
key_files:
  created:
    - frontend/src/lib/timeUtils.ts
    - frontend/src/lib/timeUtils.test.ts
    - frontend/src/lib/rollup.ts
    - frontend/src/lib/rollup.test.ts
  modified: []
decisions:
  - "isAfterWorkHours uses >= boundary (now.getMinutes() >= m) for exact-minute match"
  - "rollup.test.ts uses full Task/ScheduledBlock types with makeTask/makeBlock helpers following agenda.test.ts idiom"
  - "deriveRollup treats completed=true as completed per UI-SPEC; ambiguity with Phase 12-04 drop documented in code comment"
metrics:
  duration_minutes: 2
  completed_date: "2026-06-23"
  tasks_completed: 2
  files_changed: 4
requirements_closed: [UPDATE-01, UPDATE-04]
---

# Phase 13 Plan 01: Pure Lib Functions — isAfterWorkHours + deriveRollup Summary

**One-liner:** Two TDD'd pure lib functions — `isAfterWorkHours` (HH:MM string gate with fake-timer tests) and `deriveRollup` (completed-vs-slipped classifier for tasks + blocks) — wiring Wave 2 Today.tsx's rollup render gate.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | isAfterWorkHours gate + tests | d167110 | frontend/src/lib/timeUtils.ts, frontend/src/lib/timeUtils.test.ts |
| 2 | deriveRollup classifier + tests | 7b5e19b | frontend/src/lib/rollup.ts, frontend/src/lib/rollup.test.ts |

## Verification Results

- `npm test -- --run src/lib/timeUtils.test.ts`: 5/5 passed
- `npm test -- --run src/lib/rollup.test.ts`: 8/8 passed
- `npm test -- --run src/lib/timeUtils.test.ts src/lib/rollup.test.ts`: 13/13 passed
- Full suite: 2 pre-existing failures in agenda.test.ts (pre-date this plan; see Deferred section)

## Decisions Made

1. `isAfterWorkHours` uses `>=` on the minute boundary — returns `true` at exactly `workEnd` (e.g., "18:00" at 18:00 → true).
2. `deriveRollup` uses `due_date.slice(0, 10)` to match ISO strings against todayKey, consistent with `agenda.ts` idiom.
3. Phase 12-04 ambiguity (drop reuses `completed=True`) documented as a code comment in `rollup.ts` — rollup treats all `completed=true` today-items as "completed" per UI-SPEC decision.
4. Test helpers `makeTask`/`makeBlock` follow partial-override factory pattern from `agenda.test.ts`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both lib files are fully implemented and testable.

## Deferred Items

Pre-existing `agenda.test.ts` failures (2 tests) are out of scope for this plan:
- `places a timed task (10:30) between standup (09:00) and lunch (12:00)`
- `maps calendar event to AgendaItem with isEvent:true and no priority`

These fail on the base commit before Plan 13-01 was executed. They are not caused by any changes in this plan.

## Self-Check: PASSED

Files exist:
- frontend/src/lib/timeUtils.ts: FOUND
- frontend/src/lib/timeUtils.test.ts: FOUND
- frontend/src/lib/rollup.ts: FOUND
- frontend/src/lib/rollup.test.ts: FOUND

Commits exist:
- d167110: FOUND
- 7b5e19b: FOUND
