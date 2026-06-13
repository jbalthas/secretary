import hashlib
import base64
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.calendar import CalendarSync
from app.services.oauth import build_flow, credentials_to_json

router = APIRouter(tags=["auth"])


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


@router.get("/auth/google", name="google_auth")
async def google_auth(request: Request):
    flow = build_flow()
    verifier, challenge = _pkce_pair()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
        code_challenge=challenge,
        code_challenge_method="S256",
    )
    request.session["oauth_state"] = state
    request.session["pkce_verifier"] = verifier
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

    verifier = request.session.get("pkce_verifier")
    flow = build_flow()
    flow.fetch_token(code=code, code_verifier=verifier)
    creds = flow.credentials

    row = await session.get(CalendarSync, 1)
    if row is None:
        row = CalendarSync(id=1)
        session.add(row)

    row.credentials_json = credentials_to_json(creds)
    row.sync_token = None

    await session.commit()

    return {"connected": True, "redirect": "/settings?connected=true"}
