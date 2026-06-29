from pydantic import BaseModel


class SnapshotResponse(BaseModel):
    created: int
    skipped: int


class BundleResponse(BaseModel):
    markdown: str
    session_id: str
    generated_at: str
