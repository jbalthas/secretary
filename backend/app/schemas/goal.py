from datetime import date, datetime
from pydantic import BaseModel
from app.models.goal import GoalType, GoalStatus


class MilestoneCreate(BaseModel):
    title: str
    target_date: date | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = None
    target_date: date | None = None
    done: bool | None = None


class MilestoneRead(BaseModel):
    id: int
    goal_id: int
    title: str
    target_date: date | None
    done: bool

    model_config = {"from_attributes": True}


class GoalCreate(BaseModel):
    title: str
    type: GoalType
    description: str | None = None
    target_date: date | None = None
    external_key: str | None = None
    list_name: str | None = None
    parent_list_name: str | None = None


class GoalUpdate(BaseModel):
    title: str | None = None
    type: GoalType | None = None
    description: str | None = None
    target_date: date | None = None
    status: GoalStatus | None = None
    list_name: str | None = None
    parent_list_name: str | None = None


class GoalRead(BaseModel):
    id: int
    title: str
    type: GoalType
    description: str | None
    target_date: date | None
    status: GoalStatus
    external_key: str | None
    list_name: str | None
    parent_list_name: str | None
    created_at: datetime
    updated_at: datetime
    progress_pct: int
    milestones: list[MilestoneRead] = []

    model_config = {"from_attributes": True}
