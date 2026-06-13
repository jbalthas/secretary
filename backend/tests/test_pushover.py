import types
import pytest
from unittest.mock import MagicMock, patch

from app.services.pushover import PushoverClient
from app.scheduler import _pushover_priority
from app.models import Priority


def _make_mock_response():
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    return resp


def test_send_payload(monkeypatch):
    captured = {}

    def fake_post(self, url, **kwargs):
        captured["url"] = url
        captured["data"] = kwargs.get("data", {})
        return _make_mock_response()

    monkeypatch.setattr("httpx.Client.post", fake_post)

    PushoverClient().send(title="Meeting", message="Bring laptop", priority=1)

    assert captured["url"] == "https://api.pushover.net/1/messages.json"
    assert captured["data"]["title"] == "Meeting"
    assert captured["data"]["message"] == "Bring laptop"
    assert captured["data"]["priority"] == 1
    assert "token" in captured["data"]
    assert "user" in captured["data"]


def test_empty_description(monkeypatch):
    captured = {}

    def fake_post(self, url, **kwargs):
        captured["data"] = kwargs.get("data", {})
        return _make_mock_response()

    monkeypatch.setattr("httpx.Client.post", fake_post)

    PushoverClient().send(title="Meeting", message="", priority=0)

    assert captured["data"]["message"] == " "


def test_priority_mapping():
    assert _pushover_priority(Priority.high) == 1
    assert _pushover_priority(Priority.medium) == 0
    assert _pushover_priority(Priority.low) == 0
    assert _pushover_priority(None) == 0
