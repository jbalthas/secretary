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


class TaskUpdate(TaskCreate):
    title: str | None = None
    completed: bool | None = None


class TaskRead(TaskCreate):
    id: int
    completed: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
