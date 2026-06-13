"""Wave 0 failing tests for Phase 4 calendar sync.

These tests define the contract that Plans 02/03/04 will implement.
They MUST fail (RED) at Wave 0 because the referenced modules do not exist yet.
"""
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import make_google_event

client = TestClient(app)


# ---------------------------------------------------------------------------
# CAL-01: OAuth flow
# ---------------------------------------------------------------------------

def test_auth_redirect():
    """GET /auth/google returns redirect to Google OAuth consent page."""
    with patch("app.routers.auth.build_flow") as mock_build_flow:
        mock_flow = MagicMock()
        mock_flow.authorization_url.return_value = (
            "https://accounts.google.com/o/oauth2/auth?prompt=consent&access_type=offline",
            "fake-state",
        )
        mock_build_flow.return_value = mock_flow

        r = client.get("/auth/google", follow_redirects=False)

    assert r.status_code in (302, 307)
    location = r.headers.get("location", "")
    assert "accounts.google.com" in location
    assert "prompt=consent" in location


def test_callback_stores_credentials(fake_credentials_json):
    """GET /auth/google/callback exchanges code and stores credentials_json in DB."""
    with patch("app.routers.auth.build_flow") as mock_build_flow:
        mock_flow = MagicMock()
        mock_flow.credentials.to_json.return_value = fake_credentials_json
        mock_build_flow.return_value = mock_flow

        r = client.get("/auth/google/callback", params={"code": "fake-code", "state": "fake-state"})

    # After callback, CalendarSync row should have credentials_json set
    assert r.status_code in (200, 302, 307)


# ---------------------------------------------------------------------------
# CAL-02: Incremental sync
# ---------------------------------------------------------------------------

def test_incremental_sync(fake_credentials_json):
    """sync_calendar upserts timed + all-day events, removes cancelled, stores nextSyncToken."""
    from app.services.sync import sync_calendar  # noqa: imported here — does not exist yet

    timed = make_google_event("evt_timed", "Morning standup", start_dt="2026-06-12T09:00:00Z", end_dt="2026-06-12T09:30:00Z")
    all_day = make_google_event("evt_allday", "Company holiday", all_day_date="2026-06-12")
    cancelled = make_google_event("evt_cancelled", "Cancelled meeting", status="cancelled")

    mock_service = MagicMock()
    mock_service.events.return_value.list.return_value.execute.return_value = {
        "items": [timed, all_day, cancelled],
        "nextSyncToken": "token-abc123",
    }

    with patch("app.services.sync.build_calendar_service", return_value=mock_service):
        sync_calendar()

    # Verify timed and all-day events are stored; cancelled is marked/removed
    # Verify nextSyncToken is persisted
    # (assertions over DB state left for Plan 03 to fill in fully)


# ---------------------------------------------------------------------------
# CAL-03: 410 fallback to full re-sync
# ---------------------------------------------------------------------------

def test_full_resync_on_410(fake_credentials_json):
    """When Google returns HTTP 410, sync_calendar clears sync_token and does full sync."""
    from app.services.sync import sync_calendar  # noqa
    from googleapiclient.errors import HttpError

    http_410 = HttpError(resp=MagicMock(status=410), content=b"Gone")

    mock_service = MagicMock()
    call_count = [0]

    def side_effect():
        call_count[0] += 1
        if call_count[0] == 1:
            raise http_410
        return {
            "items": [make_google_event("evt1", "Meeting")],
            "nextSyncToken": "fresh-token",
        }

    mock_service.events.return_value.list.return_value.execute.side_effect = side_effect

    with patch("app.services.sync.build_calendar_service", return_value=mock_service):
        # Should not raise — 410 is handled internally
        sync_calendar()

    # sync_token should be repopulated after full re-sync
    assert call_count[0] >= 2


# ---------------------------------------------------------------------------
# CAL-04: Pushover alert on invalid_grant
# ---------------------------------------------------------------------------

def test_pushover_on_invalid_grant(monkeypatch, fake_credentials_json):
    """When Google refresh raises invalid_grant, PushoverClient.send is called once."""
    from app.services.sync import sync_calendar  # noqa
    import google.auth.exceptions

    sent_calls = []

    class FakePushover:
        def send(self, message, title=None):
            sent_calls.append({"message": message, "title": title})

    monkeypatch.setattr("app.services.sync.PushoverClient", lambda: FakePushover())

    mock_service = MagicMock()
    mock_service.events.return_value.list.return_value.execute.side_effect = (
        google.auth.exceptions.RefreshError("invalid_grant: Token has been expired or revoked.")
    )

    with patch("app.services.sync.build_calendar_service", return_value=mock_service):
        sync_calendar()

    assert len(sent_calls) == 1


# ---------------------------------------------------------------------------
# CAL-02 + agenda endpoint
# ---------------------------------------------------------------------------

def test_events_today():
    """GET /api/v1/events/today returns only today's non-cancelled events as CalendarEventOut."""
    r = client.get("/api/v1/events/today")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Each item must have the CalendarEventOut shape
    for item in data:
        assert "google_id" in item
        assert "title" in item
        assert "all_day" in item
