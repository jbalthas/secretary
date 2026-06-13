import types
from datetime import datetime, timezone

import pytest
from apscheduler.jobstores.memory import MemoryJobStore

from app.scheduler import scheduler, upsert_reminder, remove_reminder
from app.models import Priority


def _reset_jobstore():
    scheduler.add_jobstore(MemoryJobStore(), "default", replace_existing=True)


def _fake_task(reminder_at=datetime(2030, 1, 1, tzinfo=timezone.utc)):
    return types.SimpleNamespace(
        id=1,
        title="Test Task",
        description=None,
        priority=Priority.high,
        reminder_at=reminder_at,
    )


def test_upsert_creates_job():
    _reset_jobstore()
    upsert_reminder(_fake_task())
    assert scheduler.get_job("reminder_task_1") is not None


def test_null_reminder_removes_job():
    _reset_jobstore()
    upsert_reminder(_fake_task())
    assert scheduler.get_job("reminder_task_1") is not None
    upsert_reminder(_fake_task(reminder_at=None))
    assert scheduler.get_job("reminder_task_1") is None


def test_remove_reminder():
    _reset_jobstore()
    upsert_reminder(_fake_task())
    remove_reminder(1)
    assert scheduler.get_job("reminder_task_1") is None


def test_remove_missing_job_no_error():
    _reset_jobstore()
    try:
        remove_reminder(999)
    except Exception as e:
        pytest.fail(f"remove_reminder raised unexpectedly: {e}")
