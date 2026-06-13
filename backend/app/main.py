from fastapi import FastAPI
from app.config import settings
from app.routers import tasks

app = FastAPI(title="My Secretary")

app.include_router(tasks.router)


@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok"}
