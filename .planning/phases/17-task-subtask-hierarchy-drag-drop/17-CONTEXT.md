# Phase 17: Task Subtask Hierarchy Drag Drop - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a self-referencing parent/child relationship on tasks so any task can be dragged onto another in the "Your day" timeline to become its subtask (e.g. Chicken/Oatmeal/Cliff Bars nested under "Go to Sam's Club"). Children render indented/collapsible under their parent. Requires a DB migration (parent_task_id on Task and ScheduledBlock), schema/API updates, a new frontend drag-and-drop library, and UI changes to the Today timeline and Tasks list page.

</domain>

<decisions>
## Implementation Decisions

### Nesting Scope & Depth
- **D-01:** One level of nesting only — parent + children, no grandchildren. A child cannot itself have children.
- **D-02:** Nesting is visible and editable on both the Today timeline AND the Tasks list page (not Today-only).

### Drag Interaction
- **D-03:** Drop directly on the center of a row (row highlights while dragging over) = nest as subtask. Drop in the gap between rows = reorder in the flat list.
- **D-04:** Draggable/nestable items are Tasks and planned Organize blocks (ScheduledBlock). Calendar events (synced from Google) are NOT draggable or nestable — they're externally owned/read-only.
- **D-05:** `ScheduledBlock` gets its own nullable `parent_task_id` column (separate from `Task.parent_task_id`), so a planned block can be nested under a task. The parent is always a Task — a ScheduledBlock can never be a parent (consistent with the one-level-deep rule in D-01).

### Parent/Child Display & Completion
- **D-06:** The parent row shows a subtask progress badge, e.g. "2/3", so completion is visible without expanding.
- **D-07:** No auto-complete propagation. Completing all children does NOT check off the parent, and completing the parent does NOT auto-complete children. Each task's completion is independent. (Explicitly rejected a "prompt to complete parent" middle option — keep it simple.)
- **D-08:** Children keep their own time/priority/due-date. Nesting is a purely visual/relational grouping — it does not change or override any field on the child.
- **D-09:** Nested groups are expanded by default (children visible immediately under the parent, matching the target screenshot).

### Un-nesting & Manual Assignment
- **D-10:** Dragging a child into empty timeline space (not onto another row) clears its `parent_task_id`, returning it to a standalone top-level item — symmetric with nesting.
- **D-11:** The task edit drawer gets a "Subtask of" dropdown/field so a parent can be set or cleared without dragging (desktop/accessibility path).

### Dependency Exception
- **D-12:** This phase adds one new frontend-only dependency: a drag-and-drop library (e.g. `@dnd-kit/core`). The project's "no new dependencies" hard constraint (locked since v2.0) was scoped to keeping the external-LLM ingest/advisory loop simple — it does not block a UI library for an unrelated feature. User explicitly approved this exception. No backend dependencies are added; the "no server-side LLM" constraint is untouched.

### Claude's Discretion
- Exact DnD library choice and API (e.g. `@dnd-kit/core` vs alternatives) — pick whichever integrates most cleanly with the existing React 19 + Vite setup.
- Exact migration numbering (continue the existing Alembic chain; check current HEAD before writing).
- Visual treatment of indentation/collapse affordance (icon choice, indent width) — follow existing CSS variable/theme conventions in `AgendaItem.tsx`/`Tasks.tsx`.
- Whether reordering (drop-in-gap) requires a persisted `order`/`position` column or can stay implicit — Claude's call during planning, informed by research into what the chosen DnD library needs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Task/Hierarchy Patterns
- `.planning/quick/260619-hier-hierarchical-umbrella-lists/260619-hier-SUMMARY.md` — the existing `parent_list_name` umbrella-list feature. This is a DIFFERENT concept (category grouping by string name) from this phase's `parent_task_id` (individual task-to-task parent/child). Do not conflate or reuse `parent_list_name` for this feature.
- `backend/app/models/__init__.py` — Task model (lines ~14-40): fields including `list_name`, `parent_list_name`, `goal_id`, `external_key`. New `parent_task_id` self-referencing FK goes here.
- `backend/app/schemas/task.py` — `TaskCreate`/`TaskUpdate`/`TaskRead` — needs `parent_task_id` added.
- `backend/app/routers/tasks.py` — `PATCH /{task_id}` (generic `model_dump(exclude_unset=True)` partial update) already supports adding new fields without router changes; `list_task_hierarchy` (~lines 35-65) is the umbrella-list grouping logic, separate concern.

### Frontend
- `frontend/src/components/TodayTimeline.tsx` — renders the flat `items` list; needs restructuring to group children under parents.
- `frontend/src/components/AgendaItem.tsx` — single row renderer (checkbox, title, priority badge, time); needs a collapsible children container and progress badge.
- `frontend/package.json` — confirms no DnD library currently installed (only `lucide-react`, `react`, `react-dom`, `react-router-dom`).

### Project Constraints
- `CLAUDE.md` (project root) — GSD workflow enforcement; no direct edits outside GSD commands.
- `.planning/PROJECT.md` — "no new dependencies" hard constraint is scoped to the v2.0–v2.2 LLM/ingest milestones (see D-12 exception above).

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None for drag-and-drop — this is genuinely new frontend capability for the project.
- Generic PATCH pattern on `tasks.py` (`exclude_unset=True`) means adding `parent_task_id` to the schema is enough for the API to support partial updates without new endpoint code, EXCEPT for any dedicated reorder/bulk-nest endpoint if research determines one is needed.

### Established Patterns
- Migrations follow sequential numbering (current HEAD 0018 per Phase 16); add the next migration(s) in this chain.
- `AgendaItem` items can represent a Task, a calendar event (`isEvent`), or a planned block (`isBlock`) — drag/nest logic must branch on these flags per D-04.
- Task/Goal edit drawers follow an existing collapsible-field pattern (per Phase 09/quick-task 260617-ldm's "Collapsible input" for `estimated_minutes`) — the new "Subtask of" field (D-11) should follow the same UI convention.

### Integration Points
- `Task` model + migration chain (backend).
- `TaskCreate`/`TaskUpdate`/`TaskRead` schemas (backend).
- `ScheduledBlock` model (Phase 10) — needs its own `parent_task_id` column (D-05).
- `TodayTimeline.tsx` / `AgendaItem.tsx` (Today view nesting UI).
- Tasks list page (per D-02, also needs nesting UI — locate exact file during research/planning).
- Task edit drawer component (per D-11, add "Subtask of" field).

</code_context>

<specifics>
## Specific Ideas

User's original example: grocery-list items (Chicken, Oatmeal, Cliff Bars) becoming subtasks of "Go to Sam's Club" in the Today timeline, to help organize tasks that are logically part of a larger errand/task.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-task-subtask-hierarchy-drag-drop*
*Context gathered: 2026-07-07*
