# Deferred Items — quick-260721-b6t

## Pre-existing test failures (out of scope)

- `frontend/src/lib/agenda.test.ts` — 2 failing tests:
  - `places a timed task (10:30) between standup (09:00) and lunch (12:00)`
  - `maps calendar event to AgendaItem with isEvent:true and no priority`
  Both appear timezone/DST-dependent (expected "15:00" received "10:00"). Not touched by
  this plan (`frontend/src/lib/agenda.ts` / `agenda.test.ts` not in the plan's file list,
  last modified by an unrelated prior quick task `quick-260715-k5j` / `quick-260721-b4p`).
  Confirmed present before this plan's changes; logged, not fixed.
