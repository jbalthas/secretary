---
phase: quick
plan: 260618-dbv
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/migrations/versions/0010_add_list_name_to_tasks.py
  - backend/app/models/__init__.py
  - backend/app/schemas/task.py
  - backend/app/routers/tasks.py
  - frontend/src/types/task.ts
  - frontend/src/components/TaskDrawer.tsx
  - frontend/src/pages/Tasks.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A task can be assigned to a list name (e.g. Grocery, Work) via TaskDrawer"
    - "TaskDrawer autocomplete suggests existing list names from the DB"
    - "Tasks page shows a chip row of all list names; clicking one filters to that list"
    - "list_name persists across page refresh"
  artifacts:
    - path: "backend/migrations/versions/0010_add_list_name_to_tasks.py"
      provides: "Alembic migration adding list_name column to tasks"
    - path: "backend/app/models/__init__.py"
      provides: "list_name: Mapped[str | None] on Task"
    - path: "backend/app/schemas/task.py"
      provides: "list_name field in TaskCreate/TaskUpdate/TaskRead"
    - path: "backend/app/routers/tasks.py"
      provides: "GET /tasks/lists endpoint + optional list_name query filter on GET /tasks/"
    - path: "frontend/src/types/task.ts"
      provides: "list_name on Task and TaskCreate interfaces"
    - path: "frontend/src/components/TaskDrawer.tsx"
      provides: "List input with datalist autocomplete"
    - path: "frontend/src/pages/Tasks.tsx"
      provides: "List filter chip row"
  key_links:
    - from: "frontend/src/components/TaskDrawer.tsx"
      to: "GET /api/v1/tasks/lists"
      via: "fetch on drawer open to populate datalist options"
    - from: "frontend/src/pages/Tasks.tsx"
      to: "GET /api/v1/tasks/?list_name=X"
      via: "activeList state passed as query param in useTasks or inline fetch"
---

<objective>
Add list_name as a nullable string field on Task. Wire it end-to-end: migration → model → schemas → router (with a /tasks/lists endpoint and list_name filter) → TypeScript types → TaskDrawer input with autocomplete → Tasks page filter chips.

Purpose: Lets the user organise tasks into named lists (Grocery, Work, Life, etc.) without a separate List model.
Output: list_name persists, autocompletes in TaskDrawer, and filters the Tasks page view.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Migration chain: 0009 is current HEAD (down_revision='0008'). New migration is 0010 with down_revision='0009'. -->
<!-- Pattern: backend/migrations/versions/0009_create_scheduled_blocks.py — follow same header format. -->
<!-- TaskCreate/TaskUpdate/TaskRead live in backend/app/schemas/task.py — TaskUpdate extends TaskCreate. -->
<!-- list_tasks router currently has no query params — add Optional list_name: str | None = None. -->
<!-- GET /tasks/lists returns list[str] of distinct non-null list_name values from the tasks table. -->
<!-- TaskDrawer uses a <datalist> pattern for autocomplete (no third-party dependency needed). -->
<!-- useTasks hook is in frontend/src/hooks/useTasks.ts — Tasks.tsx calls it directly; filtering can happen in-component rather than re-fetching. -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — migration, model, schemas, router</name>
  <files>
    backend/migrations/versions/0010_add_list_name_to_tasks.py
    backend/app/models/__init__.py
    backend/app/schemas/task.py
    backend/app/routers/tasks.py
  </files>
  <action>
    1. Create migration 0010_add_list_name_to_tasks.py:
       - revision='0010', down_revision='0009'
       - upgrade: op.add_column('tasks', sa.Column('list_name', sa.String(100), nullable=True))
       - downgrade: op.drop_column('tasks', 'list_name')

    2. In backend/app/models/__init__.py, add to Task class after estimated_minutes:
       list_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    3. In backend/app/schemas/task.py, add list_name: str | None = None to TaskCreate (TaskUpdate and TaskRead inherit it automatically since TaskUpdate extends TaskCreate and TaskRead extends TaskCreate).

    4. In backend/app/routers/tasks.py:
       a. Add new endpoint BEFORE the existing routes (so /tasks/lists isn't shadowed by /tasks/{task_id}):
          @router.get("/lists", response_model=list[str])
          async def list_task_lists(session: AsyncSession = Depends(get_session)):
              result = await session.execute(
                  select(Task.list_name).where(Task.list_name.isnot(None)).distinct().order_by(Task.list_name)
              )
              return [row for row in result.scalars().all()]

       b. Add optional list_name query param to list_tasks:
          async def list_tasks(list_name: str | None = None, session: AsyncSession = Depends(get_session)):
          Apply filter: stmt = select(Task).order_by(Task.created_at.desc())
          if list_name: stmt = stmt.where(Task.list_name == list_name)

    5. Run migration: cd backend && uv run alembic upgrade head
  </action>
  <verify>
    cd backend && uv run python -c "from app.models import Task; print(hasattr(Task, 'list_name'))"
    curl -s http://localhost:8000/api/v1/tasks/lists
    curl -s "http://localhost:8000/api/v1/tasks/?list_name=Work"
  </verify>
  <done>
    Migration applied, Task.list_name exists, GET /tasks/lists returns [], GET /tasks/?list_name=X returns filtered results.
  </done>
</task>

<task type="auto">
  <name>Task 2: Frontend — types, TaskDrawer input, Tasks page filter chips</name>
  <files>
    frontend/src/types/task.ts
    frontend/src/components/TaskDrawer.tsx
    frontend/src/pages/Tasks.tsx
  </files>
  <action>
    1. In frontend/src/types/task.ts:
       - Add list_name?: string | null to Task interface
       - Add list_name?: string | null to TaskCreate interface

    2. In frontend/src/components/TaskDrawer.tsx:
       a. Add state: const [listName, setListName] = useState("");
          and const [listOptions, setListOptions] = useState<string[]>([]);

       b. In useEffect (on open), populate listName from task?.list_name ?? "" and fetch list options:
          fetch("/api/v1/tasks/lists").then(r => r.json()).then(setListOptions)

       c. In handleSave body, include: list_name: listName || undefined

       d. Add a "List" field in the drawer-body (after Goal, before Due date):
          <div className="drawer-field">
            <label htmlFor="task-list">List</label>
            <input
              id="task-list"
              type="text"
              list="task-list-options"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="e.g. Grocery, Work, Life"
              autoComplete="off"
            />
            <datalist id="task-list-options">
              {listOptions.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>

    3. In frontend/src/pages/Tasks.tsx:
       a. Add state: const [activeList, setActiveList] = useState<string | null>(null);

       b. Derive unique list names from tasks:
          const listNames = Array.from(new Set(tasks.map(t => t.list_name).filter(Boolean))) as string[];

       c. Apply list filter before existing pending/completed filter:
          const listFiltered = activeList ? tasks.filter(t => t.list_name === activeList) : tasks;
          Then replace the existing `tasks.filter(...)` to use listFiltered instead of tasks.

       d. Add a chip row between the page title and the filter-sort-row:
          Only render when listNames.length > 0:
          <div className="list-chips">
            <button
              className={"list-chip" + (!activeList ? " active" : "")}
              onClick={() => setActiveList(null)}
            >All</button>
            {listNames.map(l => (
              <button
                key={l}
                className={"list-chip" + (activeList === l ? " active" : "")}
                onClick={() => setActiveList(l)}
              >{l}</button>
            ))}
          </div>

       e. Add minimal styles inline or in index.css:
          .list-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
          .list-chip { padding: 4px 12px; border-radius: 16px; border: 1px solid var(--border, #ccc); background: transparent; cursor: pointer; font-size: 0.875rem; }
          .list-chip.active { background: var(--accent, #4f46e5); color: white; border-color: var(--accent, #4f46e5); }
  </action>
  <verify>
    npm run build (in frontend/) — no TypeScript errors.
    Manual golden path: create task with list_name "Grocery", save, reopen drawer — "Grocery" pre-filled; input autocomplete shows "Grocery"; Tasks page shows "Grocery" chip; click chip filters view to that task; click "All" resets.
  </verify>
  <done>
    TypeScript compiles clean. list_name round-trips through TaskDrawer. List chips appear and filter correctly. Autocomplete suggests existing list names.
  </done>
</task>

</tasks>

<verification>
- GET /api/v1/tasks/lists returns distinct list names
- PATCH /api/v1/tasks/{id} with {list_name: "Work"} persists correctly (GET /tasks/ confirms)
- GET /api/v1/tasks/?list_name=Work returns only Work tasks
- Frontend builds without TS errors
- TaskDrawer List field autocompletes from existing values
- Tasks page chip row filters visible tasks
</verification>

<success_criteria>
list_name persists end-to-end (DB → API → UI → back). Autocomplete in TaskDrawer shows existing list names. Tasks page chip row lets user filter by list. Clearing filter ("All") restores full view. No separate List model or CRUD page needed.
</success_criteria>

<output>
After completion, create .planning/quick/260618-dbv-add-task-lists-a-simple-list-name-string/260618-dbv-SUMMARY.md
</output>
