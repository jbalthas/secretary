from pydantic import BaseModel


class SnapshotResponse(BaseModel):
    created: int
    skipped: int
