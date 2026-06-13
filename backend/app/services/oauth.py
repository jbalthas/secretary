import json
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from app.config import settings

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


def build_flow() -> Flow:
    client_config = json.loads(settings.google_client_secrets_json)
    return Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=settings.google_oauth_redirect_uri,
    )


def credentials_to_json(creds: Credentials) -> str:
    return creds.to_json()


def credentials_from_json(json_str: str) -> Credentials:
    data = json.loads(json_str)
    return Credentials(
        token=data["token"],
        refresh_token=data.get("refresh_token"),
        token_uri=data["token_uri"],
        client_id=data["client_id"],
        client_secret=data["client_secret"],
        scopes=data["scopes"],
    )
