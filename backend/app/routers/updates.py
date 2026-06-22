from fastapi import APIRouter
from app.config import settings

router = APIRouter(prefix=f"{settings.api_prefix}/updates", tags=["updates"])
