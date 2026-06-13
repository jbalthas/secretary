from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.calendar import CalendarSync
from app.services.oauth import build_flow, credentials_to_json

router = APIRouter(tags=["auth"])


@router.get("/auth/google", name="google_auth")
async def google_auth(request: Request):
    flow = build_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    request.session["oauth_state"] = state
    return RedirectResponse(auth_url)


@router.get("/auth/google/callback", name="google_callback")
async def google_callback(
    code: str,
    state: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    stored_state = request.session.get("oauth_state")
    if stored_state is not None and state != stored_state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    flow = build_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    row = await session.get(CalendarSync, 1)
    if row is None:
        row = CalendarSync(id=1)
        session.add(row)

    row.credentials_json = credentials_to_json(creds)
    row.sync_token = None

    await session.commit()

    return {"connected": True, "redirect": "/settings?connected=true"}
