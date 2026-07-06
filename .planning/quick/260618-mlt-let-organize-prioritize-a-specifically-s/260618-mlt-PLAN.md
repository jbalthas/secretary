---
phase: quick-260618-mlt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/lib/organizeTaskSort.ts
  - frontend/src/lib/organizeTaskSort.test.ts
  - frontend/src/pages/Organize.tsx
  - frontend/src/styles.css
autonomous: true
requirements: [QUICK-mlt]
must_haves:
  truths:
    - "Organize offers the task lists currently present in the unscheduled queue"
    - "Selecting a list moves tasks from that list above tasks from other lists"
    - "Tasks remain priority-sorted within the selected and remaining groups"
  artifacts:
    - path: "frontend/src/lib/organizeTaskSort.ts"
      provides: "Deterministic selected-list prioritization"
    - path: "frontend/src/pages/Organize.tsx"
      provides: "List selection control in the Organize task queue"
  key_links:
    - from: "frontend/src/pages/Organize.tsx"
      to: "frontend/src/lib/organizeTaskSort.ts"
      via: "selected list passed into queue sorting"
      pattern: "sortOrganizeTasks"
---

<objective>
Let the user choose a specific task list in Organize so tasks from that list appear at the top of the unscheduled queue.
</objective>

<tasks>

<task type="auto">
  <name>Add selected-list sorting and UI</name>
  <files>frontend/src/lib/organizeTaskSort.ts, frontend/src/lib/organizeTaskSort.test.ts, frontend/src/pages/Organize.tsx, frontend/src/styles.css</files>
  <action>
    Extend Organize list sorting with an optional selected list. Derive unique list options from
    unscheduled tasks and show a list selector when sorting by list. Keep all tasks visible, place
    the selected list first, preserve priority/title ordering within groups, and allow the compact
    task controls to wrap without overflow.
  </action>
  <verify>cd frontend &amp;&amp; npm test -- --run src/lib/organizeTaskSort.test.ts &amp;&amp; npm run build</verify>
  <done>Selecting Career (or another available list) moves that list's tasks to the top.</done>
</task>

</tasks>

<verification>
- Focused Vitest coverage for selected-list ordering
- Production frontend build
</verification>

<success_criteria>
- Available queue lists can be selected
- Selected-list tasks appear first without filtering out other tasks
- Existing priority and all-list sorting still work
</success_criteria>
