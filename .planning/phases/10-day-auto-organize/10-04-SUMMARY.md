---
phase: 10-day-auto-organize
plan: 04
subsystem: ui
tags: [react, vite, typescript, planner, scheduling, agenda]

# Dependency graph
requires:
  - phase: 10-day-auto-organize
    provides: "10-03 backend plan endpoints (propose/approve/replan/blocks/delete), work-hours settings API, ProposedDayPlan/ScheduledBlock JSON shapes"
provides:
  - "Organize page: propose/review/edit/approve + already-approved/re-plan + didn't-fit + fully-booked flow"
  - "usePlan and useWorkHours fetch hooks"
  - "frontend plan TS types (ProposedBlock/ProposedDayPlan/ScheduledBlock)"
  - "Today integration: approved blocks fold into the agenda with Planned + per-block staleness badges"
  - "Work Hours card on Settings"
  - "Organize nav tab + /organize route"
affects: [phase-11-goal-guided-guidance, today-agenda, settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local-time date keys (getFullYear/getMonth/getDate) everywhere a day boundary is computed — never toISOString (UTC)"
    - "Fetch-hook pattern (useState + useEffect + refresh) reused for usePlan/useWorkHours, mirroring useCalendarEvents"
    - "Client-side state machine for multi-step Organize flow (loading/approved/proposing/editing/fully_booked/saving/done)"

key-files:
  created:
    - frontend/src/types/plan.ts
    - frontend/src/hooks/usePlan.ts
    - frontend/src/hooks/useWorkHours.ts
    - frontend/src/pages/Organize.tsx
  modified:
    - frontend/src/types/task.ts
    - frontend/src/lib/agenda.ts
    - frontend/src/components/AgendaItem.tsx
    - frontend/src/components/BottomNav.tsx
    - frontend/src/pages/Today.tsx
    - frontend/src/pages/Settings.tsx
    - frontend/src/App.tsx

key-decisions:
  - "fully_booked has two causes (genuinely packed vs. past work-hours end); Organize empty-state copy branches on isAfterWorkHours(workEnd) to avoid the misleading 'calendar is full' wording in the after-hours case — frontend-only, no schema change"
  - "Block items without a taskId render a no-op checkbox (guarded toggle) so planned blocks never trigger a task PATCH"
  - "buildWeekAgenda takes the full blocks list and filters per-day by date_key inside buildDayItems (single source of truth for day assignment)"

patterns-established:
  - "Empty-state messaging branches on local-time work-hours boundary via a small pure helper (isAfterWorkHours)"

requirements-completed: [PLAN-01, PLAN-02]

# Metrics
duration: ~15min (continuation/finalization session)
completed: 2026-06-17
---

# Phase 10 Plan 04: Day Auto-Organize Frontend Summary

**Organize page delivering the full propose/edit/approve + already-approved/re-plan + didn't-fit + fully-booked flow, with approved blocks folding into Today's agenda as Planned/staleness-badged items and an editable Work Hours card on Settings.**

## Performance

- **Duration:** ~15 min (this finalization session; Tasks 1-2 executed in prior sessions)
- **Completed:** 2026-06-17
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint), plus a post-verify polish
- **Files modified:** 11

## Accomplishments
- Full Organize touch flow: propose a day plan, reorder blocks via up/down tap buttons (no drag), remove blocks, adjust start time + duration, see a "Didn't fit" list, approve once (double-commit guarded), and an already-approved state with Re-plan.
- Today renders approved blocks inline in the agenda with a "Planned" badge and a per-block "conflicts with [event]" staleness badge.
- Settings gained an editable Work Hours card (two time inputs + Save) backed by the work-hours API.
- Organize nav tab + `/organize` route wired.
- Post-verify polish: the fully-booked empty state now distinguishes "your work hours for today are done" (after work-hours end) from "your calendar is fully booked" (genuinely packed).

## Task Commits

1. **Task 1: Plan types + AgendaItem fields + usePlan/useWorkHours hooks + agenda/AgendaItem block rendering** - `33b78ed` (feat)
2. **Task 2: Organize page + Today integration + Settings work-hours card + nav tab + route** - `9347b9b` (feat)
3. **Task 3: Human-verify checkpoint** - resolved by user (replied to finalize with one polish); migration 0009 application + build confirmed during the checkpoint.
4. **Post-verify polish: after-hours vs fully-booked empty-state copy** - `f6a3ced` (fix)

**Plan metadata:** committed with STATE.md/ROADMAP.md updates (docs).

## Files Created/Modified
- `frontend/src/types/plan.ts` - ProposedBlock/ProposedDayPlan/ScheduledBlock TS types matching backend JSON shapes
- `frontend/src/hooks/usePlan.ts` - plan API client hook (propose/approve/replan/fetchBlocks/deleteBlock); approve throws on 409
- `frontend/src/hooks/useWorkHours.ts` - GET/PUT `/api/v1/settings/work-hours`; exposes workStart/workEnd/loading/save
- `frontend/src/pages/Organize.tsx` - state-machine page for the full propose/edit/approve + approved/re-plan + didn't-fit + fully-booked flow
- `frontend/src/types/task.ts` - AgendaItem extended with isBlock?/conflict_with?/blockId?
- `frontend/src/lib/agenda.ts` - buildDayItems/buildWeekAgenda accept optional blocks, fold them in by date_key (local-time rendering)
- `frontend/src/components/AgendaItem.tsx` - Planned badge + conflict badge; guarded toggle for block items
- `frontend/src/components/BottomNav.tsx` - 5th NavLink to /organize (CalendarCheck icon)
- `frontend/src/pages/Today.tsx` - usePlan(todayKey); passes blocks into buildWeekAgenda
- `frontend/src/pages/Settings.tsx` - Work Hours card (two time inputs + Save)
- `frontend/src/App.tsx` - /organize route

## Decisions Made
- The fully-booked empty state was reworded to branch on a local-time work-hours check. `fully_booked` from the planner is true both when the day is genuinely packed and when the current time is simply past the work-hours end (e.g. testing in the evening); the old single message ("your calendar is full") was misleading in the latter case. Fixed frontend-only via a small `isAfterWorkHours(workEnd)` helper using the existing `useWorkHours` hook — no backend, planner, or `ProposedDayPlan` schema change.
- The pre-existing local-time change in `frontend/src/lib/agenda.ts` (getHours/getMinutes/local date keys rather than UTC) was incorporated and relied upon so block times render in the Pi's timezone consistently with existing event rendering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Misleading fully-booked empty-state copy**
- **Found during:** Task 3 (human-verify checkpoint)
- **Issue:** `fully_booked` is returned both when the calendar is packed and when the current time is past the work-hours end; the page showed "No free time today — your calendar is full." in both cases, which misreads as a packed calendar when the user is simply testing after hours.
- **Fix:** Added `isAfterWorkHours(workEnd)` helper and branched the message: after-hours → "Your work hours for today are done — there's no time left to schedule. Adjust your hours in Settings, or plan again tomorrow."; otherwise → "No free time today — your calendar is fully booked." Wired via the existing `useWorkHours` hook. Frontend-only; no backend/schema change.
- **Files modified:** frontend/src/pages/Organize.tsx
- **Verification:** `npx tsc --noEmit` exits 0; `npm run build` succeeds.
- **Committed in:** `f6a3ced`

---

**Total deviations:** 1 auto-fixed (1 bug, user-requested wording correction within scope)
**Impact on plan:** Frontend-only copy/logic correction. No scope creep; backend, planner, and schema untouched.

## Issues Encountered
None during this finalization session.

## Known Stubs
None. The fully-booked branch and all Organize states render real data from the plan/work-hours APIs.

## Deferred Items
- **Per-task `estimated_minutes` field in TaskDrawer editor** — identified during the human-verify checkpoint as a desirable enhancement (let the user set the duration the planner uses to size a block, directly from the task editor). TaskDrawer was not in Phase 10's scope; the column exists (migration 0007) and the planner already reads it. Logged to `deferred-items.md` for a future phase.
- Carried items in `deferred-items.md`: dev DB unmigrated (run `alembic upgrade head` on the Pi before live use); a pre-existing unrelated `test_calendar.py` failure.

## User Setup Required
None new. Before live use on the Pi, apply migration 0009 (`cd backend && alembic upgrade head`) — see deferred-items.md.

## Next Phase Readiness
- Phase 10 (Day Auto-Organize) is complete: backend planner + endpoints (10-01/02/03) and the full frontend (10-04) are in place; human verification passed.
- Ready for Phase 11 (Goal-Guided Guidance). No blockers.

## Self-Check: PASSED

All claimed files exist (plan.ts, usePlan.ts, useWorkHours.ts, Organize.tsx, 10-04-SUMMARY.md) and all commits resolve (33b78ed, 9347b9b, f6a3ced).

---
*Phase: 10-day-auto-organize*
*Completed: 2026-06-17*
