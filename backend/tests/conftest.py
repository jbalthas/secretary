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
