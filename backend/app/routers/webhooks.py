import hmac
from typing import Literal
from fastapi import APIRouter, Header, HTTPException, Query
from starlette.concurrency import run_in_threadpool
from app.config import settings
from app.services.brief import send_daily_brief, send_weekly_brief

router = APIRouter(prefix=settings.api_prefix, tags=["webhooks"])


def _verify_secret(provided: str) -> None:
    """Constant-time secret comparison; raises 403 on mismatch or missing."""
    if not settings.webhook_secret or not hmac.compare_digest(provided, settings.webhook_secret):
        raise HTTPException(status_code=403, detail="Forbidden")


# --- Secret-guarded brief webhook (NOTIF-06, D-10) ---
@router.post("/webhooks/brief")
async def trigger_brief(
    range: Literal["day", "week"] = Query(default="day"),
    x_webhook_secret: str = Header(default=""),
):
    _verify_secret(x_webhook_secret)
    if range == "week":
        await run_in_threadpool(send_weekly_brief)
    else:
        await run_in_threadpool(send_daily_brief)
    return {"status": "ok"}
