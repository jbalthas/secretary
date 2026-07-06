from datetime import date, datetime

from pydantic import BaseModel


class ProposedBlock(BaseModel):
    task_id: int | None = None
    title: str
    start_dt: datetime
    end_dt: datetime


class ProposedDayPlan(BaseModel):
    date: date
    blocks: list[ProposedBlock]
    unplaced_task_ids: list[int]
    fully_booked: bool


class ApproveRequest(BaseModel):
    date: date
    blocks: list[ProposedBlock]


class ScheduledBlockRead(BaseModel):
    id: int
    task_id: int | None
    title: str
    start_dt: datetime
    end_dt: datetime
    date_key: str
    approved_at: datetime
    completed: bool
    conflict_with: str | None = None
    model_config = {"from_attributes": True}


class ScheduledBlockUpdate(BaseModel):
    completed: bool
