from datetime import datetime, timezone
from sqlalchemy import create_engine, select, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import google.auth.exceptions
from app.config import settings
from app.models.calendar import CalendarEvent, CalendarSync
from app.services.oauth import credentials_from_json
from app.services.pushover import PushoverClient

_sync_url = settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)


def _today_min_rfc3339() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")


def build_calendar_service(creds):
    return build("calendar", "v3", credentials=creds)


def _parse_event(item: dict) -> dict | None:
    """Return column values dict or None if event is cancelled."""
    if item.get("status") == "cancelled":
        return None
    start = item.get("start", {})
    end = item.get("end", {})
    if "date" in start:
        return {
            "google_id": item["id"],
            "title": item.get("summary") or "(No title)",
            "all_day": True,
            "start_date": start["date"],
            "start_dt": None,
            "end_dt": None,
            "cancelled": False,
        }
    else:
        def _parse_dt(s: str) -> datetime:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))

        return {
            "google_id": item["id"],
            "title": item.get("summary") or "(No title)",
            "all_day": False,
            "start_date": None,
            "start_dt": _parse_dt(start["dateTime"]),
            "end_dt": _parse_dt(end["dateTime"]) if end.get("dateTime") else None,
            "cancelled": False,
        }


def _upsert(session, values: dict) -> None:
    stmt = (
        sqlite_insert(CalendarEvent)
        .values(**values)
        .on_conflict_do_update(index_elements=["google_id"], set_=values)
    )
    session.execute(stmt)


def _full_sync(service, session) -> str:
    page_token = None
    next_sync_token = None
    while True:
        kwargs = {
            "calendarId": "primary",
            "timeMin": _today_min_rfc3339(),
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if page_token:
            kwargs["pageToken"] = page_token
        result = service.events().list(**kwargs).execute()
        for item in result.get("items", []):
            if item.get("status") == "cancelled":
                session.execute(delete(CalendarEvent).where(CalendarEvent.google_id == item["id"]))
            else:
                values = _parse_event(item)
                if values:
                    _upsert(session, values)
        page_token = result.get("nextPageToken")
        if not page_token:
            next_sync_token = result.get("nextSyncToken")
            break
    # Prune cancelled rows
    session.execute(delete(CalendarEvent).where(CalendarEvent.cancelled == True))
    return next_sync_token


def sync_calendar() -> None:
    with _Session() as session:
        sync_row = session.get(CalendarSync, 1)
        if sync_row is None:
            return
        if not sync_row.credentials_json:
            return

        creds = credentials_from_json(sync_row.credentials_json)
        try:
            service = build_calendar_service(creds)
        except Exception:
            return

        try:
            if sync_row.sync_token:
                result = service.events().list(
                    calendarId="primary",
                    syncToken=sync_row.sync_token,
                ).execute()
                for item in result.get("items", []):
                    if item.get("status") == "cancelled":
                        session.execute(
                            delete(CalendarEvent).where(CalendarEvent.google_id == item["id"])
                        )
                    else:
                        values = _parse_event(item)
                        if values:
                            _upsert(session, values)
                next_sync_token = result.get("nextSyncToken")
            else:
                next_sync_token = _full_sync(service, session)

        except HttpError as exc:
            if exc.status_code == 410:
                sync_row.sync_token = None
                session.add(sync_row)
                session.flush()
                next_sync_token = _full_sync(service, session)
            else:
                raise

        except google.auth.exceptions.RefreshError as exc:
            if "invalid_grant" in str(exc):
                PushoverClient().send(
                    title="Calendar sync disconnected",
                    message="Google Calendar token revoked. Please reconnect in the app.",
                )
                sync_row.credentials_json = None
                session.add(sync_row)
                session.commit()
            return

        sync_row.sync_token = next_sync_token
        sync_row.last_synced_at = datetime.now(timezone.utc)
        session.add(sync_row)
        session.commit()
