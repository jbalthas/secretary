# Phase 10 Deferred Items

## Pre-existing test failure (out of scope)
- `tests/test_calendar.py::test_callback_stores_credentials` fails with 404 on a clean tree (verified via `git stash` at commit 54dfa95, before any 10-03 changes). Unrelated to the plan router — it is an OAuth callback route test. Not fixed per executor scope boundary.

## Per-task estimated_minutes field in TaskDrawer editor (out of Phase 10 scope)
- During the 10-04 human-verify checkpoint, the user identified that it would be useful to set a task's `estimated_minutes` (duration the planner uses to size blocks) directly from the TaskDrawer editor. TaskDrawer was not touched by Phase 10 (the `estimated_minutes` column exists from migration 0007, and the planner already reads it), so adding an editor input is a UI enhancement outside this phase's scope. Defer to a future task/phase: add a duration input to TaskDrawer wired to `estimated_minutes`.

## Dev DB unmigrated (carried from 10-01)
- The live dev SQLite DB is at alembic revision 0005; migrations 0006 (goals), 0007 (task goal_id + estimated_minutes), 0008 (routine FK), 0009 (scheduled_blocks) are unapplied. The `propose` smoke test that hits the real dev DB fails with `no such column: tasks.goal_id`. This is environment state, not a code defect — the test suite uses `Base.metadata.create_all` and all 12 test_plan.py tests pass. Run `alembic upgrade head` on the dev/Pi DB before live use.
