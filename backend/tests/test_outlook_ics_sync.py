"""Wave 0 RED tests for the Outlook ICS sync contract.

Every test imports `sync_outlook_ics` from `app.services.sync`, which does NOT
exist yet — that is the intended Wave 0 RED state. Plan 02 turns these GREEN.

The fixture ICS is built dynamically (`_make_fixture`) with all events ~1 week
out so every occurrence lands inside the `between(date.today(), today+90d)`
expansion window regardless of the run date.
"""
from datetime import date, datetime, timedelta
from unittest.mock import patch

import httpx
import pytest

from app.models.calendar import CalendarEvent
from app.services.sync import sync_outlook_ics

FEED_URL = "https://feed.test/cal.ics"


def _make_fixture(base: date | None = None, include_timed: bool = True) -> bytes:
    """Build VCALENDAR bytes with dates relative to `base`.

    Default `base` is one week from today so all events fall well inside the
    today+90d expansion window on any run date.

    - timed event (timed-event-001): TZID America/Chicago, base 09:00-10:50
    - all-day event (allday-event-002): VALUE=DATE at base+2 days
    - recurring event (recurring-event-003): base 14:00, WEEKLY COUNT=4 with one
      EXDATE at base+14 days -> exactly 3 in-window occurrences
    """
    if base is None:
        base = date.today() + timedelta(days=7)

    allday = base + timedelta(days=2)
    exdate = base + timedelta(days=14)

    timed_block = ""
    if include_timed:
        timed_block = (
            "BEGIN:VEVENT\n"
            "UID:timed-event-001@university.edu\n"
            "SUMMARY:Lecture\n"
            f"DTSTART;TZID=America/Chicago:{base.strftime('%Y%m%d')}T090000\n"
            f"DTEND;TZID=America/Chicago:{base.strftime('%Y%m%d')}T105000\n"
            "END:VEVENT\n"
        )

    ics = (
        "BEGIN:VCALENDAR\n"
        "VERSION:2.0\n"
        "PRODID:-//University//Calendar//EN\n"
        f"{timed_block}"
        "BEGIN:VEVENT\n"
        "UID:allday-event-002@university.edu\n"
        "SUMMARY:Labor Day\n"
        f"DTSTART;VALUE=DATE:{allday.strftime('%Y%m%d')}\n"
        f"DTEND;VALUE=DATE:{(allday + timedelta(days=1)).strftime('%Y%m%d')}\n"
        "END:VEVENT\n"
        "BEGIN:VEVENT\n"
        "UID:recurring-event-003@university.edu\n"
        "SUMMARY:Weekly Lab\n"
        f"DTSTART;TZID=America/Chicago:{base.strftime('%Y%m%d')}T140000\n"
        f"DTEND;TZID=America/Chicago:{base.strftime('%Y%m%d')}T160000\n"
        "RRULE:FREQ=WEEKLY;COUNT=4\n"
        f"EXDATE;TZID=America/Chicago:{exdate.strftime('%Y%m%d')}T140000\n"
        "END:VEVENT\n"
        "END:VCALENDAR\n"
    )
    return ics.encode("utf-8")


def _run_sync(monkeypatch, fixture: bytes):
    monkeypatch.setattr(
        "app.services.sync.settings.outlook_ics_url", FEED_URL
    )
    with patch("app.services.sync._fetch_ics", return_value=fixture):
        sync_outlook_ics()


def test_timed_event_stored(monkeypatch, fake_sync_session):
    _run_sync(monkeypatch, _make_fixture())
    with fake_sync_session() as s:
        rows = (
            s.query(CalendarEvent)
            .filter(CalendarEvent.google_id.like("outlook:timed-event-001:%"))
            .all()
        )
    assert len(rows) == 1
    row = rows[0]
    assert row.all_day is False
    assert row.start_dt is not None
    assert row.start_dt.tzinfo is not None
    assert row.end_dt is not None
    assert row.start_date is None


def test_allday_event_stored(monkeypatch, fake_sync_session):
    base = date.today() + timedelta(days=7)
    expected_date = (base + timedelta(days=2)).isoformat()
    _run_sync(monkeypatch, _make_fixture(base=base))
    with fake_sync_session() as s:
        rows = (
            s.query(CalendarEvent)
            .filter(CalendarEvent.google_id.like("outlook:allday-event-002:%"))
            .all()
        )
    assert len(rows) == 1
    row = rows[0]
    assert row.all_day is True
    assert row.start_date == expected_date
    assert row.start_dt is None


def test_recurring_event_expanded(monkeypatch, fake_sync_session):
    _run_sync(monkeypatch, _make_fixture())
    with fake_sync_session() as s:
        rows = (
            s.query(CalendarEvent)
            .filter(CalendarEvent.google_id.like("outlook:recurring-event-003:%"))
            .all()
        )
    # 4 weekly occurrences minus 1 EXDATE = 3
    assert len(rows) == 3


def test_deletion_propagation(monkeypatch, fake_sync_session):
    _run_sync(monkeypatch, _make_fixture(include_timed=True))
    with fake_sync_session() as s:
        before = (
            s.query(CalendarEvent)
            .filter(CalendarEvent.google_id.like("outlook:timed-event-001:%"))
            .all()
        )
    assert len(before) == 1

    _run_sync(monkeypatch, _make_fixture(include_timed=False))
    with fake_sync_session() as s:
        after = (
            s.query(CalendarEvent)
            .filter(CalendarEvent.google_id.like("outlook:timed-event-001:%"))
            .all()
        )
    assert len(after) == 0


def test_google_rows_untouched(monkeypatch, fake_sync_session):
    _run_sync(monkeypatch, _make_fixture())
    with fake_sync_session() as s:
        kept = s.get(CalendarEvent, "google_event_keep_1")
    assert kept is not None


def test_noop_when_url_unset(monkeypatch, fake_sync_session):
    monkeypatch.setattr("app.services.sync.settings.outlook_ics_url", "")
    with patch("app.services.sync._fetch_ics") as mock_fetch:
        sync_outlook_ics()
        assert mock_fetch.call_count == 0
    with fake_sync_session() as s:
        rows = (
            s.query(CalendarEvent)
            .filter(CalendarEvent.google_id.like("outlook:%"))
            .all()
        )
    assert len(rows) == 0


def test_fetch_failure_swallowed(monkeypatch, fake_sync_session):
    monkeypatch.setattr(
        "app.services.sync.settings.outlook_ics_url", FEED_URL
    )
    with patch(
        "app.services.sync._fetch_ics",
        side_effect=httpx.RequestError("boom"),
    ):
        # Must NOT raise
        sync_outlook_ics()
    with fake_sync_session() as s:
        rows = (
            s.query(CalendarEvent)
            .filter(CalendarEvent.google_id.like("outlook:%"))
            .all()
        )
    assert len(rows) == 0
