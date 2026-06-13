from contextlib import asynccontextmanager
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from app.config import settings
from app.routers import tasks, auth, calendar_status, events
from app.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="My Secretary", lifespan=lifespan)

app.add_middleware(SessionMiddleware, secret_key=settings.google_session_secret)

app.include_router(tasks.router)
app.include_router(auth.router)
app.include_router(calendar_status.router)
app.include_router(events.router)


@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok"}
