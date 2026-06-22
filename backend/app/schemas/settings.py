from pydantic import BaseModel, Field


class BriefTimeRead(BaseModel):
    hour: int
    minute: int
    model_config = {"from_attributes": True}


class BriefTimeUpdate(BaseModel):
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)


class WorkHoursRead(BaseModel):
    work_start: str  # "HH:MM"
    work_end: str  # "HH:MM"
    model_config = {"from_attributes": True}


class WorkHoursUpdate(BaseModel):
    work_start: str = Field(pattern=r"^\d{2}:\d{2}$")
    work_end: str = Field(pattern=r"^\d{2}:\d{2}$")


class StallThresholdRead(BaseModel):
    stall_threshold_days: int
    model_config = {"from_attributes": True}


class StallThresholdUpdate(BaseModel):
    stall_threshold_days: int = Field(ge=1, le=365)


class CheckInTimeRead(BaseModel):
    hour: int
    minute: int
    model_config = {"from_attributes": True}


class CheckInTimeUpdate(BaseModel):
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
