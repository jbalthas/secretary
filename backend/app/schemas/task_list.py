from pydantic import BaseModel, Field


class TaskListGroupRead(BaseModel):
    name: str
    children: list[str] = Field(default_factory=list)
