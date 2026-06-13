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

    def fake_post(url, data=None, **kwargs):
        captured["url"] = url
        captured["data"] = data
        return _make_mock_response()

    with patch("app.services.pushover.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post = fake_post
        mock_client_cls.return_value = mock_client

        PushoverClient().send(title="Meeting", message="Bring laptop", priority=1)

    assert captured["url"] == "https://api.pushover.net/1/messages.json"
    assert captured["data"]["title"] == "Meeting"
    assert captured["data"]["message"] == "Bring laptop"
    assert captured["data"]["priority"] == 1
    assert "token" in captured["data"]
    assert "user" in captured["data"]


def test_empty_description(monkeypatch):
    captured = {}

    def fake_post(url, data=None, **kwargs):
        captured["data"] = data
        return _make_mock_response()

    with patch("app.services.pushover.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post = fake_post
        mock_client_cls.return_value = mock_client

        PushoverClient().send(title="Meeting", message="", priority=0)

    assert captured["data"]["message"] == " "


def test_priority_mapping():
    assert _pushover_priority(Priority.high) == 1
    assert _pushover_priority(Priority.medium) == 0
    assert _pushover_priority(Priority.low) == 0
    assert _pushover_priority(None) == 0
