from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.config import settings
from app.schemas.ingest import IngestPayload, IngestResult
from app.services import ingest_service

router = APIRouter(prefix=f"{settings.api_prefix}/ingest", tags=["ingest"])


@router.get("/schema")
async def get_schema():
    return IngestPayload.model_json_schema()


@router.post("/confirm", response_model=IngestResult)
async def confirm(payload: IngestPayload, session: AsyncSession = Depends(get_session)):
    return await ingest_service.apply_import(payload, session)
