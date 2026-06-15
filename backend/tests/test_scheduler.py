import types
from datetime import datetime, timezone
import pytest
from apscheduler.jobstores.memory import MemoryJobStore
from app.scheduler import scheduler, upsert_reminder, remove_reminder
from app.models import Priority


def _fake_task(reminder_at=datetime(2030, 1, 1, tzinfo=timezone.utc)):
    return types.SimpleNamespace(
        id=1,
        title="Test Task",
        description=None,
        priority=Priority.high,
        reminder_at=reminder_at,
    )


@pytest.fixture(autouse=True)
def memory_jobstore():
    scheduler.remove_jobstore("default")
    scheduler.add_jobstore(MemoryJobStore(), "default")
    yield
    for job in scheduler.get_jobs():
        job.remove()


def test_upsert_creates_job():
    upsert_reminder(_fake_task())
    assert scheduler.get_job("reminder_task_1") is not None


def test_null_reminder_removes_job():
    upsert_reminder(_fake_task())
    upsert_reminder(_fake_task(reminder_at=None))
    assert scheduler.get_job("reminder_task_1") is None


def test_remove_reminder():
    upsert_reminder(_fake_task())
    remove_reminder(1)
    assert scheduler.get_job("reminder_task_1") is None


def test_remove_missing_job_no_error():
    try:
        remove_reminder(999)
    except Exception as e:
        pytest.fail(f"remove_reminder raised unexpectedly: {e}")


# ---------------------------------------------------------------------------
# NOTIF-04 — _send_reminder TTS integration (Phase 06 Wave 0 RED)
# ---------------------------------------------------------------------------

def test_reminder_calls_tts():
    """NOTIF-04: _send_reminder calls TTSClient.speak with "Reminder: {title}".

    Plan 03 must:
      - Import TTSClient at module top of app/scheduler.py:
            from app.services.tts import TTSClient
        (module-top import keeps the patch target stable as app.scheduler.TTSClient)
      - Expose get_tts_enabled() in app/services/tts_settings.py so this
        test can patch app.services.tts_settings.get_tts_enabled → True
      - Call speak BEFORE or AFTER Pushover (both are acceptable)
    """
    from app.scheduler import _send_reminder  # noqa: PLC0415

    with patch("app.scheduler.TTSClient") as MockTTS, \
         patch("app.services.tts_settings.get_tts_enabled", return_value=True), \
         patch("app.scheduler.PushoverClient"):
        mock_instance = MagicMock()
        MockTTS.return_value = mock_instance

        _send_reminder(title="Buy milk", body="", priority=0)

    mock_instance.speak.assert_called_once_with("Reminder: Buy milk")


def test_reminder_tts_failure_swallowed():
    """NOTIF-04: If TTSClient.speak raises, _send_reminder must NOT raise,
    and Pushover send must still be attempted.

    Plan 03 must wrap the TTSClient.speak call in a try/except Exception.
    """
    from app.scheduler import _send_reminder  # noqa: PLC0415

    with patch("app.scheduler.TTSClient") as MockTTS, \
         patch("app.services.tts_settings.get_tts_enabled", return_value=True), \
         patch("app.scheduler.PushoverClient") as MockPushover:
        mock_tts_instance = MagicMock()
        mock_tts_instance.speak.side_effect = RuntimeError("cast failed")
        MockTTS.return_value = mock_tts_instance

        mock_pushover_instance = MagicMock()
        MockPushover.return_value = mock_pushover_instance

        try:
            _send_reminder(title="Buy milk", body="", priority=0)
        except Exception as exc:
            pytest.fail(f"_send_reminder raised unexpectedly: {exc}")

    mock_pushover_instance.send.assert_called_once()


def test_reminder_tts_respects_flag():
    """NOTIF-04: tts_enabled=False → TTSClient.speak NOT called; Pushover still called.

    Plan 03 must check get_tts_enabled() before calling speak.
    """
    from app.scheduler import _send_reminder  # noqa: PLC0415

    with patch("app.scheduler.TTSClient") as MockTTS, \
         patch("app.services.tts_settings.get_tts_enabled", return_value=False), \
         patch("app.scheduler.PushoverClient") as MockPushover:
        mock_tts_instance = MagicMock()
        MockTTS.return_value = mock_tts_instance

        mock_pushover_instance = MagicMock()
        MockPushover.return_value = mock_pushover_instance

        _send_reminder(title="Buy milk", body="", priority=0)

    mock_tts_instance.speak.assert_not_called()
    mock_pushover_instance.send.assert_called_once()
