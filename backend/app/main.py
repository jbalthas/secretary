from contextlib import asynccontextmanager
from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool
from starlette.middleware.sessions import SessionMiddleware
from app.config import settings
from fastapi.staticfiles import StaticFiles
from app.routers import tasks, auth, calendar_status, events, settings as settings_router, routines, tts, webhooks, goals
from app.services.tts import CACHE_DIR
from app.scheduler import scheduler, schedule_calendar_sync, schedule_daily_brief, schedule_outlook_ics_sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    schedule_calendar_sync()
    schedule_outlook_ics_sync()
    try:
        from app.services.sync import sync_calendar
        await run_in_threadpool(sync_calendar)
    except Exception:
        pass
    try:
        from app.services.sync import sync_outlook_ics
        await run_in_threadpool(sync_outlook_ics)
    except Exception:
        pass
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.config import settings as cfg_settings
        from app.models import AppSettings
        _url = cfg_settings.database_url.replace("+aiosqlite", "")
        _eng = create_engine(_url)
        with sessionmaker(_eng)() as s:
            row = s.get(AppSettings, 1)
        hour = row.brief_hour if row else 8
        minute = row.brief_minute if row else 0
        schedule_daily_brief(hour, minute)
        _eng.dispose()
    except Exception:
        schedule_daily_brief(8, 0)
    yield
    scheduler.shutdown()


app = FastAPI(title="My Secretary", lifespan=lifespan)

app.add_middleware(SessionMiddleware, secret_key=settings.google_session_secret)

app.include_router(tasks.router)
app.include_router(auth.router)
app.include_router(calendar_status.router)
app.include_router(events.router)
app.include_router(settings_router.router)
app.include_router(routines.router)
app.include_router(tts.router)
app.include_router(webhooks.router)
app.include_router(goals.router)

CACHE_DIR.mkdir(exist_ok=True)
app.mount("/tts-audio", StaticFiles(directory=CACHE_DIR), name="tts-audio")


@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok"}
