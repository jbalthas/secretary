from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.config import settings
from app.routers import tasks
from app.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="My Secretary", lifespan=lifespan)

app.include_router(tasks.router)


@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok"}
