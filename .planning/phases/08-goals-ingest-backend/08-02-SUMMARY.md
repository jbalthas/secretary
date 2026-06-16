---
phase: 08-goals-ingest-backend
plan: 02
subsystem: database
tags: [sqlalchemy, alembic, sqlite, pydantic, goals, milestones, migrations]

requires:
  - phase: 08-01
    provides: Wave 0 failing tests for goal/ingest endpoints (test_goals.py, test_ingest.py)

provides:
  - Goal and Milestone ORM models with GoalType/GoalStatus enums (lazy=selectin)
  - Task model extended with goal_id (FK SET NULL), external_key, is_habit, estimated_minutes
  - Routine model extended with goal_id (FK SET NULL), external_key
  - PRAGMA foreign_keys=ON enforced on every SQLite connection
  - Alembic migration chain 0006 (goals+milestones) -> 0007 (task columns) -> 0008 (routine columns)
  - TaskCreate accepts goal_id; TaskRead surfaces goal_id and is_habit

affects: [08-03, 08-04, 09-goals-ingest-ui, 10-day-auto-organize]

tech-stack:
  added: []
  patterns:
    - "lazy=selectin on all new ORM relationships (async-safe, avoids MissingGreenlet)"
    - "batch_alter_table for SQLite ALTER on existing tables (Alembic pattern)"
    - "PRAGMA foreign_keys=ON in db.py connect listener for FK cascade enforcement"

key-files:
  created:
    - backend/app/models/goal.py
    - backend/migrations/versions/0006_create_goals.py
    - backend/migrations/versions/0007_task_goal_fk.py
    - backend/migrations/versions/0008_routine_goal_fk.py
    - backend/tests/test_goal_models.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/db.py
    - backend/app/schemas/task.py

key-decisions:
  - "GoalStatus uses status enum (active|archived|completed), NOT archived:bool from ARCHITECTURE.md draft (D-13)"
  - "external_key on existing tables MUST be nullable — batch_alter_table fails NOT NULL on non-empty tables"
  - "is_habit NOT NULL with server_default=0 so existing tasks default to non-habit"
  - "lazy=selectin mandatory on all Goal relationships to prevent MissingGreenlet in async context"
  - "celebrate patch target is app.services.celebrate.<fn>; ingest rollback injection point is app.services.ingest_service._upsert_task"
  - "TaskRead surfaces goal_id and is_habit; downstream plans (08-03, 08-04) depend on this"

patterns-established:
  - "Pattern: batch_alter_table for any ALTER on existing SQLite tables"
  - "Pattern: separate goal.py module imported at bottom of models/__init__.py (mirrors calendar.py pattern)"

requirements-completed: [GOAL-01, GOAL-03, INGEST-06, INGEST-07]

duration: 6min
completed: 2026-06-16
---

# Phase 08 Plan 02: Goals/Milestone Data Foundation Summary

**Goal + Milestone ORM models with GoalType/GoalStatus enums, FK columns on Task/Routine, PRAGMA foreign_keys=ON, and clean Alembic chain 0006->0007->0008**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-16T02:01:29Z
- **Completed:** 2026-06-16T02:07:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created `app/models/goal.py` with GoalType/GoalStatus enums and Goal/Milestone ORM models using `lazy="selectin"` on all relationships (async-safe)
- Extended Task with goal_id (FK SET NULL), external_key (unique nullable indexed), is_habit (NOT NULL default False), estimated_minutes; Routine gains goal_id and external_key
- Added PRAGMA foreign_keys=ON to db.py connect listener so ondelete CASCADE/SET NULL actually fires
- Wrote migration chain 0005->0006->0007->0008 using batch_alter_table for existing tables; runs clean from scratch to head
- Surfaced goal_id and is_habit on TaskRead; goal_id optional on TaskCreate/TaskUpdate

## Task Commits

1. **RED tests** - `2876065` (test)
2. **Task 1: Goal/Milestone models, FK columns, pragma** - `ef7bd0b` (feat)
3. **Merge master** - `3ca601c` (merge — brings 0005 migration and other master changes)
4. **Task 2: Migrations 0006/0007/0008 + task schema** - `040f1f2` (feat)

## Files Created/Modified

- `backend/app/models/goal.py` - Goal, Milestone ORM models + GoalType, GoalStatus enums
- `backend/app/models/__init__.py` - Added FK/Integer/relationship imports; extended Task and Routine; added goal import
- `backend/app/db.py` - Added PRAGMA foreign_keys=ON to connect listener
- `backend/app/schemas/task.py` - TaskCreate gains goal_id; TaskRead surfaces goal_id and is_habit
- `backend/migrations/versions/0006_create_goals.py` - Create goals + milestones tables
- `backend/migrations/versions/0007_task_goal_fk.py` - batch_alter_table tasks with goal_id/external_key/is_habit/estimated_minutes + FK
- `backend/migrations/versions/0008_routine_goal_fk.py` - batch_alter_table routines with goal_id/external_key + FK
- `backend/tests/test_goal_models.py` - 15 model-level unit tests (all passing)

## Decisions Made

- GoalStatus is an enum (active|archived|completed) per D-13, overriding the archived:bool in ARCHITECTURE.md draft
- external_key nullable on existing tables per PITFALLS anti-pattern 5 (NOT NULL fails on non-empty DB)
- lazy="selectin" on all new relationships (mandatory for async SQLAlchemy 2.0)
- estimated_minutes included in 0007 now as nullable integer (Phase 10 planner needs it; avoids future tasks table migration)
- TaskRead surfaces is_habit non-optional (column is NOT NULL); goal_id optional (nullable FK)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Merged master to bring 0005 migration into worktree**
- **Found during:** Task 2 (running alembic upgrade head)
- **Issue:** Worktree branched before 0005 migration was committed in master; Alembic chain was broken (KeyError: '0005')
- **Fix:** Merged master into worktree branch, then popped stashed 0006/0007/0008 files
- **Files modified:** All master changes merged cleanly (no conflicts)
- **Verification:** `alembic upgrade head` ran all 8 migrations clean; `alembic heads` = one head (0008)
- **Committed in:** 3ca601c (merge commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking infrastructure)
**Impact on plan:** Necessary to resolve the missing 0005 migration. No scope creep.

## Issues Encountered

- Worktree branched from master before the 0005 migration (add done to calendar_events) was committed. Fixed by merging master cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Goal + Milestone models registered with Base.metadata; `conftest.py`'s `create_all` will create them in tests
- TaskRead now surfaces goal_id and is_habit for progress-linking and habit assertions
- FK enforcement active; ondelete SET NULL/CASCADE will fire correctly in tests and prod
- Note for downstream plans: celebrate patch target is `app.services.celebrate.<fn>`, ingest rollback injection point is `app.services.ingest_service._upsert_task`
- Wave 0 goal/ingest tests remain RED (routers not yet built) — expected, planned for 08-03/08-04

---
*Phase: 08-goals-ingest-backend*
*Completed: 2026-06-16*
