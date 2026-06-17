# Phase 10 Deferred Items

## Pre-existing test failure (out of scope)
- `tests/test_calendar.py::test_callback_stores_credentials` fails with 404 on a clean tree (verified via `git stash` at commit 54dfa95, before any 10-03 changes). Unrelated to the plan router — it is an OAuth callback route test. Not fixed per executor scope boundary.

## Dev DB unmigrated (carried from 10-01)
- The live dev SQLite DB is at alembic revision 0005; migrations 0006 (goals), 0007 (task goal_id + estimated_minutes), 0008 (routine FK), 0009 (scheduled_blocks) are unapplied. The `propose` smoke test that hits the real dev DB fails with `no such column: tasks.goal_id`. This is environment state, not a code defect — the test suite uses `Base.metadata.create_all` and all 12 test_plan.py tests pass. Run `alembic upgrade head` on the dev/Pi DB before live use.
