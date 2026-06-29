from fastapi import APIRouter

from app.config import settings
from app.schemas.export import SnapshotResponse
from app.services import snapshot_service

router = APIRouter(prefix=f"{settings.api_prefix}/export", tags=["export"])


@router.post("/snapshot")
def trigger_snapshot() -> SnapshotResponse:
    return SnapshotResponse(**snapshot_service.take_progress_snapshot())
