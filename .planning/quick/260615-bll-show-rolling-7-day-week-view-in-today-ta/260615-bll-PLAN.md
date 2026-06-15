---
phase: quick
plan: 260615-bll
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/lib/agenda.ts
  - frontend/src/lib/agenda.test.ts
  - frontend/src/pages/Today.tsx
autonomous: true
requirements: [QUICK-260615-bll]
must_haves:
  truths:
    - "Today tab shows 7 day groups: today through 6 days ahead"
    - "Each day renders under its own heading (Today, Tomorrow, then 'Wed, Jun 17' style)"
    - "Within a day, all-day items render first, then timed items ascending by time"
    - "Empty days show a subtle 'Nothing scheduled' line so all 7 days stay visible"
    - "Items outside the 7-day window are excluded"
  artifacts:
    - path: "frontend/src/lib/agenda.ts"
      provides: "buildWeekAgenda returning ordered array of day groups; buildAgenda retained for single-day items"
      contains: "buildWeekAgenda"
    - path: "frontend/src/pages/Today.tsx"
      provides: "Renders grouped day headings with all-day section + timed items per day"
    - path: "frontend/src/lib/agenda.test.ts"
      provides: "Tests for week bucketing, labels, per-day ordering, window exclusion"
      contains: "buildWeekAgenda"
  key_links:
    - from: "frontend/src/pages/Today.tsx"
      to: "buildWeekAgenda"
      via: "import + call with tasks, events"
      pattern: "buildWeekAgenda"
---

<objective>
Convert the Today tab from a single-day agenda into a rolling 7-day week view (today through 6 days ahead), grouped by day under per-day headings.

Purpose: Surface the week at a glance instead of just today, while preserving the existing per-day ordering and AgendaItem rendering.
Output: `buildWeekAgenda` in agenda.ts, updated Today.tsx rendering grouped days, extended agenda.test.ts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Existing contracts. Use directly — no exploration needed. -->

From frontend/src/types/task.ts:
```typescript
export interface AgendaItem {
  id: string;
  title: string;
  time: string | null;
  priority: Priority | null;
  isEvent: boolean;
}
export interface CalendarEvent {
  google_id: string;
  title: string;
  start_dt: string | null;
  end_dt: string | null;
  all_day: boolean;
  start_date: string | null;
}
export interface Task {
  id: number; title: string; priority: Priority;
  due_date?: string; completed: boolean; /* ... */
}
```

Current buildAgenda (single-day, the reference behavior to preserve per day):
```typescript
// agenda.ts — filters tasks/events to a target date string (YYYY-MM-DD),
// builds AgendaItems, all-day (T00:00:00 / e.all_day) get time=null,
// returns [...allDayItems, ...timedSortedAscByTime].
```

AgendaItem.tsx is unchanged — it takes `{ item: AgendaItem }` and renders title, optional priority badge, optional time. Reuse as-is.

Today.tsx currently splits agenda into allDayItems/timedItems and renders an "All day" section heading + rows.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add buildWeekAgenda to agenda.ts and extend tests</name>
  <files>frontend/src/lib/agenda.ts, frontend/src/lib/agenda.test.ts</files>
  <behavior>
    buildWeekAgenda(tasks, events, now = new Date()) returns an ordered array of exactly 7 day groups, index 0 = today, index 6 = today+6.
    Each group: { dateKey: "YYYY-MM-DD", label: string, items: AgendaItem[] }.
    - label: "Today" for offset 0, "Tomorrow" for offset 1, otherwise weekday-short + date like "Wed, Jun 17".
    - items per day: reuse single-day logic (all-day first, then timed ascending by time). Refactor existing per-day logic into a helper that buildAgenda and buildWeekAgenda both call, OR have buildWeekAgenda compute the date string per offset and reuse the existing filtering/mapping. Keep buildAgenda(tasks, events, now) exported and behaviorally unchanged (single day = today).
    - Tasks/events outside the 7-day window are excluded (appear in no group).
    Tests to add (preserve existing single-day buildAgenda tests verbatim):
    - "buildWeekAgenda returns 7 groups": length === 7, group[0].dateKey === TODAY (2026-06-12).
    - "labels: Today / Tomorrow / weekday-date": group[0].label === "Today", group[1].label === "Tomorrow", group[2].label matches /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/ (e.g. "Sun, Jun 14").
    - "buckets items into correct day": a task due TODAY+2 (2026-06-14) lands only in group[2].items; a TODAY task lands only in group[0].
    - "per-day ordering preserved": within a day, all-day item precedes timed item; two timed items sorted ascending (reuse the 09:00/10:30/12:00 pattern inside one day).
    - "excludes items outside window": a task due TODAY+7 (2026-06-19) appears in no group; a task due yesterday (2026-06-11) appears in no group.
    Build date keys deterministically from `now` using the same local getFullYear/getMonth/getDate construction already in agenda.ts (offset via new Date(now) + setDate). Do NOT introduce a date library.
  </behavior>
  <action>
    In agenda.ts: extract a private helper (e.g. buildDayItems(tasks, events, dateKey)) holding the current filter/map/sort logic from buildAgenda, keyed on a passed dateKey string instead of computing `today` internally. Keep buildAgenda(tasks, events, now) calling buildDayItems with today's key (same output as today).
    Add a dateKey helper that formats a Date to "YYYY-MM-DD" using local getFullYear/getMonth/getDate (matching existing code), and a label helper (offset 0 -> "Today", 1 -> "Tomorrow", else Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format with timeZone "UTC" to stay deterministic against the UTC-based test dates — verify label format against the regex test; adjust timeZone if it shifts the day).
    Export buildWeekAgenda(tasks, events, now = new Date()): loop offset 0..6, clone now, setDate(now.getDate()+offset), compute dateKey + label + buildDayItems(...), push { dateKey, label, items }.
    Export a DayGroup type ({ dateKey: string; label: string; items: AgendaItem[] }) from agenda.ts (do not add to types/task.ts unless cleaner).
    Follow CLAUDE.md: explicit over clever, no premature abstraction, no comments unless WHY is non-obvious.
    Update agenda.test.ts with the tests in <behavior>; keep all existing buildAgenda tests.
  </action>
  <verify>
    <automated>cd frontend; npm test -- --run src/lib/agenda.test.ts</automated>
  </verify>
  <done>buildWeekAgenda and DayGroup exported; all new + existing tests pass; buildAgenda single-day behavior unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Render grouped week in Today.tsx</name>
  <files>frontend/src/pages/Today.tsx</files>
  <action>
    Replace buildAgenda usage with buildWeekAgenda(tasks, events). Import buildWeekAgenda (and DayGroup type if needed) from "../lib/agenda".
    For each day group, render a section: a day heading (the group.label) styled like a section heading, then within it reuse the existing all-day-vs-timed split logic (allDay = items with time === null shown under a subtle "All day" line, then timed items), rendering each via the existing <AgendaItem item={item} /> component (unchanged).
    Empty days: render the heading plus a subtle "Nothing scheduled" line (style like the existing secondary text: fontSize 14, color var(--text-secondary)) so all 7 days remain visible.
    All-empty week: keep a single friendly top-level state — if every group is empty, you may still show the 7 headings with "Nothing scheduled" each (that satisfies the locked decision); the prior centered "Nothing scheduled today" empty block can be removed since each day now carries its own empty line.
    Keep the page wrapper (<div className="page"> + <h1 className="page-title">Today</h1>). Use inline styles consistent with the existing file (this file already uses inline styles; do not introduce new CSS files). React keys: use group.dateKey for day sections and item.id for items.
    Follow CLAUDE.md: explicit over clever, no premature abstraction.
  </action>
  <verify>
    <automated>cd frontend; npx tsc --noEmit; npm run build</automated>
  </verify>
  <done>Today.tsx compiles and builds; renders 7 day groups with labels, per-day all-day + timed items, and "Nothing scheduled" on empty days.</done>
</task>

</tasks>

<verification>
- `cd frontend; npm test -- --run src/lib/agenda.test.ts` passes (week bucketing, labels, per-day ordering, window exclusion, plus all retained single-day tests).
- `cd frontend; npx tsc --noEmit` clean.
- `cd frontend; npm run build` succeeds.
</verification>

<success_criteria>
- Today tab shows today + next 6 days as 7 grouped sections with correct headings (Today / Tomorrow / "Wed, Jun 17").
- Items bucket into the correct day; within a day all-day first then timed ascending.
- Empty days show "Nothing scheduled"; items outside the window are excluded.
- buildAgenda single-day behavior and AgendaItem component unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/260615-bll-show-rolling-7-day-week-view-in-today-ta/260615-bll-SUMMARY.md`
</output>
