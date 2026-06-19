---
phase: quick-260618-mko
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/routers/plan.py
  - backend/tests/test_plan.py
  - frontend/src/hooks/usePlan.ts
  - frontend/src/lib/organizePlan.ts
  - frontend/src/lib/organizePlan.test.ts
  - frontend/src/pages/Organize.tsx
  - frontend/src/styles.css
autonomous: true
requirements: [QUICK-mko]
must_haves:
  truths:
    - "Organize lets the user choose a start and end time for today's scheduling session"
    - "Auto-arrange places tasks only inside the selected time window"
    - "Automatic newly-added task suggestions do not run past the selected end time"
    - "The selected Organize window does not overwrite global work-hour settings"
  artifacts:
    - path: "frontend/src/pages/Organize.tsx"
      provides: "Scheduling-window controls and validation"
      contains: "scheduleStart"
    - path: "backend/app/routers/plan.py"
      provides: "Per-request planner time-window overrides"
      contains: "work_start"
  key_links:
    - from: "frontend/src/hooks/usePlan.ts"
      to: "backend/app/routers/plan.py"
      via: "work_start and work_end query parameters"
      pattern: "work_start"
    - from: "frontend/src/pages/Organize.tsx"
      to: "frontend/src/lib/organizePlan.ts"
      via: "selected end-time limit for appended task suggestions"
      pattern: "workEnd"
---

<objective>
Let the Organize page choose a temporary scheduling window for the current day and ensure both backend auto-arrangement and frontend task suggestions remain inside it.
</objective>

<tasks>

<task type="auto">
  <name>Add per-request planning-window support</name>
  <files>backend/app/routers/plan.py, backend/tests/test_plan.py, frontend/src/hooks/usePlan.ts</files>
  <action>
    Accept optional HH:MM work_start/work_end query parameters on the proposal endpoint, validate that start precedes end, and pass the selected values to the deterministic planner. Send the selected values from the frontend hook without persisting them as global settings.
  </action>
  <verify>Backend plan tests pass.</verify>
  <done>Proposal requests can safely override the planning window for one Organize session.</done>
</task>

<task type="auto">
  <name>Add Organize controls and enforce the selected boundary</name>
  <files>frontend/src/pages/Organize.tsx, frontend/src/styles.css, frontend/src/lib/organizePlan.ts, frontend/src/lib/organizePlan.test.ts</files>
  <action>
    Add accessible start/end time controls initialized from configured work hours, delay initial proposal until those defaults load, reject reversed windows, re-run auto-arrange with the chosen window, and prevent automatic appended task suggestions from exceeding the selected end time.
  </action>
  <verify>Frontend unit tests and production build pass; browser-check desktop and mobile Organize interactions.</verify>
  <done>Users can choose today's planning hours and see suggestions only within that range.</done>
</task>

</tasks>

<verification>
- Backend plan test suite
- Frontend Vitest suite
- Frontend production build
- Rendered Organize interaction at desktop and mobile widths
</verification>
