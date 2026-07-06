import enum
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import Priority, RoutineAction
from app.models.goal import GoalType


def _validate_cron(v: str) -> str:
    from apscheduler.triggers.cron import CronTrigger
    try:
        CronTrigger.from_crontab(v)
    except (ValueError, KeyError) as e:
        raise ValueError("Invalid cron expression.") from e
    return v


class MilestoneImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., max_length=255)
    target_date: date | None = None
    done: bool = False


class GoalImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    title: str = Field(..., max_length=255)
    type: GoalType
    description: str | None = Field(None, max_length=2000)
    target_date: date | None = None
    list_name: str | None = Field(None, max_length=100)
    parent_list_name: str | None = Field(None, max_length=100)
    milestones: list[MilestoneImport] = []


class TaskImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    goal_key: str | None = None
    title: str = Field(..., max_length=255)
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    description: str | None = Field(None, max_length=2000)
    list_name: str | None = Field(None, max_length=100)
    parent_list_name: str | None = Field(None, max_length=100)
    estimated_minutes: int | None = None


class RoutineImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    goal_key: str | None = None
    name: str = Field(..., max_length=80)
    cron: str
    action: RoutineAction = RoutineAction.send_daily_brief

    @field_validator("cron")
    @classmethod
    def _validate_cron_field(cls, v: str) -> str:
        return _validate_cron(v)


class HabitImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    goal_key: str | None = None
    title: str = Field(..., max_length=255)
    recurrence_cron: str
    priority: Priority = Priority.medium
    description: str | None = Field(None, max_length=2000)
    list_name: str | None = Field(None, max_length=100)
    parent_list_name: str | None = Field(None, max_length=100)

    @field_validator("recurrence_cron")
    @classmethod
    def _validate_recurrence_cron(cls, v: str) -> str:
        return _validate_cron(v)


class UpdateAction(str, enum.Enum):
    done = "done"
    reschedule = "reschedule"
    drop = "drop"


class IntraDayUpdateImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    update_id: str = Field(..., max_length=200)
    entity_type: Literal["task", "block"]
    entity_id: int
    action: UpdateAction
    reschedule_to: datetime | None = None


class IngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload_type: Literal["standard"] = "standard"
    schema_version: Literal["1.0", "1.1"]
    goals: list[GoalImport] = []
    tasks: list[TaskImport] = []
    routines: list[RoutineImport] = []
    habits: list[HabitImport] = []
    updates: list[IntraDayUpdateImport] = []


class IngestResult(BaseModel):
    created: dict[str, int]
    updated: dict[str, int]


class EntityDiff(BaseModel):
    external_key: str
    title: str
    action: Literal["create", "update"]


class IngestPreviewResult(BaseModel):
    goals: list[EntityDiff] = []
    tasks: list[EntityDiff] = []
    routines: list[EntityDiff] = []
    habits: list[EntityDiff] = []
