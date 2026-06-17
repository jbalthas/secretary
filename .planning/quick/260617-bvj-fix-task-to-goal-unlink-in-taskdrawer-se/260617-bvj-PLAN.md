---
phase: quick-260617-bvj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/TaskDrawer.tsx
  - frontend/src/types/task.ts
  - backend/tests/test_tasks.py
autonomous: true
requirements: [GOAL-05]

must_haves:
  truths:
    - "Selecting 'No goal' on an already-linked task and saving clears the goal link"
    - "PATCH /tasks/{id} with {\"goal_id\": null} sets the FK to NULL"
    - "Selecting a goal on an unlinked task still links it (no regression)"
  artifacts:
    - path: "frontend/src/components/TaskDrawer.tsx"
      provides: "Save handler that sends goal_id explicitly (null to unlink)"
      contains: "goal_id: goalId"
    - path: "frontend/src/types/task.ts"
      provides: "TaskCreate.goal_id widened to number | null"
      contains: "goal_id?: number | null"
    - path: "backend/tests/test_tasks.py"
      provides: "Regression test asserting goal_id null clears the FK"
      contains: "goal_id"
  key_links:
    - from: "frontend/src/components/TaskDrawer.tsx handleSave"
      to: "PATCH /api/v1/tasks/{id}"
      via: "body.goal_id (null when no goal selected)"
      pattern: "goal_id: goalId"
    - from: "backend/app/routers/tasks.py update_task"
      to: "Task.goal_id column"
      via: "model_dump(exclude_unset=True) includes goal_id when present (even null)"
      pattern: "exclude_unset"
---

<objective>
Fix task→goal unlink in the task drawer. Selecting "No goal" on an already-linked
task currently does nothing because the save handler sends `goal_id: goalId ?? undefined`,
and the backend's `model_dump(exclude_unset=True)` drops `undefined` from the PATCH body —
so the FK is never cleared.

Mirror the already-correct RoutineDrawer pattern: send `goal_id: goalId` (a `number | null`),
so `null` reaches the backend and clears the column. Widen the `TaskCreate.goal_id` type to
allow `null`, and add a backend regression test.

Purpose: Closes the non-blocking anti-pattern flagged in 09-VERIFICATION.md (TaskDrawer.tsx:108).
Output: One-line save-handler fix, one type widening, one backend test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@frontend/src/components/RoutineDrawer.tsx
@backend/app/routers/tasks.py
@backend/app/schemas/task.py

<interfaces>
<!-- The correct pattern already exists in RoutineDrawer.tsx:55 — mirror it. -->

RoutineDrawer.tsx:55 (correct — sends null to unlink):
```typescript
const body: RoutineInput = { name, cron: cron.trim(), action, goal_id: goalId };
// goalId is `number | null`; null is sent verbatim and clears the FK
```

TaskDrawer.tsx:108 (buggy — undefined gets dropped by exclude_unset):
```typescript
goal_id: goalId ?? undefined,   // ← null becomes undefined, omitted from PATCH body
```

backend/app/routers/tasks.py:31-43 (PATCH — no change needed):
```python
for k, v in body.model_dump(exclude_unset=True).items():
    setattr(task, k, v)
# exclude_unset INCLUDES a field that is explicitly set, even when null →
# goal_id: null in the JSON body will set the column to None.
```

backend/app/schemas/task.py — TaskUpdate already accepts `goal_id: int | None` (no change needed).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Send goal_id explicitly from TaskDrawer + widen TaskCreate type</name>
  <files>frontend/src/components/TaskDrawer.tsx, frontend/src/types/task.ts</files>
  <action>
    In frontend/src/components/TaskDrawer.tsx, change the save handler (currently line 108):
      `goal_id: goalId ?? undefined,` → `goal_id: goalId,`
    `goalId` is already typed `number | null` (line 69 useState), so this sends `null`
    when "No goal" is selected, which clears the FK under the backend's exclude_unset PATCH.
    This mirrors RoutineDrawer.tsx:55. No other change to TaskDrawer.

    In frontend/src/types/task.ts, widen the create-type field so null is allowed:
      `goal_id?: number;` (line 24, inside `TaskCreate`) → `goal_id?: number | null;`
    Do NOT change `Task.goal_id` (line 12, the read type) — it stays `number | undefined`;
    the drawer already normalizes the read value via `task?.goal_id ?? null` (line 83),
    so no read-side change is needed.
  </action>
  <verify>
    <automated>cd frontend && npx tsc -b --noEmit</automated>
  </verify>
  <done>
    TaskDrawer save handler sends `goal_id: goalId` (no `?? undefined`); TaskCreate.goal_id
    is `number | null`; `tsc -b` typechecks clean with no new errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add backend regression test for goal unlink via PATCH</name>
  <files>backend/tests/test_tasks.py</files>
  <action>
    Add a test to backend/tests/test_tasks.py following the existing sync-TestClient pattern
    (see test_update_task). The test proves the contract the frontend now relies on:
    PATCH /tasks/{id} with {"goal_id": null} clears an existing task→goal link.

    Steps:
    1. Create a goal: `g = client.post("/api/v1/goals/", json={"title": "Ship v2", "type": "outcome"}).json()`
       — check backend/app/schemas/goal.py / test_goals.py for the exact required GoalCreate
       fields (title + type/goal type); use the minimal valid payload that test_goals.py uses.
    2. Create a task linked to that goal:
       `t = client.post("/api/v1/tasks/", json={"title": "Linked", "goal_id": g["id"]}).json()`
       Assert `t["goal_id"] == g["id"]`.
    3. Unlink: `r = client.patch(f"/api/v1/tasks/{t['id']}", json={"goal_id": None})`
       Assert `r.status_code == 200` and `r.json()["goal_id"] is None`.
    4. (Optional, cheap) Re-fetch via GET /tasks/ and assert the same task now has goal_id None,
       confirming the column was persisted, not just echoed.

    Name it `test_unlink_task_from_goal`. Keep it self-contained (creates its own goal + task)
    so it does not depend on test ordering.
  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_tasks.py -x -q</automated>
  </verify>
  <done>
    `test_unlink_task_from_goal` passes; PATCH with {"goal_id": null} returns 200 with
    goal_id None and the cleared value persists on re-fetch. Full test_tasks.py suite green.
  </done>
</task>

</tasks>

<verification>
- `cd frontend && npx tsc -b --noEmit` — clean
- `cd backend && uv run pytest tests/test_tasks.py -x -q` — all pass including new unlink test
- Manual golden path (optional, covered by 09 human-verify history): open a task already linked
  to a goal, select "No goal", Save → task no longer appears under that goal after refresh.
</verification>

<success_criteria>
- TaskDrawer save handler sends `goal_id: goalId` (explicit null on unlink), matching RoutineDrawer.
- `TaskCreate.goal_id` typed `number | null`; frontend typechecks clean.
- Backend regression test asserts `{"goal_id": null}` clears the FK and persists; suite green.
- No backend schema/router change (TaskUpdate already accepts `int | None`; exclude_unset handles it).
</success_criteria>

<output>
After completion, create `.planning/quick/260617-bvj-fix-task-to-goal-unlink-in-taskdrawer-se/260617-bvj-SUMMARY.md`
</output>
