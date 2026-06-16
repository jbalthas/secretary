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
    milestones: list[MilestoneImport] = []


class TaskImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    goal_key: str | None = None
    title: str = Field(..., max_length=255)
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    description: str | None = Field(None, max_length=2000)


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

    @field_validator("recurrence_cron")
    @classmethod
    def _validate_recurrence_cron(cls, v: str) -> str:
        return _validate_cron(v)


class IngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"]
    goals: list[GoalImport] = []
    tasks: list[TaskImport] = []
    routines: list[RoutineImport] = []
    habits: list[HabitImport] = []


class IngestResult(BaseModel):
    created: dict[str, int]
    updated: dict[str, int]
