from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from app.config import settings
from app.db import get_session
from app.models import AppSettings
from app.schemas.tts import TTSRequest, TTSEnabledRead, TTSEnabledUpdate
from app.services.tts import TTSClient
from app.services import tts_settings as _tts_settings

router = APIRouter(prefix=settings.api_prefix, tags=["tts"])


# --- Ad-hoc TTS (NOTIF-03, D-03: verbatim text) ---
@router.post("/tts", status_code=200)
async def speak_text(body: TTSRequest):
    if not _tts_settings.get_tts_enabled():
        return {"status": "disabled"}
    await run_in_threadpool(TTSClient().speak, body.text)
    return {"status": "ok"}


# --- tts_enabled toggle (D-07) ---
@router.get("/settings/tts", response_model=TTSEnabledRead)
async def get_tts_enabled_route(session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    return TTSEnabledRead(tts_enabled=(cfg.tts_enabled if cfg else True))


@router.put("/settings/tts", response_model=TTSEnabledRead)
async def set_tts_enabled_route(body: TTSEnabledUpdate, session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, tts_enabled=body.tts_enabled)
        session.add(cfg)
    else:
        cfg.tts_enabled = body.tts_enabled
    await session.commit()
    return TTSEnabledRead(tts_enabled=body.tts_enabled)
