import asyncio
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db import Base
from app.main import app
from app import db as app_db

TEST_DB_URL = "sqlite+aiosqlite:///./test_secretary.db"


@pytest.fixture(scope="session", autouse=True)
def create_test_db():
    engine = create_async_engine(TEST_DB_URL, echo=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_setup())

    original_engine = app_db.engine
    original_session = app_db.SessionLocal

    app_db.engine = engine
    app_db.SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    yield

    app_db.engine = original_engine
    app_db.SessionLocal = original_session

    async def _teardown():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    asyncio.get_event_loop_policy().get_event_loop().run_until_complete(_teardown())


@pytest.fixture
def fake_credentials_json():
    import json
    from unittest.mock import patch
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    creds = json.dumps({
        "token": "ya29.fake-access-token",
        "refresh_token": "1//fake-refresh-token",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "fake-client-id.apps.googleusercontent.com",
        "client_secret": "fake-client-secret",
        "scopes": ["https://www.googleapis.com/auth/calendar.readonly"],
    })

    # Set up a sync session on the same test DB so sync_calendar can read credentials
    sync_test_url = TEST_DB_URL.replace("+aiosqlite", "")
    sync_engine = create_engine(sync_test_url)
    Base.metadata.create_all(sync_engine)
    TestSyncSession = sessionmaker(sync_engine)

    from app.models.calendar import CalendarSync
    with TestSyncSession() as s:
        row = s.get(CalendarSync, 1)
        if row is None:
            row = CalendarSync(id=1, credentials_json=creds, sync_token=None)
            s.add(row)
        else:
            row.credentials_json = creds
            row.sync_token = None
        s.commit()

    with patch("app.services.sync._Session", TestSyncSession):
        yield creds

    # Clean up CalendarSync row after test
    with TestSyncSession() as s:
        row = s.get(CalendarSync, 1)
        if row:
            s.delete(row)
            s.commit()
    sync_engine.dispose()


def make_google_event(
    event_id="evt1",
    summary="Test Event",
    status="confirmed",
    start_dt="2026-06-12T09:00:00Z",
    end_dt="2026-06-12T10:00:00Z",
    all_day_date=None,
):
    if all_day_date:
        return {
            "id": event_id,
            "status": status,
            "summary": summary,
            "start": {"date": all_day_date},
            "end": {"date": all_day_date},
        }
    return {
        "id": event_id,
        "status": status,
        "summary": summary,
        "start": {"dateTime": start_dt},
        "end": {"dateTime": end_dt},
    }
