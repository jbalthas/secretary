---
phase: quick-260617-ldm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/schemas/task.py
  - backend/tests/test_tasks.py
  - frontend/src/types/task.ts
  - frontend/src/components/TaskDrawer.tsx
autonomous: true
requirements: [QUICK-ldm]
must_haves:
  truths:
    - "User can set an estimated duration (in minutes) on a task in the TaskDrawer"
    - "A blank duration field persists as unset (null), so the planner falls back to its 30-minute default"
    - "A set duration persists on both task create and PATCH edit, and repopulates when reopening the task"
  artifacts:
    - path: "backend/app/schemas/task.py"
      provides: "estimated_minutes on TaskCreate (inherited by TaskUpdate/TaskRead)"
      contains: "estimated_minutes"
    - path: "frontend/src/types/task.ts"
      provides: "estimated_minutes on Task and TaskCreate"
      contains: "estimated_minutes"
    - path: "frontend/src/components/TaskDrawer.tsx"
      provides: "minutes number input wired into handleSave"
      contains: "estimated_minutes"
  key_links:
    - from: "frontend/src/components/TaskDrawer.tsx"
      to: "TaskCreate.estimated_minutes"
      via: "handleSave body builder"
      pattern: "estimated_minutes"
    - from: "backend/app/schemas/task.py"
      to: "Task.estimated_minutes column"
      via: "Pydantic field accepted on create/update"
      pattern: "estimated_minutes"
---

<objective>
Add a per-task `estimated_minutes` duration field to the TaskDrawer so the user can pre-set how long a task should take. The Phase 10 Day-Organize planner already reads `Task.estimated_minutes` (defaulting to 30 when unset) — today that value can only be set via LLM Ingest. This plan exposes it manually end-to-end: backend schema, frontend types, and the editor UI.

Purpose: Let the user control block sizing in the auto-organize planner without re-ingesting.
Output: Backend `TaskCreate` schema accepts `estimated_minutes`; frontend `Task`/`TaskCreate` types include it; TaskDrawer renders an optional minutes input that round-trips on create and PATCH.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Existing contracts — use directly, no exploration needed. -->

Backend model (backend/app/models/__init__.py) — column ALREADY EXISTS, do not migrate:
```python
estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

Backend schema (backend/app/schemas/task.py) — estimated_minutes is MISSING from TaskCreate.
TaskUpdate(TaskCreate) and TaskRead(TaskCreate) inherit fields, so adding it to TaskCreate
covers create, PATCH, and read in one edit:
```python
class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    reminder_at: datetime | None = None
    recurrence_cron: str | None = None
    goal_id: int | None = None
```

Planner consumer (backend/app/services/planner_service.py) — confirms the fallback semantics
the UI must preserve (blank input => null => 30-min default):
```python
duration = timedelta(minutes=task.estimated_minutes or default_minutes)
```

Frontend types (frontend/src/types/task.ts) — estimated_minutes MISSING from both Task and TaskCreate.

TaskDrawer (frontend/src/components/TaskDrawer.tsx) — patterns to match:
- State is a useState per field, hydrated in useEffect on `[open, task]`.
- handleSave builds a `TaskCreate` body, sending `undefined` for empty optional values.
- Collapsible component (lines 49-64) wraps optional fields (Description, Remind me, Repeat).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add estimated_minutes to backend TaskCreate schema + regression test</name>
  <files>backend/app/schemas/task.py, backend/tests/test_tasks.py</files>
  <behavior>
    - Creating a task with estimated_minutes=45 persists and is returned as 45 on read.
    - Omitting estimated_minutes leaves it null (planner default applies downstream).
    - PATCH updating estimated_minutes (e.g. to 90) persists; PATCH without it does not reset an existing value (exclude_unset=True already in router).
  </behavior>
  <action>
    Add one field to `TaskCreate` in backend/app/schemas/task.py:
    `estimated_minutes: int | None = None` (place it alongside the other optional fields, e.g. after `recurrence_cron`). TaskUpdate and TaskRead inherit from TaskCreate, so no further schema edits are needed.

    Do NOT touch the model or add a migration — the `estimated_minutes` Integer column already exists (migration 0007).

    Add a regression test to backend/tests/test_tasks.py mirroring the existing TestClient sync pattern (see neighboring tests / the 260617-bvj goal_id test for shape):
    - POST a task with `estimated_minutes: 45`, assert response 201 and body `estimated_minutes == 45`.
    - POST a task without the field, assert returned `estimated_minutes is None`.
    - PATCH that task with `estimated_minutes: 90`, assert it returns 90 (confirms exclude_unset round-trip).
  </action>
  <verify>
    <automated>cd backend && python -m pytest tests/test_tasks.py -x -q</automated>
  </verify>
  <done>TaskCreate accepts estimated_minutes; create returns the set value, null when omitted, and PATCH updates it. test_tasks.py passes.</done>
</task>

<task type="auto">
  <name>Task 2: Add estimated_minutes to frontend types and TaskDrawer input</name>
  <files>frontend/src/types/task.ts, frontend/src/components/TaskDrawer.tsx</files>
  <action>
    types/task.ts: add `estimated_minutes?: number | null;` to BOTH the `Task` interface
    (so an existing task's value repopulates on edit) and the `TaskCreate` interface.

    TaskDrawer.tsx:
    - Add state: `const [estimatedMinutes, setEstimatedMinutes] = useState("");` (string-backed
      to allow a clean blank state, matching how dueTime/reminder fields stay empty).
    - In the `useEffect` hydration block, add:
      `setEstimatedMinutes(task?.estimated_minutes != null ? String(task.estimated_minutes) : "");`
    - In `handleSave`, add to the body:
      `estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,`
      (blank => undefined => omitted from payload => stays null => planner uses its 30-min default).
    - Render the input consistent with existing fields. Wrap it in the existing `Collapsible`
      component with label "Duration" (matches Description/Remind me/Repeat sections):
      a single `drawer-field` containing a label "Estimated minutes" and
      `<input type="number" min={1} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} placeholder="e.g. 30" />`.
      Place the Collapsible near the other Collapsibles (e.g. directly after "Description").

    Do not alter planner logic, GoalSelect, or unrelated fields.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>tsc reports no errors, build succeeds. TaskDrawer shows a "Duration" Collapsible with a minutes number input that hydrates from an edited task and sends estimated_minutes (or omits it when blank) in the save payload.</done>
</task>

</tasks>

<verification>
- Backend: `cd backend && python -m pytest tests/test_tasks.py -x -q` passes (create with value, create omitted=null, PATCH update).
- Frontend: `cd frontend && npx tsc --noEmit && npm run build` both succeed.
- Manual sanity (golden path): open TaskDrawer, expand Duration, enter 45, save; reopen the task and confirm 45 is shown; clear it and save and confirm it persists as unset.
</verification>

<success_criteria>
- `estimated_minutes` is settable in the TaskDrawer and persists on create and PATCH.
- Blank field => null => planner falls back to 30 minutes (unchanged planner behavior).
- No migration, no model change, no planner logic change.
- All listed verification commands pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260617-ldm-add-per-task-estimated-minutes-duration-/260617-ldm-SUMMARY.md`
</output>
