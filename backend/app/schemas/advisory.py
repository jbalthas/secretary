from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class GoalAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str
    target_date: date | None = None
    priority_rank: int | None = None
    rationale: str


class MilestoneAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal_external_key: str
    title: str
    new_title: str | None = None
    target_date: date | None = None
    done: bool | None = None
    rationale: str


class TaskCreation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str
    goal_external_key: str
    title: str
    description: str | None = None
    due_date: date | None = None
    priority: Literal["high", "medium", "low"] | None = None
    estimated_minutes: int | None = None
    rationale: str


class AdvisoryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload_type: Literal["advisory"] = "advisory"
    session_id: str
    generated_at: datetime
    goal_adjustments: list[GoalAdjustment] = []
    milestone_adjustments: list[MilestoneAdjustment] = []
    new_tasks: list[TaskCreation] = []
    notes: str | None = None


class AdvisoryFieldChange(BaseModel):
    field: str
    old: Any | None = None
    new: Any | None = None


class AdvisoryEntityDiff(BaseModel):
    external_key: str
    title: str
    action: Literal["update", "create"]
    rationale: str
    fields: list[AdvisoryFieldChange] = []


class AdvisoryPreviewResult(BaseModel):
    goals: list[AdvisoryEntityDiff] = []
    milestones: list[AdvisoryEntityDiff] = []
    new_tasks: list[AdvisoryEntityDiff] = []
    notes: str | None = None
    session_id: str
    generated_at: datetime


class AdvisoryResult(BaseModel):
    created: dict[str, int]
    updated: dict[str, int]
    advisory_id: str
    replayed: bool = False


class AdvisoryConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    advisory_id: str
    payload: AdvisoryPayload
