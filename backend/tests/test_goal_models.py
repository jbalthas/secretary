"""
Failing tests for Task 1 of Plan 08-02.

Tests verify:
- Goal, Milestone, GoalType, GoalStatus can be imported from app.models
- Task has goal_id, external_key, is_habit, estimated_minutes columns
- Routine has goal_id, external_key columns
- db.py pragma enforces foreign keys
"""


def test_goal_model_imports():
    from app.models import Goal, Milestone, GoalType, GoalStatus
    assert hasattr(Goal, "__tablename__")
    assert Goal.__tablename__ == "goals"
    assert hasattr(Milestone, "__tablename__")
    assert Milestone.__tablename__ == "milestones"


def test_goal_status_enum():
    from app.models import GoalStatus
    assert GoalStatus.active.value == "active"
    assert GoalStatus.archived.value == "archived"
    assert GoalStatus.completed.value == "completed"


def test_goal_type_enum():
    from app.models import GoalType
    assert GoalType.career.value == "career"
    assert GoalType.life.value == "life"
    assert GoalType.health.value == "health"
    assert GoalType.learning.value == "learning"
    assert GoalType.financial.value == "financial"


def test_goal_columns():
    from app.models import Goal
    cols = Goal.__table__.c
    assert "id" in cols
    assert "external_key" in cols
    assert "title" in cols
    assert "type" in cols
    assert "description" in cols
    assert "target_date" in cols
    assert "status" in cols
    assert "created_at" in cols
    assert "updated_at" in cols


def test_milestone_columns():
    from app.models import Milestone
    cols = Milestone.__table__.c
    assert "id" in cols
    assert "goal_id" in cols
    assert "title" in cols
    assert "target_date" in cols
    assert "done" in cols


def test_task_new_columns():
    from app.models import Task
    cols = Task.__table__.c
    assert "goal_id" in cols
    assert "external_key" in cols
    assert "is_habit" in cols
    assert "estimated_minutes" in cols


def test_task_goal_fk():
    from app.models import Task
    fks = {fk.target_fullname for fk in Task.__table__.c["goal_id"].foreign_keys}
    assert "goals.id" in fks


def test_task_goal_id_nullable():
    from app.models import Task
    assert Task.__table__.c["goal_id"].nullable is True


def test_task_is_habit_not_nullable():
    from app.models import Task
    assert Task.__table__.c["is_habit"].nullable is False


def test_routine_new_columns():
    from app.models import Routine
    cols = Routine.__table__.c
    assert "goal_id" in cols
    assert "external_key" in cols


def test_routine_goal_fk():
    from app.models import Routine
    fks = {fk.target_fullname for fk in Routine.__table__.c["goal_id"].foreign_keys}
    assert "goals.id" in fks


def test_goal_relationships():
    from app.models.goal import Goal
    assert hasattr(Goal, "milestones")
    assert hasattr(Goal, "tasks")
    assert hasattr(Goal, "routines")


def test_milestone_relationship():
    from app.models.goal import Milestone
    assert hasattr(Milestone, "goal")


def test_goal_selectin_lazy():
    from app.models.goal import Goal
    milestones_rel = Goal.__mapper__.relationships["milestones"]
    assert milestones_rel.lazy == "selectin"
    tasks_rel = Goal.__mapper__.relationships["tasks"]
    assert tasks_rel.lazy == "selectin"


def test_db_foreign_keys_pragma():
    """The pragma listener adds PRAGMA foreign_keys=ON."""
    from app import db as app_db
    import inspect
    src = inspect.getsource(app_db._set_sqlite_pragmas)
    assert "PRAGMA foreign_keys=ON" in src
