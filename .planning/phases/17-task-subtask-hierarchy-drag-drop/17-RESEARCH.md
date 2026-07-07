# Phase 17: Task Subtask Hierarchy Drag Drop - Research

**Researched:** 2026-07-07
**Domain:** React drag-and-drop (dnd-kit), SQLAlchemy self-referencing FK, SQLite/Alembic migrations
**Confidence:** HIGH (backend/migration patterns, current codebase state) / MEDIUM (DnD library choice — inherent tradeoff between maturity and freshness, documented below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** One level of nesting only — parent + children, no grandchildren. A child cannot itself have children.
- **D-02:** Nesting is visible and editable on both the Today timeline AND the Tasks list page (not Today-only).
- **D-03:** Drop directly on the center of a row (row highlights while dragging over) = nest as subtask. Drop in the gap between rows = reorder in the flat list.
- **D-04:** Draggable/nestable items are Tasks and planned Organize blocks (ScheduledBlock). Calendar events (synced from Google) are NOT draggable or nestable.
- **D-05:** `ScheduledBlock` gets its own nullable `parent_task_id` column (separate from `Task.parent_task_id`). The parent is always a Task — a ScheduledBlock can never be a parent.
- **D-06:** The parent row shows a subtask progress badge, e.g. "2/3".
- **D-07:** No auto-complete propagation between parent/child in either direction.
- **D-08:** Children keep their own time/priority/due-date. Nesting is purely visual/relational.
- **D-09:** Nested groups are expanded by default.
- **D-10:** Dragging a child into empty timeline space clears its `parent_task_id`.
- **D-11:** The task edit drawer gets a "Subtask of" dropdown/field.
- **D-12:** This phase adds one new frontend-only dependency: a drag-and-drop library. User explicitly approved this exception to the "no new dependencies" constraint (which is scoped to the LLM/ingest loop). No backend dependencies added.

### Claude's Discretion
- Exact DnD library choice and API — pick whichever integrates most cleanly with the existing React 19 + Vite setup.
- Exact migration numbering (continue the existing Alembic chain; check current HEAD before writing).
- Visual treatment of indentation/collapse affordance — follow existing CSS variable/theme conventions in `AgendaItem.tsx`/`Tasks.tsx`.
- Whether reordering (drop-in-gap) requires a persisted `order`/`position` column or can stay implicit.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

No REQ-IDs exist yet for this phase (added directly to STATE.md roadmap on 2026-07-07, not yet back-filled into REQUIREMENTS.md). CONTEXT.md decisions D-01 through D-12 are the authoritative scope. This research maps each decision to the concrete implementation mechanism found below rather than to REQ-IDs.

| Decision | Research Support |
|----------|-------------------|
| D-01 (one-level nesting) | Application-level validation pattern (no DB-level self-ref depth constraint possible in SQLite) — see Architecture Patterns |
| D-02 (Tasks page nesting) | Tasks.tsx is a card-grid layout, not a linear list — see Common Pitfalls #3 |
| D-03 (center=nest, gap=reorder) | dnd-kit custom collision detection pattern — see Architecture Patterns |
| D-04/D-05 (Task+ScheduledBlock parent_task_id) | Confirmed current models/schemas — see Standard Stack / Code Examples |
| D-06 (progress badge) | Client-side grouping pattern already established for `parent_list_name` — reuse, no backend aggregation needed |
| D-10 (drag to empty space clears parent) | dnd-kit `onDragEnd` with no valid droppable target |
| D-11 (Subtask of dropdown) | GoalSelect.tsx pattern to model against |
| Persisted order column (discretion) | See Open Questions #1 |
</phase_requirements>

## Summary

This phase adds a single self-referencing parent/child relationship to `Task` (and a separate, Task-only-parent `parent_task_id` on `ScheduledBlock`), plus a new frontend drag-and-drop dependency to let the user visually nest tasks under one another. The backend change is small and low-risk: one Alembic migration (0019) adding two nullable FK columns with `ondelete="SET NULL"`, following the exact pattern already used for `Task.goal_id` (migration 0007) and `ScheduledBlock.task_id` (migration 0009). No ORM `relationship()` is needed — the codebase has an established precedent (`parent_list_name`/`list_name` grouping) for computing parent/child structure **client-side** from the already-fetched flat list, and that pattern should be reused for `parent_task_id` grouping rather than adding `lazy="selectin"` self-referential relationships, which would add complexity with no benefit at this scale.

The frontend change is larger. Two UI surfaces need nesting UI: the Today timeline (`TodayTimeline.tsx`/`AgendaItem.tsx`, a linear row-based list) and the Tasks page (`Tasks.tsx`/`TaskCard.tsx`, a **card grid**, not a list) — these are structurally different layouts and the drag-and-drop/indentation treatment cannot be copy-pasted between them. A new DnD library must be added per D-12. The two realistic candidates are the legacy-but-mature `@dnd-kit/core` + `@dnd-kit/sortable` (v6.3.1 / v10.0.0, stable since Dec 2024, works with React 19 via an unbounded peer range and wide community confirmation) versus the brand-new `@dnd-kit/react` (v0.5.0, published one day before this research, explicitly targets React 18/19, but pre-1.0 and represents an entirely different, dependency-heavier API with far less community precedent for exactly this "drop-on-center-to-nest vs drop-in-gap-to-reorder" pattern). Given this project's stated preference for boring, stable choices (`APScheduler 3.x not 4.x`, `nginx not Caddy`, etc.), **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** is the prescriptive recommendation.

Neither dnd-kit package has a built-in "drop on center = nest, drop in gap = reorder" behavior — this must be built as custom collision detection using pointer-position-within-target-rect math (a well-documented pattern, e.g. Notion/Linear-style block nesting), not something dnd-kit gives you out of the box in either version.

**Primary recommendation:** Add `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/utilities@^3.2.2` to `frontend/package.json`. Add `Task.parent_task_id` (nullable FK, `ondelete=SET NULL`) and `ScheduledBlock.parent_task_id` (nullable FK to `tasks.id`, `ondelete=SET NULL`) via Alembic migration `0019`. Do not add ORM relationships — group parent/child client-side, reusing the existing `parent_list_name` grouping pattern (`lib/taskFilters.ts`) as the template. Enforce one-level-nesting and "parent is always a Task" at the router/service layer, not the database layer.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | 6.3.1 | Drag-and-drop primitives (DndContext, sensors, collision detection) | Framework-agnostic-ish React DnD toolkit; peer dep `react: >=16.8.0` (no upper bound, confirmed via `npm view`) so React 19 installs cleanly; the de facto community standard referenced as the "legacy"/baseline API in dnd-kit's own migration docs, meaning it's still what the vast majority of production React apps run today |
| @dnd-kit/sortable | 10.0.0 | Sortable list preset built on @dnd-kit/core | Provides `SortableContext`, `useSortable`, `arrayMove` — needed for the drop-in-gap reorder behavior; peer dep `@dnd-kit/core: ^6.3.0` |
| @dnd-kit/utilities | 3.2.2 | CSS transform helpers (`CSS.Transform.toString`) | Standard companion package for applying drag-transform styles; peer dep `react: >=16.8.0` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | No additional supporting packages needed — dnd-kit's `PointerSensor` covers both mouse and touch |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/core + sortable (legacy) | @dnd-kit/react (0.5.0) | Officially the "recommended path forward" per dnd-kit's own docs, and has explicit React 18/19 peer deps — but published 2026-07-06 (literally the day before this research), pre-1.0, requires 3 additional internal packages (`@dnd-kit/dom`, `@dnd-kit/state`, `@dnd-kit/abstract`), and has far less community documentation/precedent for custom nest-vs-reorder collision logic. Riskier for a personal-project "add once and don't revisit" dependency. |
| @dnd-kit/core + sortable | react-beautiful-dnd | Confirmed unmaintained/deprecated by Atlassian; hard peer dep on React 16/17/18 only — does NOT support React 19. Ruled out. |
| @dnd-kit/core + sortable | @hello-pangea/dnd (community fork of react-beautiful-dnd) | Actively maintained fork, but inherits react-beautiful-dnd's list-only (no nesting) mental model — poor fit for "drop on center = nest" requirement. |
| @dnd-kit/core + sortable | Atlassian Pragmatic drag-and-drop | Headless, framework-agnostic, built for Jira/Trello-scale performance — excellent library but no built-in React sortable preset, meaning more custom code for this project's small-scale needs than dnd-kit's sortable preset already provides. Overkill per the project's "no premature abstraction" philosophy. |

**Installation:**
```bash
cd frontend
npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
```

**Version verification:** Confirmed via `npm view` on 2026-07-07:
- `@dnd-kit/core@6.3.1` — peer `react: >=16.8.0`, published 2024-12-05
- `@dnd-kit/sortable@10.0.0` — peer `react: >=16.8.0`, `@dnd-kit/core: ^6.3.0`, published 2024-12-04
- `@dnd-kit/utilities@3.2.2` — peer `react: >=16.8.0`
- `@dnd-kit/react@0.5.0` — peer `react: ^18.0.0 || ^19.0.0`, published 2026-07-06 (one day before this research — flagged as too fresh to be the safe default choice)

## Architecture Patterns

### Recommended Project Structure (delta only)
```
backend/
├── migrations/versions/0019_add_parent_task_id.py   # new — Task.parent_task_id + ScheduledBlock.parent_task_id
├── app/models/__init__.py                            # Task gains parent_task_id column (no relationship)
├── app/models/plan.py                                 # ScheduledBlock gains parent_task_id column
├── app/schemas/task.py                                # TaskCreate/TaskUpdate/TaskRead gain parent_task_id
├── app/schemas/plan.py                                # ScheduledBlockUpdate needs parent_task_id (currently only has `completed` — see Pitfall #1)
└── app/routers/tasks.py                               # add one-level + "not-a-child-of-itself" validation on PATCH

frontend/
├── package.json                                       # + @dnd-kit/core, /sortable, /utilities
├── src/types/task.ts                                  # Task, TaskCreate, AgendaItem gain parent_task_id / childCount
├── src/lib/taskHierarchy.ts                            # new — client-side grouping helper (parallels taskFilters.ts)
├── src/components/TodayTimeline.tsx                    # wrap in DndContext, render nested rows
├── src/components/AgendaItem.tsx                       # add indent/collapse, progress badge, drag handle
├── src/pages/Tasks.tsx                                 # wrap card grid in DndContext, group parent/child cards
├── src/components/TaskCard.tsx                         # add progress badge, nested-child card variant
└── src/components/TaskDrawer.tsx                       # add "Subtask of" <select> (mirrors GoalSelect.tsx)
```

### Pattern 1: No ORM relationship — client-side grouping (reuse existing precedent)
**What:** Do not add `relationship("Task", remote_side=...)` for `parent_task_id`. Expose it as a plain scalar FK column on `TaskRead`/`ScheduledBlockRead`, exactly like `goal_id` and `parent_list_name` are today. The frontend already fetches the full flat task list (`useTasks()` → `GET /api/v1/tasks/`) on every page that needs it; group children under parents client-side.
**When to use:** Always, for this phase — the project already has this exact pattern for `parent_list_name`/`list_name` grouping (`frontend/src/lib/taskFilters.ts`), and the codebase's Phase 8 lesson (`lazy="selectin" mandatory on all Goal/Milestone relationships ... prevents MissingGreenlet in async SQLAlchemy`) shows that ORM relationships in this codebase carry real async-session gotchas. Since only one level of nesting exists (D-01) and the progress badge (D-06) only needs a count, no backend aggregation query is needed at all — the client already has every task in memory.
**Example:**
```python
# backend/app/models/__init__.py — add to Task, no relationship() needed
parent_task_id: Mapped[int | None] = mapped_column(
    ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
)
```
```typescript
// frontend/src/lib/taskHierarchy.ts — mirrors taskFilters.ts grouping style
export function groupByParent(tasks: Task[]): { parents: Task[]; childrenByParentId: Map<number, Task[]> } {
  const childrenByParentId = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.parent_task_id == null) continue;
    const list = childrenByParentId.get(t.parent_task_id) ?? [];
    list.push(t);
    childrenByParentId.set(t.parent_task_id, list);
  }
  const parents = tasks.filter((t) => t.parent_task_id == null);
  return { parents, childrenByParentId };
}
```

### Pattern 2: Application-level one-level-nesting validation (not DB-level)
**What:** SQLite CHECK constraints cannot reference other rows, so "a child cannot itself have children" (D-01) cannot be enforced with a table constraint. Enforce it in the router/service layer when `parent_task_id` is set via PATCH:
1. Reject if `target.parent_task_id is not None` (target is already a child — would create a grandchild).
2. Reject if the task being nested already has children (nesting it under another task would make its own children into grandchildren) — OR, cheaper: on nesting, clear `parent_task_id` on any existing children of the task being nested (auto-flatten). **Recommend the reject-with-clear-error approach** (422) for D-01 simplicity — matches the project's "no defensive coding for impossible states, error handling only at system boundaries" convention (user input via drag/drawer IS a boundary).
**When to use:** In `PATCH /api/v1/tasks/{id}` and the new `PATCH /api/v1/plan/blocks/{id}` handling, whenever `parent_task_id` is present in the update body.
**Example:**
```python
# backend/app/routers/tasks.py — inside update_task, before the exclude_unset loop
if "parent_task_id" in body.model_dump(exclude_unset=True) and body.parent_task_id is not None:
    parent = await session.get(Task, body.parent_task_id)
    if parent is None:
        raise HTTPException(404, detail="Parent task not found")
    if parent.parent_task_id is not None:
        raise HTTPException(422, detail="Cannot nest under a task that is itself a subtask (one level only)")
    has_children = (await session.execute(
        select(Task.id).where(Task.parent_task_id == task_id).limit(1)
    )).first()
    if has_children:
        raise HTTPException(422, detail="Cannot nest a task that already has subtasks (one level only)")
```

### Pattern 3: dnd-kit custom collision detection for "center = nest, gap = reorder"
**What:** Neither `@dnd-kit/core` nor `@dnd-kit/sortable` ship a built-in "nest vs reorder based on drop position" behavior — `SortableContext` alone only reorders within a flat list, and dnd-kit's own docs note "cross-level sorting isn't possible... nested SortableContext components don't allow reordering across levels... you have to customize it." This must be built as a custom `collisionDetection` function (or `onDragMove` handler) that, for the currently-hovered droppable row, compares the pointer's Y position to that row's bounding rect: middle band (e.g. center 50%) → "nest" intent; top/bottom edge bands → "reorder before/after" intent. Track this as local state (`overId`, `dropIntent: "nest" | "reorder"`) driven off `onDragOver`, and render the visual highlight (row background / insertion line) accordingly. Resolve the actual mutation in `onDragEnd`.
**When to use:** Both `TodayTimeline.tsx` and `Tasks.tsx` drag handlers.
**Example:**
```typescript
// Source: pattern derived from dndkit.com/concepts (closestCenter) + community "Notion-style nesting" implementations
function resolveDropIntent(pointerY: number, rect: DOMRect): "nest" | "before" | "after" {
  const relative = (pointerY - rect.top) / rect.height; // 0 = top edge, 1 = bottom edge
  if (relative < 0.25) return "before";
  if (relative > 0.75) return "after";
  return "nest";
}
```

### Pattern 4: "Subtask of" dropdown (D-11) — mirrors GoalSelect.tsx
**What:** A plain controlled `<select>` populated from the full task list (excluding the task being edited itself, and excluding any task that already has a parent — since a child cannot become a parent), following the exact structure of the existing `GoalSelect.tsx` component (`value ?? ""`, empty-string sentinel for "no parent").
**When to use:** `TaskDrawer.tsx`, alongside the existing `GoalSelect` field.

### Anti-Patterns to Avoid
- **Full tree/recursive nesting support:** D-01 explicitly caps at one level. Do not build a generic recursive tree component (e.g. via `@dnd-kit`'s more complex "tree" community examples) — that solves a harder problem than this phase needs and adds real complexity (recursive rendering, multi-level collision math) with zero requirement backing it.
- **Adding `@dnd-kit/react` "because it's newer":** it was published the day before this research; treat pre-1.0 packages published within the last 48 hours as unproven for a "one dependency, added once" personal-project decision.
- **ORM self-referential relationship with eager loading:** would resurrect the exact `MissingGreenlet` class of bug the codebase's Phase 8 notes explicitly warn about, for a feature (a "2/3" count) that's trivially computed client-side from data already in memory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag sensing (mouse/touch/keyboard) | Custom `mousedown`/`touchstart` listeners + manual drag-image rendering | `@dnd-kit/core`'s `PointerSensor` + `DndContext` | Handles pointer capture, drag thresholds, touch scrolling conflicts, and accessibility (keyboard) drag out of the box |
| List reorder array math | Custom splice/insert index math | `@dnd-kit/sortable`'s `arrayMove` utility | Off-by-one bugs in manual array reordering are a classic drag-and-drop source of bugs; `arrayMove(array, from, to)` is a one-liner, well-tested |
| Drag transform CSS | Hand-rolled `transform: translate(...)` string building | `@dnd-kit/utilities`'s `CSS.Transform.toString(transform)` | Handles the `translate3d` + scale edge cases dnd-kit's transform object produces during drag |

**Key insight:** The nest-vs-reorder *decision logic* (Pattern 3 above) genuinely must be hand-built — that is domain-specific to this app's UX and no library ships it — but the underlying drag mechanics (sensing, transform, list math) should not be reimplemented.

## Common Pitfalls

### Pitfall 1: `ScheduledBlockUpdate` schema does NOT currently support partial/generic PATCH
**What goes wrong:** CONTEXT.md's canonical_refs state that the generic `exclude_unset=True` PATCH pattern on `tasks.py` "already supports adding new fields without router changes." That is true for `tasks.py` (`TaskUpdate(TaskCreate)` — full pass-through), but **`app/schemas/plan.py`'s `ScheduledBlockUpdate` is a narrow, single-field schema (`completed: bool` only)**, and `app/routers/plan.py`'s `update_block` handler only reads `body.completed` — it does not do a generic `model_dump(exclude_unset=True)` loop. Assuming `parent_task_id` "just works" on `PATCH /plan/blocks/{id}` without router changes (per CONTEXT.md's characterization) will silently fail to update the field.
**Why it happens:** CONTEXT.md's canonical_refs were captured for `tasks.py` specifically; `plan.py`'s router uses a different, narrower pattern that wasn't checked at discuss-phase time.
**How to avoid:** The plan MUST include a task to (a) add `parent_task_id: int | None = None` to `ScheduledBlockUpdate`, and (b) update `update_block()` in `routers/plan.py` to apply it (either via an explicit `if body.parent_task_id is not None: block.parent_task_id = ...` or by switching to the same `exclude_unset=True` loop pattern used in `tasks.py`).
**Warning signs:** A PATCH to `/plan/blocks/{id}` with `parent_task_id` in the body returns 200 but the value never persists — verify with the existing `test_plan.py` test pattern before considering the block-side of D-05 done.

### Pitfall 2: Tasks page (D-02) is a card grid, not a linear list
**What goes wrong:** `frontend/src/pages/Tasks.tsx` renders `TaskCard` components in a `.tasks-card-grid` (a responsive 3-column CSS grid per the 260630-j83 quick-task redesign), not a vertical row list like `AgendaItem`/`TodayTimeline`. The "drop on center = nest, drop in gap = reorder" interaction (D-03) and "indented/collapsible" visual (per phase boundary) map naturally onto a linear list but do NOT map cleanly onto a multi-column card grid — there is no obvious "gap between rows" in a grid, and indentation has no clear visual meaning for a card.
**Why it happens:** D-02 was decided in the abstract ("nesting also required there") without reconciling it against the Tasks page's actual current card-grid layout, which postdates the phases the CONTEXT canonical_refs were drawn from.
**How to avoid:** The plan should treat Tasks-page nesting as a **visually distinct implementation** from the Today timeline, not a copy-paste. A reasonable resolution (to validate with the user during planning, not assumed here): render child cards visually grouped directly under/adjacent to their parent card (e.g., a sub-grid or an indented mini-list docked to the parent card) rather than literally reusing the timeline's row-based drop-zone math. Flagged as an Open Question below — do not treat this as solved by this research.
**Warning signs:** Attempting to reuse `TodayTimeline`'s exact collision-detection code against `.tasks-card-grid` without adapting for grid geometry (cards can be to the left/right, not just above/below).

### Pitfall 3: SQLite foreign key enforcement is ON — self-referencing FK errors are real, not silent
**What goes wrong:** `app/db.py` sets `PRAGMA foreign_keys=ON` on every connection. This is good (it makes the `ondelete="SET NULL"` behavior actually work), but it also means a bad `parent_task_id` value (pointing to a nonexistent task id) will raise an `IntegrityError` at commit time, not silently insert. Any test or manual data-seeding path that doesn't clean up dangling `parent_task_id` values after deleting a task (if `ondelete="SET NULL"` isn't correctly wired in the migration) will hard-fail.
**Why it happens:** Easy to forget when copy-pasting a plain nullable-column migration without the accompanying `create_foreign_key(..., ondelete="SET NULL")` call inside the same `batch_alter_table` block (SQLite requires table rebuild via batch mode to add a FK constraint — it cannot be added via plain `ALTER TABLE`).
**How to avoid:** Follow migration `0007_task_goal_fk.py`'s pattern exactly: `add_column` + `create_foreign_key` inside the same `batch_alter_table("tasks")` context manager, and correspondingly for `scheduled_blocks`.

### Pitfall 4: Client-side reorder needs a persisted order field, or it silently resets
**What goes wrong:** If drop-in-gap reorder (D-03) only reorders the array in local React state without persisting an order to the backend, the custom order will be lost on next fetch/reload (`useTasks()`/`usePlan()` re-fetch and re-sort by `created_at`/`due_date`/`priority`, none of which reflect a manual drag reorder).
**Why it happens:** It's tempting to treat "reorder" as free because the DnD library handles the in-memory array move for you — but persistence is a separate, deliberate backend decision (see Open Questions #1).
**How to avoid:** Decide and implement a persisted ordering field as part of this phase's plan, not defer it silently.

## Code Examples

### Alembic migration 0019 (follows 0007/0009 pattern exactly)
```python
# Source: pattern matches backend/migrations/versions/0007_task_goal_fk.py and 0009_create_scheduled_blocks.py
"""add parent_task_id to tasks and scheduled_blocks

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("parent_task_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_tasks_parent_task_id", "tasks", ["parent_task_id"], ["id"], ondelete="SET NULL",
        )
    op.create_index("ix_tasks_parent_task_id", "tasks", ["parent_task_id"])

    with op.batch_alter_table("scheduled_blocks") as batch_op:
        batch_op.add_column(sa.Column("parent_task_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_scheduled_blocks_parent_task_id", "tasks", ["parent_task_id"], ["id"], ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("scheduled_blocks") as batch_op:
        batch_op.drop_constraint("fk_scheduled_blocks_parent_task_id", type_="foreignkey")
        batch_op.drop_column("parent_task_id")

    op.drop_index("ix_tasks_parent_task_id", table_name="tasks")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_parent_task_id", type_="foreignkey")
        batch_op.drop_column("parent_task_id")
```

### Frontend: DndContext + custom nest/reorder resolution skeleton
```typescript
// Source: pattern assembled from dndkit.com/concepts (DndContext, collision detection) — no single official
// example covers "nest vs reorder"; this is a custom composition, not a copy-paste from docs.
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";

function TodayTimelineDnd({ items, onNest, onReorder, onClear }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      onClear(active.id as number); // dropped in empty space -> D-10
      return;
    }
    const intent = (event.collisions?.[0] as any)?.data?.intent; // "nest" | "before" | "after"
    if (intent === "nest") {
      onNest(active.id as number, over.id as number);
    } else {
      onReorder(active.id as number, over.id as number, intent);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* rows */}
    </DndContext>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| react-beautiful-dnd | @dnd-kit (core+sortable, or new @dnd-kit/react) | Atlassian deprecated react-beautiful-dnd; no React 19 support | Confirms react-beautiful-dnd is correctly ruled out per the research question's premise |
| @dnd-kit/core + @dnd-kit/sortable | @dnd-kit/react (unified DragDropProvider) | @dnd-kit/react 0.5.0 released 2026-07-06 | Represents dnd-kit's own stated future direction, but is one day old at research time — too fresh to be the default pick for this phase; documented as the alternative to revisit in a future phase once it matures past 1.0 |

**Deprecated/outdated:**
- react-beautiful-dnd: confirmed deprecated by Atlassian, no React 19 peer support (hard version ceiling at React 18).

## Open Questions

1. **Does drop-in-gap reorder need a persisted `order`/`position` column, and on which entity?**
   - What we know: dnd-kit's `arrayMove` handles in-memory reordering trivially; the codebase has no existing manual-order field on `Task` (current sort is by `due_date`/`priority`/`created_at` — see `sortTasks()` in `Tasks.tsx`). `ScheduledBlock` rows are already ordered by `start_dt` (an actual clock time), so "reordering" a scheduled block without changing its `start_dt`/`end_dt` is semantically odd — a block's position in the timeline should follow its time, not an arbitrary order field.
   - What's unclear: whether "reorder" (D-03) is meant to apply to Task rows only (which currently have no manual order — needs a new nullable `sort_order` int column) or also to ScheduledBlock rows (which arguably shouldn't be freely reorderable independent of time).
   - Recommendation: Add a nullable `sort_order: int` column to `Task` only (not `ScheduledBlock`). On drop-in-gap reorder within the flat/top-level task list, renumber the small set of visibly-reordered tasks with simple sequential integers (e.g., step-10 gaps) — the personal, single-user scale here makes a full renumber-on-every-drag perfectly cheap; no fractional-indexing library needed. For `ScheduledBlock`, treat "reorder" drops as a no-op or restrict block reordering to time-based (re-run Organize) — confirm this scoping decision explicitly with the user during planning rather than assuming it.

2. **What does "nesting" look like visually on the Tasks page card grid (D-02)?**
   - What we know: `Tasks.tsx` renders a `.tasks-card-grid` (multi-column grid of `TaskCard`), fundamentally different from the Today timeline's linear row list that D-03's "drop on center / drop in gap" language was evidently designed around.
   - What's unclear: whether children should render as a sub-grid docked under the parent card, an indented list replacing the grid for grouped items, or something else; how drag-drop collision detection translates from "row above/below" to "card in a 2D grid."
   - Recommendation: Treat as a distinct sub-task in planning requiring its own UI decision (not reuse-by-default from the timeline implementation); consider a simpler fallback for the grid view (e.g., a non-drag "Subtask of" grouping display + only D-11's dropdown for assignment on the Tasks page, with full drag-to-nest reserved for the Today timeline) if full drag support on a card grid proves disproportionately complex relative to the phase's scope. Surface this tradeoff to the user if it comes up during planning — it's a scope question, not a pure technical one.

3. **Does the "no grandchildren" rule reject or auto-flatten?**
   - What we know: D-01 forbids grandchildren. Two ways to enforce it: reject the action (422 error, user must manually un-nest the intermediate task first) or auto-flatten (silently clear the deeper level's parent when a conflicting nest is attempted).
   - What's unclear: which behavior CONTEXT.md's decisions imply — D-01 only states the invariant, not the enforcement mechanism.
   - Recommendation: Reject with a clear 422 message (Pattern 2 above) — simpler, more predictable, matches the project's boundary-validation convention, and avoids surprising data loss (silently un-nesting someone's existing children).

## Environment Availability

N/A — this phase's only new dependency is an npm package (`@dnd-kit/*`), confirmed installable via `npm view` against the public registry (see Standard Stack). No new system tools, services, or runtimes are required. No backend dependencies are added (per D-12).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | pytest 8.x + FastAPI `TestClient` (sync, per established `test_tasks.py`/`test_plan.py` pattern) |
| Frontend framework | Vitest 4.1.x + jsdom |
| Config file | `backend/pyproject.toml` ([dependency-groups] dev); `frontend/vitest` config implicit via `vite` config + `package.json` `"test": "vitest"` |
| Quick run command (backend) | `cd backend && uv run pytest tests/test_tasks.py tests/test_plan.py -x` |
| Quick run command (frontend) | `cd frontend && npm test -- --run` |
| Full suite command (backend) | `cd backend && uv run pytest` |
| Full suite command (frontend) | `cd frontend && npm test -- --run` |

### Phase Requirements → Test Map
| Req/Decision | Behavior | Test Type | Automated Command | File Exists? |
|--------------|----------|-----------|--------------------|--------------|
| D-01 | Nesting a task under an already-nested task is rejected (422) | unit/integration | `pytest tests/test_tasks.py::test_nest_under_child_rejected -x` | ❌ Wave 0 |
| D-01 | Nesting a task that already has children is rejected (422) | integration | `pytest tests/test_tasks.py::test_nest_task_with_children_rejected -x` | ❌ Wave 0 |
| D-04/D-05 | `ScheduledBlock.parent_task_id` can be set/cleared via PATCH | integration | `pytest tests/test_plan.py::test_patch_block_parent_task_id -x` | ❌ Wave 0 |
| D-07 | Completing a parent does not complete children and vice versa | integration | `pytest tests/test_tasks.py::test_no_completion_propagation -x` | ❌ Wave 0 |
| D-10 | Deleting a parent task sets children's `parent_task_id` to NULL (ondelete=SET NULL) | integration | `pytest tests/test_tasks.py::test_delete_parent_clears_children -x` | ❌ Wave 0 |
| D-06 | Client-side grouping helper produces correct parent/children map + counts | unit | `npm test -- --run taskHierarchy.test.ts` | ❌ Wave 0 |
| D-03 | `resolveDropIntent` correctly classifies pointer position into nest/before/after | unit | `npm test -- --run dragIntent.test.ts` | ❌ Wave 0 |
| D-11 | TaskDrawer "Subtask of" field renders and excludes invalid parents | manual + component | manual verification (drawer has no existing component test harness) | — |

### Sampling Rate
- **Per task commit:** targeted `pytest tests/test_tasks.py tests/test_plan.py -x` (backend) and `npm test -- --run <touched-file>.test.ts` (frontend)
- **Per wave merge:** full `uv run pytest` + `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_tasks.py` — add nesting-validation tests (D-01, D-07, D-10) alongside existing task tests
- [ ] `backend/tests/test_plan.py` — add `ScheduledBlock.parent_task_id` PATCH tests (D-04/D-05); note this also requires the schema/router fix from Pitfall #1 before these tests can pass
- [ ] `frontend/src/lib/taskHierarchy.test.ts` — new file, unit tests for the client-side grouping helper (mirrors existing `taskFilters.test.ts`)
- [ ] `frontend/src/lib/dragIntent.test.ts` (or co-located with the DnD wrapper) — unit tests for the nest/reorder pointer-position classifier (pure function, easily unit-testable without mounting dnd-kit)

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (2026-07-07): `backend/app/models/__init__.py`, `backend/app/models/plan.py`, `backend/app/schemas/task.py`, `backend/app/schemas/plan.py`, `backend/app/routers/tasks.py`, `backend/app/routers/plan.py`, `backend/app/db.py`, `backend/migrations/versions/0007_task_goal_fk.py`, `0009_create_scheduled_blocks.py`, `0013_add_parent_list_name.py`, `0018_advisory_log_priority_rank_last_advisory_at.py`, `frontend/src/components/AgendaItem.tsx`, `TodayTimeline.tsx`, `TaskCard.tsx`, `TaskDrawer.tsx`, `GoalSelect.tsx`, `frontend/src/pages/Tasks.tsx`, `Today.tsx`, `frontend/src/lib/agenda.ts`, `taskFilters.ts`, `frontend/src/types/task.ts`, `plan.ts`, `taskList.ts`, `frontend/src/hooks/usePlan.ts`, `useTasks.ts`, `frontend/package.json`
- `npm view @dnd-kit/core@latest` / `@dnd-kit/sortable@latest` / `@dnd-kit/utilities@latest` / `@dnd-kit/react@latest` — version + peerDependencies + publish dates, run directly against the npm registry 2026-07-07

### Secondary (MEDIUM confidence)
- [dnd kit React migration guide](https://dndkit.com/react/guides/migration/) — confirms @dnd-kit/react is the "recommended path forward" over legacy core/sortable
- [dnd kit React quickstart](https://dndkit.com/react/quickstart/) — confirms @dnd-kit/react package composition and `DragDropProvider` API shape
- WebSearch: react-beautiful-dnd deprecation / React 19 incompatibility, cross-verified against the npm peer-dependency data pulled directly (react-beautiful-dnd@13.1.1 peer range does not include React 19)
- WebSearch: dnd-kit nested-sortable limitations ("cross-level sorting isn't possible... you have to customize it") — consistent across multiple independent tutorial sources

### Tertiary (LOW confidence)
- None — all findings above were either verified directly against the codebase or against the npm registry/official docs.

## Metadata

**Confidence breakdown:**
- Standard stack (DnD library choice): MEDIUM — the underlying facts (versions, peer deps, publish dates) are HIGH confidence (verified directly), but the choice between "mature legacy" and "fresh official-recommended" package involves a judgment call under genuine uncertainty about @dnd-kit/react's stability, since it is one day old
- Architecture (backend FK/migration pattern, client-side grouping): HIGH — directly follows 3+ existing precedents in this exact codebase
- Architecture (nest-vs-reorder collision logic): MEDIUM — well-understood pattern in the broader ecosystem (Notion/Linear-style nesting), but no official dnd-kit example implements it verbatim; will require custom implementation and testing during planning/execution
- Pitfalls: HIGH — all four pitfalls were found by directly reading current source files, not inferred

**Research date:** 2026-07-07
**Valid until:** 2026-08-06 (30 days) — re-verify `@dnd-kit/react`'s maturity/version if this phase is deferred past that window, since it is evolving rapidly
