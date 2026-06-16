from datetime import datetime
from pydantic import BaseModel


class CalendarEventOut(BaseModel):
    google_id: str
    title: str
    start_dt: datetime | None = None
    end_dt: datetime | None = None
    all_day: bool
    start_date: str | None = None
    done: bool = False

    model_config = {"from_attributes": True}
