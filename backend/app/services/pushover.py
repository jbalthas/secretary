import httpx
from app.config import settings

PUSHOVER_URL = "https://api.pushover.net/1/messages.json"


class PushoverClient:
    def send(
        self,
        title: str,
        message: str,
        priority: int = 0,
        url: str | None = None,
        url_title: str | None = None,
    ) -> None:
        data = {
            "token": settings.pushover_api_token,
            "user": settings.pushover_user_key,
            "title": title,
            "message": message or " ",
            "priority": priority,
        }
        if url is not None:
            data["url"] = url
        if url_title is not None:
            data["url_title"] = url_title
        with httpx.Client(timeout=10) as client:
            r = client.post(PUSHOVER_URL, data=data)
            r.raise_for_status()
