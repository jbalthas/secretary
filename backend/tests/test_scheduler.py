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
