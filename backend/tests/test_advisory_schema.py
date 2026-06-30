import pytest
from pydantic import ValidationError

from app.schemas.advisory import AdvisoryPayload, GoalAdjustment, MilestoneAdjustment, TaskCreation
from app.schemas.ingest import IngestPayload


def _example_payload(**overrides):
    base = {
        "payload_type": "advisory",
        "session_id": "copy-this-verbatim-from-the-brief-header",
        "generated_at": "2026-06-30T12:00:00Z",
        "goal_adjustments": [
            {
                "external_key": "ship-v2",
                "target_date": "2026-08-15",
                "priority_rank": 1,
                "rationale": "Career goal with the nearest deadline; pulling it forward keeps momentum.",
            }
        ],
        "milestone_adjustments": [
            {
                "goal_external_key": "ship-v2",
                "title": "Beta cut",
                "target_date": "2026-07-20",
                "done": False,
                "rationale": "Velocity is steady; a slightly later beta date is realistic and reduces slip risk.",
            }
        ],
        "new_tasks": [
            {
                "external_key": "ship-v2-write-runbook",
                "goal_external_key": "ship-v2",
                "title": "Write the launch runbook",
                "priority": "high",
                "estimated_minutes": 90,
                "rationale": "No task currently covers launch-day operations; this unblocks the beta cut milestone.",
            }
        ],
        "notes": "Career goals are on track. The one stalled goal needs a single concrete next action — added as a new task above.",
    }
    base.update(overrides)
    return base


def test_example_payload_validates():
    payload = AdvisoryPayload(**_example_payload())
    assert payload.session_id == "copy-this-verbatim-from-the-brief-header"
    assert payload.goal_adjustments[0].external_key == "ship-v2"
    assert payload.milestone_adjustments[0].title == "Beta cut"
    assert payload.new_tasks[0].title == "Write the launch runbook"


def test_extra_keys_forbidden():
    payload = _example_payload()
    payload["surprise"] = 1
    with pytest.raises(ValidationError):
        AdvisoryPayload(**payload)


def test_rationale_required_goal():
    data = {
        "external_key": "ship-v2",
        "target_date": "2026-08-15",
        "priority_rank": 1,
    }
    with pytest.raises(ValidationError):
        GoalAdjustment(**data)


def test_rationale_required_milestone():
    data = {
        "goal_external_key": "ship-v2",
        "title": "Beta cut",
        "target_date": "2026-07-20",
        "done": False,
    }
    with pytest.raises(ValidationError):
        MilestoneAdjustment(**data)


def test_rationale_required_task():
    data = {
        "external_key": "ship-v2-write-runbook",
        "goal_external_key": "ship-v2",
        "title": "Write the launch runbook",
        "priority": "high",
        "estimated_minutes": 90,
    }
    with pytest.raises(ValidationError):
        TaskCreation(**data)


def test_task_creation_has_no_id():
    assert "id" not in TaskCreation.model_fields


def test_milestone_new_title_optional():
    without_new_title = MilestoneAdjustment(
        goal_external_key="ship-v2",
        title="Beta cut",
        rationale="No rename needed.",
    )
    assert without_new_title.new_title is None

    with_new_title = MilestoneAdjustment(
        goal_external_key="ship-v2",
        title="Beta cut",
        new_title="Public beta cut",
        rationale="Renamed for clarity.",
    )
    assert with_new_title.new_title == "Public beta cut"


def test_goal_adjustment_cannot_change_status_title_type():
    data = {
        "external_key": "ship-v2",
        "rationale": "Trying to sneak in a status change.",
        "status": "completed",
    }
    with pytest.raises(ValidationError):
        GoalAdjustment(**data)

    data2 = {
        "external_key": "ship-v2",
        "rationale": "Trying to sneak in a title change.",
        "title": "New Title",
    }
    with pytest.raises(ValidationError):
        GoalAdjustment(**data2)

    data3 = {
        "external_key": "ship-v2",
        "rationale": "Trying to sneak in a type change.",
        "type": "career",
    }
    with pytest.raises(ValidationError):
        GoalAdjustment(**data3)


def test_ingest_backward_compat_no_payload_type():
    payload = {
        "schema_version": "1.0",
        "goals": [],
        "tasks": [],
        "routines": [],
        "habits": [],
    }
    result = IngestPayload(**payload)
    assert result.payload_type == "standard"


def test_ingest_payload_type_standard_explicit():
    payload = {
        "payload_type": "standard",
        "schema_version": "1.0",
        "goals": [],
        "tasks": [],
        "routines": [],
        "habits": [],
    }
    result = IngestPayload(**payload)
    assert result.payload_type == "standard"
