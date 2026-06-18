import logging
from datetime import datetime, timezone, date, timedelta
from sqlalchemy import create_engine, select, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import google.auth.exceptions
from icalendar import Calendar
import recurring_ical_events
import httpx
from app.config import settings
from app.models.calendar import CalendarEvent, CalendarSync
from app.services.oauth import credentials_from_json
from app.services.pushover import PushoverClient

_sync_url = settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)

_log = logging.getLogger(__name__)
_OUTLOOK_UA = "Mozilla/5.0 (Linux) Chrome/139"
_OUTLOOK_WINDOW_DAYS = 90


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
    # No timeMin — required to get nextSyncToken from Google.
    # Past events are pruned after insert instead.
    page_token = None
    next_sync_token = None
    today = _today_min_rfc3339()
    while True:
        kwargs = {"calendarId": "primary", "singleEvents": True}
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
    # Prune past and cancelled events
    session.execute(delete(CalendarEvent).where(CalendarEvent.cancelled == True))
    session.execute(
        delete(CalendarEvent).where(
            CalendarEvent.all_day == True,
            CalendarEvent.start_date < today[:10],
        )
    )
    session.execute(
        delete(CalendarEvent).where(
            CalendarEvent.all_day == False,
            CalendarEvent.start_dt < today,
        )
    )
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


def _fetch_ics(url: str) -> bytes:
    with httpx.Client(follow_redirects=True, timeout=15) as client:
        resp = client.get(url, headers={"User-Agent": _OUTLOOK_UA})
        resp.raise_for_status()
        return resp.content


def _expand_ics(raw: bytes) -> list:
    cal = Calendar.from_ical(raw)
    today = date.today()
    end = today + timedelta(days=_OUTLOOK_WINDOW_DAYS)
    return recurring_ical_events.of(cal).between(today, end)


def _parse_ics_component(component) -> dict | None:
    dtstart = component.get("DTSTART")
    uid = str(component.get("UID", "")).split("@", 1)[0]
    if dtstart is None or not uid:
        return None
    dt = dtstart.dt
    title = str(component.get("SUMMARY", "(No title)")).strip() or "(No title)"
    if isinstance(dt, datetime):                       # timed event
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)       # floating → UTC
        start_dt = dt.astimezone(timezone.utc)
        google_id = f"outlook:{uid}:{start_dt.strftime('%Y%m%dT%H%M%S')}"
        dtend = component.get("DTEND")
        end_dt = None
        if dtend is not None and isinstance(dtend.dt, datetime):
            et = dtend.dt
            if et.tzinfo is None:
                et = et.replace(tzinfo=timezone.utc)
            end_dt = et.astimezone(timezone.utc)
        return {"google_id": google_id, "title": title, "all_day": False,
                "start_date": None, "start_dt": start_dt, "end_dt": end_dt,
                "cancelled": False}
    else:                                              # all-day (datetime.date)
        google_id = f"outlook:{uid}:{dt.strftime('%Y%m%d')}"
        return {"google_id": google_id, "title": title, "all_day": True,
                "start_date": dt.isoformat(), "start_dt": None, "end_dt": None,
                "cancelled": False}


def _replace_sync(components: list) -> None:
    values_by_id = {}
    for component in components:
        values = _parse_ics_component(component)
        if values:
            values_by_id[values["google_id"]] = values

    with _Session() as session:
        stale_rows = CalendarEvent.google_id.like("outlook:%")
        if values_by_id:
            stale_rows = stale_rows & CalendarEvent.google_id.not_in(values_by_id)
        session.execute(delete(CalendarEvent).where(stale_rows))
        for values in values_by_id.values():
            _upsert(session, values)
        session.commit()


def sync_outlook_ics() -> None:
    """Fetch, parse, recurrence-expand, and replace-sync the Outlook ICS feed.
    Best-effort: all errors logged and swallowed. No-op when url unset."""
    if not settings.outlook_ics_url:
        return
    try:
        raw = _fetch_ics(settings.outlook_ics_url)
        events = _expand_ics(raw)
        _replace_sync(events)
    except Exception:
        _log.warning("Outlook ICS sync failed", exc_info=True)
