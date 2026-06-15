"""
Tests for NOTIF-03 (TTS endpoint), NOTIF-06 (webhook/brief trigger), and
TTSClient MP3 cache write behavior — Phase 06 Wave 0 RED scaffold.

Patch seams (all plans must honour these targets):
  - TTS router import: app.routers.tts.TTSClient
  - TTS cache dir:     app.services.tts.CACHE_DIR  (Plan 02 must export as module-level Path)
  - Webhook send:      app.services.brief.send_daily_brief (mocked in webhook tests)
  - gTTS boundary:     gtts.gTTS
  - pychromecast:      pychromecast.get_listed_chromecasts

Note: Plan 02 must implement:
  - app/routers/tts.py  with POST /api/v1/tts and TTSClient import
  - app/routers/webhooks.py with POST /api/v1/webhooks/brief
  - app/services/tts.py with TTSClient class and CACHE_DIR Path

Plan 03 must expose get_tts_enabled() in app/services/tts_settings.py.
"""
import hashlib
from unittest.mock import MagicMock, patch

import pytest
from apscheduler.jobstores.memory import MemoryJobStore
from fastapi.testclient import TestClient

from app.main import app
from app.scheduler import scheduler

client = TestClient(app)


@pytest.fixture(autouse=True)
def memory_jobstore():
    scheduler.remove_jobstore("default")
    scheduler.add_jobstore(MemoryJobStore(), "default")
    yield
    for job in scheduler.get_jobs():
        job.remove()


# ---------------------------------------------------------------------------
# NOTIF-03 — TTS endpoint
# ---------------------------------------------------------------------------

def test_tts_endpoint_calls_speak():
    """NOTIF-03: POST /api/v1/tts calls TTSClient.speak with the submitted text.

    Plan 02 must import TTSClient at module top of app/routers/tts.py so that
    patching app.routers.tts.TTSClient replaces the class used at call time.
    """
    with patch("app.routers.tts.TTSClient") as MockTTS:
        mock_instance = MagicMock()
        MockTTS.return_value = mock_instance

        r = client.post("/api/v1/tts", json={"text": "hello world"})

    assert r.status_code in (200, 202)
    mock_instance.speak.assert_called_once_with("hello world")


def test_tts_endpoint_enabled():
    """NOTIF-03: tts_enabled=True (default) → POST /api/v1/tts returns 200/202
    and status is not 'disabled'."""
    with patch("app.routers.tts.TTSClient") as MockTTS:
        MockTTS.return_value = MagicMock()
        r = client.post("/api/v1/tts", json={"text": "hello"})

    assert r.status_code in (200, 202)
    assert r.json().get("status") != "disabled"


def test_tts_endpoint_disabled():
    """NOTIF-03: tts_enabled=False → POST /api/v1/tts returns 200 with
    {"status": "disabled"} and TTSClient.speak is NOT called.

    Plan 03 must expose get_tts_enabled() in app/services/tts_settings.py;
    the router must call it before invoking TTSClient.
    """
    with patch("app.routers.tts.TTSClient") as MockTTS, \
         patch("app.services.tts_settings.get_tts_enabled", return_value=False):
        mock_instance = MagicMock()
        MockTTS.return_value = mock_instance

        r = client.post("/api/v1/tts", json={"text": "hello"})

    assert r.status_code == 200
    assert r.json() == {"status": "disabled"}
    mock_instance.speak.assert_not_called()


# ---------------------------------------------------------------------------
# NOTIF-06 — Webhook /webhooks/brief
# ---------------------------------------------------------------------------

def test_webhook_brief_correct_secret():
    """NOTIF-06: POST /api/v1/webhooks/brief with correct X-Webhook-Secret
    calls send_daily_brief and returns 200.

    Plan 02 must implement POST /api/v1/webhooks/brief guarded by the
    X-Webhook-Secret header, comparing against settings.webhook_secret.
    """
    with patch("app.config.settings") as mock_settings, \
         patch("app.routers.webhooks.send_daily_brief") as mock_send, \
         patch("app.routers.webhooks.settings") as mock_route_settings:
        mock_settings.webhook_secret = "test-secret"
        mock_route_settings.webhook_secret = "test-secret"

        r = client.post(
            "/api/v1/webhooks/brief",
            headers={"X-Webhook-Secret": "test-secret"},
        )

    assert r.status_code == 200
    mock_send.assert_called_once()


def test_webhook_brief_wrong_secret():
    """NOTIF-06: POST /api/v1/webhooks/brief with wrong header → 403.
    send_daily_brief must NOT be called.
    """
    with patch("app.routers.webhooks.settings") as mock_settings, \
         patch("app.routers.webhooks.send_daily_brief") as mock_send:
        mock_settings.webhook_secret = "test-secret"

        r = client.post(
            "/api/v1/webhooks/brief",
            headers={"X-Webhook-Secret": "wrong-secret"},
        )

    assert r.status_code == 403
    mock_send.assert_not_called()


def test_webhook_brief_missing_secret():
    """NOTIF-06: POST /api/v1/webhooks/brief with no X-Webhook-Secret header → 403.
    send_daily_brief must NOT be called.
    """
    with patch("app.routers.webhooks.settings") as mock_settings, \
         patch("app.routers.webhooks.send_daily_brief") as mock_send:
        mock_settings.webhook_secret = "test-secret"

        r = client.post("/api/v1/webhooks/brief")

    assert r.status_code == 403
    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# NOTIF-03 — TTSClient MP3 cache write
# ---------------------------------------------------------------------------

def test_tts_client_caches_mp3(tmp_path):
    """NOTIF-03: TTSClient.speak writes an MP3 to tts_cache/ named
    sha256(text)[:16].mp3 — verified via mocked gTTS + pychromecast.

    Plan 02 must:
      - Export CACHE_DIR as a module-level Path in app/services/tts.py
      - TTSClient.speak must hash the text with SHA-256 and write a file
        named f"{hashlib.sha256(text.encode()).hexdigest()[:16]}.mp3"
      - The file must be created even with pychromecast mocked out
    """
    text = "cache me"
    expected_name = hashlib.sha256(text.encode()).hexdigest()[:16] + ".mp3"

    fake_browser = MagicMock()
    fake_browser.stop_discovery = MagicMock()

    with patch("app.services.tts.CACHE_DIR", tmp_path), \
         patch("gtts.gTTS") as MockGTTS, \
         patch("pychromecast.get_listed_chromecasts", return_value=([], fake_browser)):

        mock_tts_instance = MagicMock()
        MockGTTS.return_value = mock_tts_instance
        mock_tts_instance.save.side_effect = lambda path: open(path, "wb").write(b"fake-mp3")

        from app.services.tts import TTSClient  # noqa: PLC0415
        TTSClient().speak(text)

    assert (tmp_path / expected_name).exists()
