# Deferred Items — Phase 17

Out-of-scope issues discovered during execution but not fixed (per scope boundary rules).

## agenda.test.ts: 2 pre-existing timezone-dependent test failures

- **Found during:** 17-02 Task 3 full verification run (`npx vitest run src/lib/taskHierarchy.test.ts src/lib/dragIntent.test.ts src/lib/agenda.test.ts`)
- **Failing tests:** `buildAgenda > places a timed task (10:30) between standup (09:00) and lunch (12:00)`, `buildAgenda > maps calendar event to AgendaItem with isEvent:true and no priority`
- **Root cause:** `agenda.ts`'s `buildDayItems()` calls `new Date(e.start_dt).getHours()`/`.getMinutes()` (local time) on UTC ISO timestamps fixed in the test fixtures (e.g. `"...T15:00:00Z"`). On a machine whose system timezone is not UTC (this execution environment resolves to `America/Chicago`, confirmed via `Intl.DateTimeFormat().resolvedOptions().timeZone`), the local hour differs from the UTC hour baked into the test's expected value, so the assertion fails.
- **Confirmed pre-existing:** Reproduced identically against `ce93d2a` (the commit immediately before this plan's Task 1 changes) via `git show ce93d2a:frontend/src/lib/agenda.test.ts` diff-check and a stash/pop cycle — same 2 failures, same messages, with none of Plan 17-02's `parent_task_id`/`parentTaskId` changes present.
- **Scope:** Unrelated to this plan's type/hierarchy/drag-intent work; not touched by any 17-02 file.
- **Action:** Not fixed — out of scope for Plan 17-02. Flag for a dedicated fix (switch to `getUTCHours()`/`getUTCMinutes()` in `agenda.ts`, or run tests with `TZ=UTC`).
