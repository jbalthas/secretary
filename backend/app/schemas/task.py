from datetime import datetime
from pydantic import BaseModel
from app.models import Priority


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: Priority = Priority.medium
    due_date: datetime | None = None
    reminder_at: datetime | None = None
    recurrence_cron: str | None = None
    estimated_minutes: int | None = None
    goal_id: int | None = None
    list_name: str | None = None
    parent_list_name: str | None = None


class TaskUpdate(TaskCreate):
    title: str | None = None
    completed: bool | None = None


class TaskRead(TaskCreate):
    id: int
    completed: bool
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    is_habit: bool
    goal_id: int | None = None
    external_key: str | None = None

    model_config = {"from_attributes": True}
