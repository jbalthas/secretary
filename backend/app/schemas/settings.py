from pydantic import BaseModel, Field


class BriefTimeRead(BaseModel):
    hour: int
    minute: int
    model_config = {"from_attributes": True}


class BriefTimeUpdate(BaseModel):
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
