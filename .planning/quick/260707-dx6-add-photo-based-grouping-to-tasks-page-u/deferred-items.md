# Deferred Items — quick-260707-dx6

## Pre-existing test failures (out of scope)

`npm test -- --run` shows 2 failing tests in `src/lib/agenda.test.ts`:
- `buildAgenda > places a timed task (10:30) between standup (09:00) and lunch (12:00)`
- `buildAgenda > maps calendar event to AgendaItem with isEvent:true and no priority`

Neither `src/lib/agenda.ts` nor `src/lib/agenda.test.ts` was touched by this quick task (confirmed via `git diff` — no changes). Failures appear time/timezone-dependent (unrelated to the group-photos / Tasks.tsx work here). Not fixed — out of scope per task boundary.
