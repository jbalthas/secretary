from fastapi import APIRouter

from app.config import settings
from app.schemas.export import SnapshotResponse, BundleResponse
from app.services import snapshot_service, export_service

router = APIRouter(prefix=f"{settings.api_prefix}/export", tags=["export"])


@router.post("/snapshot")
def trigger_snapshot() -> SnapshotResponse:
    return SnapshotResponse(**snapshot_service.take_progress_snapshot())


@router.get("/bundle")
def get_export_bundle() -> BundleResponse:
    return BundleResponse(**export_service.build_export_bundle())
