from datetime import datetime
from pydantic import BaseModel, field_validator
from app.models import RoutineAction


def _validate_cron(value: str) -> str:
    from apscheduler.triggers.cron import CronTrigger
    try:
        CronTrigger.from_crontab(value)
    except (ValueError, KeyError) as e:
        raise ValueError("Enter a valid cron expression (e.g. 0 8 * * *).") from e
    return value


class RoutineCreate(BaseModel):
    name: str
    cron: str
    action: RoutineAction
    enabled: bool = True

    @field_validator("cron")
    @classmethod
    def _cron(cls, v): return _validate_cron(v)


class RoutineUpdate(BaseModel):
    name: str | None = None
    cron: str | None = None
    action: RoutineAction | None = None
    enabled: bool | None = None

    @field_validator("cron")
    @classmethod
    def _cron(cls, v):
        return _validate_cron(v) if v is not None else v


class RoutineRead(BaseModel):
    id: int
    name: str
    cron: str
    action: RoutineAction
    enabled: bool
    created_at: datetime
    model_config = {"from_attributes": True}
