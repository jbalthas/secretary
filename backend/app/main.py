from fastapi import FastAPI
from app.config import settings

app = FastAPI(title="My Secretary")


@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok"}
