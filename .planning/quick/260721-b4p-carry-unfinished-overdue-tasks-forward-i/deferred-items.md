# Deferred Items — quick-260721-b4p

Out-of-scope, pre-existing failures confirmed present on `master` (7d97fb4) before
this task's changes, via `git stash` + re-run. Not caused by this task's files
(`frontend/src/lib/agenda.ts`, `frontend/src/types/task.ts`,
`frontend/src/components/AgendaItem.tsx`, `frontend/src/styles.css`).

## 1. `agenda.test.ts` — local-timezone-dependent flakiness

- `buildAgenda > places a timed task (10:30) between standup (09:00) and lunch (12:00)`
- `buildAgenda > maps calendar event to AgendaItem with isEvent:true and no priority`

Both failures come from `buildDayItems`' event-time mapping using
`d.getHours()/d.getMinutes()` (local time) against UTC-suffixed fixture strings
(`${TODAY}T09:00:00Z`, etc.). On a machine whose local timezone offset from UTC
shifts the hour, the computed `time` string no longer matches the UTC hour the
test expects. Unrelated to the carry-forward feature — left unfixed per scope
boundary (pre-existing, not touched by this task's files).
