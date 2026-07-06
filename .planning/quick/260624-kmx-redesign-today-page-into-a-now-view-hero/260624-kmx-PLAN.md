---
phase: quick-260624-kmx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/Today.tsx
  - frontend/src/components/NowHero.tsx
  - frontend/src/components/MomentumStrip.tsx
  - frontend/src/components/TodayTimeline.tsx
  - frontend/src/lib/nowView.ts
  - frontend/src/styles.css
autonomous: true
requirements: [QUICK-260624-KMX]
must_haves:
  truths:
    - "Page title reads 'Now' (not 'This Week')"
    - "A prominent RIGHT NOW hero card shows the next-best task, or a positive empty state when there is none"
    - "A momentum strip shows two honest counts derived from existing data (done today, remaining today)"
    - "Today's agenda renders as a vertical timeline rail with a 'now' marker; past items dimmed, current/next accented, upcoming hollow"
    - "The quick-capture update box and RollupCard still work and fit the new layout"
    - "Frontend typechecks/builds clean"
  artifacts:
    - path: "frontend/src/components/NowHero.tsx"
      provides: "RIGHT NOW hero card + empty state"
      min_lines: 25
    - path: "frontend/src/components/MomentumStrip.tsx"
      provides: "Two-stat momentum row"
      min_lines: 15
    - path: "frontend/src/components/TodayTimeline.tsx"
      provides: "Vertical timeline rail for today with now-marker"
      min_lines: 30
    - path: "frontend/src/lib/nowView.ts"
      provides: "Pure derivations: momentum counts + timeline item phase (past/now/upcoming)"
      contains: "export function"
  key_links:
    - from: "frontend/src/pages/Today.tsx"
      to: "NowHero"
      via: "render nextBest from useNextBestTask"
      pattern: "<NowHero"
    - from: "frontend/src/pages/Today.tsx"
      to: "TodayTimeline"
      via: "today's DayGroup from buildWeekAgenda"
      pattern: "<TodayTimeline"
    - from: "frontend/src/components/NowHero.tsx"
      to: "useCalendarEvents events"
      via: "next event time passed as context line"
      pattern: "nextEvent"
---

<objective>
Restage the Today page as a "Now" view that answers "what now?" at a glance, using only existing data and hooks. Replace the flat day-grouped headline with: a prominent RIGHT NOW hero (next-best task), a two-stat momentum strip, and a vertical timeline rail for today with a now-marker. The weekly agenda continues to render below as the existing DaySection list.

Purpose: The app currently opens on a passive list and "feels like an eh to-do list." This first pass makes it feel like something worth opening daily — without any backend change.
Output: Three new presentational components, one pure derivation lib, restructured Today.tsx, and new CSS classes following the existing convention.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md

<data_reality>
Verified against the codebase — do NOT fabricate fields beyond these:

- `useNextBestTask()` returns `{ task: Task | null }` — the hero source.
- `Task` (frontend/src/types/task.ts) has: title, priority, due_date?, estimated_minutes? (number|null), completed, NO `completed_at`. There is `updated_at` but it is NOT a reliable completion timestamp — do NOT use it to compute "done today".
- `useCalendarEvents()` returns `events: CalendarEvent[]` (today only) with `start_dt` (ISO or null), `all_day`, `done`. Use the soonest upcoming timed event's start time for the hero's context line.
- `useTasks()` returns `tasks` with `completed: boolean`. No completion date.
- `deriveRollup(tasks, blocks, todayKey)` (frontend/src/lib/rollup.ts) already computes today-keyed completed vs incomplete items. Reuse its semantics for momentum: "Done today" = completed today-keyed items; "Remaining today" = incomplete today-keyed items. This is the honest, backend-free derivation. A streak is NOT derivable (no history on the client) — use "Remaining today" as the second stat instead.
- `buildWeekAgenda(tasks, events, now, blocks)` returns 7 DayGroups; `groups[0]` (label "Today") holds today's items, each with `time: "HH:MM" | null`. Reuse this for the timeline — do not rebuild day logic.
- AgendaItem rendering (checkbox toggle behavior) lives in components/AgendaItem.tsx; `handleToggle` in Today.tsx already routes block/event/task toggles. The timeline must call the same onToggle.
</data_reality>

<css_tokens>
:root tokens: --bg #0f172a, --surface #1e293b, --accent #6366f1, --destructive #ef4444, --text #f1f5f9, --text-secondary #94a3b8, --border #334155.
Follow the "Phase 13 — Update Loop UI" block convention at the bottom of styles.css (semantic class names, flat selectors, token-based colors). Mobile-first, viewport ~380px.
</css_tokens>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pure derivations in nowView.ts</name>
  <files>frontend/src/lib/nowView.ts</files>
  <action>
Create a pure (no-React) module with deterministic helpers the components consume. Keep it dependency-light — import types only.

1. `deriveMomentum(tasks, blocks, todayKey)` → `{ doneToday: number; remainingToday: number }`.
   Reuse the exact today-keyed logic from `deriveRollup` (lib/rollup.ts): count tasks with `due_date.slice(0,10) === todayKey` and blocks with `date_key === todayKey`, split by `completed`. doneToday = completed count, remainingToday = incomplete count. Import and call `deriveRollup` rather than duplicating the filter (it already returns completedCount/slippedCount) — map slippedCount → remainingToday.

2. `nextEventLabel(events, now)` → `string | null`.
   From the today events, pick the soonest timed event (`!all_day && start_dt`) whose start is >= now, format as a short time (e.g. "Next: 2:30 PM"). Return null if none. Reuse an Intl.DateTimeFormat with hour/minute/hour12 in LOCAL time (events' start_dt is ISO; `new Date(start_dt)` then format with default local tz — matches buildWeekAgenda's local getHours usage). Return null on empty.

3. `timelineItemPhase(itemTime, nowHHMM)` → `"past" | "now" | "upcoming"`.
   itemTime is "HH:MM" | null. nowHHMM is current "HH:MM". All-day (null) items → "upcoming" (they have no clock position). For timed items: the FIRST item whose time >= nowHHMM is "now" (the current/next item); items with time < nowHHMM are "past"; the rest are "upcoming". Since this is per-item and needs the "first >= now" semantics, expose instead a `markTimeline(items, nowHHMM)` that returns `Array<{ item; phase }>` so the now-marker is computed once over the ordered list. Items arrive already sorted (buildWeekAgenda sorts timed items by time, all-day first). Mark all-day items "upcoming", then over timed items: those with time < nowHHMM → "past"; the first with time >= nowHHMM → "now"; subsequent → "upcoming".

Add a small `currentHHMM(now: Date)` helper returning local "HH:MM" (pad). Export all functions. No comments unless a WHY is non-obvious.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit</automated>
  </verify>
  <done>nowView.ts exports deriveMomentum, nextEventLabel, markTimeline, currentHHMM; tsc passes. No backend calls, no new data fields invented.</done>
</task>

<task type="auto">
  <name>Task 2: NowHero, MomentumStrip, TodayTimeline components + CSS</name>
  <files>frontend/src/components/NowHero.tsx, frontend/src/components/MomentumStrip.tsx, frontend/src/components/TodayTimeline.tsx, frontend/src/styles.css</files>
  <action>
Create three presentational components (props-driven; parent owns data/hooks, mirroring the RollupCard/CandidateCard pattern). Add matching CSS to styles.css under a new `/* Now view */` block following the Phase 13 convention. Mobile-first.

**NowHero.tsx** — props: `{ task: Task | null; contextLine: string | null; onStart?: () => void }`.
- If task: render a card with an uppercase "RIGHT NOW" label (.now-hero-label), large task title (.now-hero-title), a context line (.now-hero-context) showing `contextLine` when present (e.g. next event time, or task.estimated_minutes formatted as "~30 min" if present — prefer the passed contextLine, fall back to estimate), and a primary "Start focus" button (.now-hero-action, reuse accent button styling). The button calls onStart if provided (no-op acceptable for first pass — wire it to nothing or scroll-to; do NOT invent a focus backend).
- If task is null: positive empty state (.now-hero--empty) — "You're all caught up" with a calm subline. Keep aria-label="Right now".
- CSS: card uses --surface bg, accent left border or accent label, generous padding, rounded. Title ~20px. Make it visually the headline (more prominent than the old FocusBanner).

**MomentumStrip.tsx** — props: `{ doneToday: number; remainingToday: number }`.
- A flat row (.momentum-strip) of two stat cells (.momentum-stat): big number (.momentum-stat-value) + small uppercase label (.momentum-stat-label) "DONE TODAY" and "REMAINING". Two columns, equal width, gap, on --surface or bordered. Mobile width ~380px: keep both on one row.

**TodayTimeline.tsx** — props: `{ items: AgendaItem[]; nowHHMM: string; onToggle: (item, completed) => Promise<void> }`.
- Use `markTimeline(items, nowHHMM)` from lib/nowView to get phase per item.
- Render a vertical rail (.today-timeline): a left rail line, each row (.timeline-row) has a node dot (.timeline-node) whose style varies by phase — `.timeline-node--past` (filled, dimmed), `.timeline-node--now` (accent, ring), `.timeline-node--upcoming` (hollow/outline). The "now" row gets an accent left treatment (.timeline-row--now).
- Each row reuses the existing AgendaItem component for the item body (checkbox + title + time) so toggle behavior stays identical — pass `item` and `onToggle` straight through. The node/rail is the decoration around it.
- If items is empty: a small "Nothing scheduled today" line (.timeline-empty).
- Apply opacity to past rows (the AgendaItem already dims completed; past+incomplete should read as faded too — use .timeline-row--past opacity).
- CSS: use position relative on .today-timeline with a ::before vertical line in --border; nodes are small circles (~10px) positioned over the line; accent color for now. Keep it clean and token-based.

No comments unless WHY is non-obvious. Do not refactor AgendaItem.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit</automated>
  </verify>
  <done>Three components compile and export defaults; new CSS classes added under a "Now view" block using existing tokens; tsc passes. NowHero handles both task and null states.</done>
</task>

<task type="auto">
  <name>Task 3: Restructure Today.tsx into the Now view</name>
  <files>frontend/src/pages/Today.tsx</files>
  <action>
Rewire Today.tsx to the new layout. Keep ALL existing state/handlers (update box, candidates, toggle, success-flash, deep-link focus effect) intact — only restage the render and swap FocusBanner for NowHero.

1. Title: change `<h1 className="page-title">This Week</h1>` to `Now`.
2. Remove the local `FocusBanner` function (replaced by NowHero). Import NowHero, MomentumStrip, TodayTimeline, and the nowView helpers.
3. Compute derived values near the existing `groups`:
   - `const momentum = deriveMomentum(tasks, blocks, todayKey);`
   - `const nowHHMM = currentHHMM(new Date());`
   - `const contextLine = nextEventLabel(events, new Date());`
   - `const todayGroup = groups[0];` (offset 0 = Today; guard for undefined)
   - `const restOfWeek = groups.slice(1);`
4. New render order inside `.page`:
   - Title "Now"
   - `<NowHero task={nextBest} contextLine={contextLine} />`
   - `<MomentumStrip doneToday={momentum.doneToday} remainingToday={momentum.remainingToday} />`
   - The existing quick-capture block (update-input-row + candidate flow + updError) — keep exactly as-is, just placed below the momentum strip. Keep the CandidateCard branch behavior unchanged.
   - `<RollupCard ... />` (unchanged props)
   - A "Today" timeline section: `<TodayTimeline items={todayGroup?.items ?? []} nowHHMM={nowHHMM} onToggle={handleToggle} />`
   - Rest-of-week: `{restOfWeek.map((group) => <DaySection key={group.dateKey} group={group} onToggle={handleToggle} />)}` (DaySection unchanged; only today's section is replaced by the timeline).
5. Do NOT change the update-flow logic, handleToggle, handleSubmit, handleConfirm, handleDismiss, or the deep-link useEffect. No unrelated refactors.

Honor CLAUDE.md: terse, no comments unless WHY non-obvious, prefer editing in place.
  </action>
  <verify>
    <automated>cd frontend && npm run build</automated>
  </verify>
  <done>Today.tsx renders title "Now", NowHero, MomentumStrip, quick-capture box, RollupCard, today timeline, then rest-of-week DaySections. FocusBanner removed. `npm run build` succeeds with no TS errors.</done>
</task>

</tasks>

<verification>
- `cd frontend && npm run build` passes (TypeScript compiles, Vite build succeeds).
- Page title is "Now".
- Hero card shows next-best task or "You're all caught up" empty state.
- Momentum strip shows two honest counts (done today / remaining), no fabricated streak.
- Today's section is a vertical timeline with a now-marker; rest-of-week unchanged DaySections.
- Update box, candidate flow, and RollupCard still function (logic untouched).
</verification>

<success_criteria>
- Frontend builds clean (`npm run build`).
- No backend changes, no new hooks, no invented Task/data fields.
- Existing CSS tokens reused; new classes follow the Phase 13 naming convention.
- AgendaItem and DaySection untouched; only Today's headline restaged.
- A clean, shippable vertical slice the user can feel tomorrow and iterate on.
</success_criteria>

<output>
After completion, create `.planning/quick/260624-kmx-redesign-today-page-into-a-now-view-hero/260624-kmx-SUMMARY.md`
</output>
