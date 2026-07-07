# Phase 17: Task Subtask Hierarchy Drag Drop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 17-task-subtask-hierarchy-drag-drop
**Areas discussed:** Nesting scope & depth, Drag interaction model, Parent/child display & completion semantics, Un-nesting & manual assignment, Dependency exception

---

## Nesting Scope & Depth

| Option | Description | Selected |
|--------|-------------|----------|
| One level only | Parent + children, no grandchildren | ✓ |
| Unlimited depth | Any task can have a parent, recursively | |

**User's choice:** One level only.

| Option | Description | Selected |
|--------|-------------|----------|
| Today timeline only | Nesting UI lives only in the Today view | |
| Today timeline + Tasks page | Nesting also renders on the main Tasks list page | ✓ |

**User's choice:** Today timeline + Tasks page (more work than the recommended default, but user wants consistency across both views).

---

## Drag Interaction Model

| Option | Description | Selected |
|--------|-------------|----------|
| Drop-on-center to nest | Drop on row center = nest; drop in gap = reorder | ✓ |
| Explicit nest drop zone | Dedicated indent icon target per row | |
| Long-press/modifier to nest | Normal drag = reorder; modifier = nest | |

**User's choice:** Drop-on-center to nest.

| Option | Description | Selected |
|--------|-------------|----------|
| Tasks only | Only plain tasks draggable/nestable | |
| Tasks + planned blocks | ScheduledBlocks also nestable under a task | ✓ |

**User's choice:** Tasks + planned blocks.

**Follow-up:** Since ScheduledBlock is a separate table from Task, asked how cross-entity nesting should be modeled.

| Option | Description | Selected |
|--------|-------------|----------|
| Add parent_task_id to ScheduledBlock too | Mirrors Task's own column; parent always a Task | ✓ |
| Confirm FK direction only | (same as above, just confirming) | |
| Blocks not nestable after all | Simplify back to tasks-only | |

**User's choice:** Add `parent_task_id` to ScheduledBlock too.
**Notes:** Parent is always a Task (never a ScheduledBlock), consistent with the one-level-deep decision.

---

## Parent/Child Display & Completion Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Show a count badge (e.g. "2/3") | Progress visible without expanding | ✓ |
| No badge, expand to see | Keep row as-is today | |

**User's choice:** Show a count badge.

| Option | Description | Selected |
|--------|-------------|----------|
| No auto-complete | Parent/children complete independently | ✓ |
| Prompt to complete parent | One-tap suggestion, never silent | |
| Auto-complete parent silently | Last child done → parent auto-checked | |

**User's choice:** No auto-complete.

| Option | Description | Selected |
|--------|-------------|----------|
| Children keep own fields | Nesting is purely visual grouping | ✓ |
| Children inherit parent's time | Displayed time follows parent | |

**User's choice:** Children keep their own fields.

| Option | Description | Selected |
|--------|-------------|----------|
| Expanded by default | Children visible immediately | ✓ |
| Collapsed by default | Tap to reveal children | |

**User's choice:** Expanded by default.

---

## Un-nesting & Manual Assignment

| Option | Description | Selected |
|--------|-------------|----------|
| Drag out to un-nest | Drop into empty timeline space clears parent | ✓ |
| No drag-out; edit drawer only | Un-nesting only via form | |

**User's choice:** Drag out to un-nest.

| Option | Description | Selected |
|--------|-------------|----------|
| Add "Subtask of" field to edit drawer | Non-drag path to set/clear parent | ✓ |
| Drag-and-drop only | No dropdown alternative | |

**User's choice:** Add "Subtask of" field to edit drawer.

---

## Dependency Exception (raised outside the initial 4 areas — a hard-constraint conflict surfaced during drag-interaction discussion)

| Option | Description | Selected |
|--------|-------------|----------|
| Add a DnD library (e.g. @dnd-kit/core) | Frontend-only new dependency | ✓ |
| Hand-roll with native HTML5 drag events | Zero new dependencies, more manual/rougher on touch | |

**User's choice:** Add a DnD library.
**Notes:** Project's "no new dependencies" constraint (locked since v2.0) was scoped to the LLM/ingest loop specifically, not a blanket ban on all future libraries. User explicitly approved the exception.

---

## Claude's Discretion

- Exact DnD library choice/API
- Migration numbering (continue Alembic chain from current HEAD)
- Visual treatment of indentation/collapse affordance
- Whether reordering needs a persisted order/position column

## Deferred Ideas

None — discussion stayed within phase scope.
