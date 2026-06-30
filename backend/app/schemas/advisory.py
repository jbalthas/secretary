from datetime import date, datetime
from typing import Literal

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
