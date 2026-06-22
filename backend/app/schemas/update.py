from pydantic import BaseModel, Field


class UpdateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class UpdateCandidate(BaseModel):
    title: str
    entity_type: str   # "task" | "block"
    entity_id: int
    score: float


class UpdateResponse(BaseModel):
    status: str        # "resolved" | "ambiguous" | "no_match"
    action: str | None = None          # "done" | "reschedule" | "drop"
    entity_type: str | None = None
    entity_id: int | None = None
    entity_title: str | None = None
    score: float | None = None
    candidates: list[UpdateCandidate] = []
