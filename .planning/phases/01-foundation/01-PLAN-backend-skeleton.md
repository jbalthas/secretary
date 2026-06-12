---
plan: 01-01
phase: 1
wave: 1
title: FastAPI backend skeleton + SQLite/Alembic/WAL
depends_on: []
requirements: [INFRA-02, INFRA-06]
files_modified:
  - backend/pyproject.toml
  - backend/app/__init__.py
  - backend/app/main.py
  - backend/app/config.py
  - backend/app/db.py
  - backend/app/models/__init__.py
  - backend/alembic.ini
  - backend/migrations/env.py
  - backend/migrations/script.py.mako
  - backend/.env.example
  - backend/tests/test_health.py
autonomous: true
---

## Objective
Build the FastAPI backend skeleton with a working `GET /api/v1/health` endpoint, an async SQLAlchemy 2.0 engine bound to SQLite with WAL mode enabled at startup, and Alembic wired for migrations. This is the runtime core of the whole system and is fully buildable/testable on the dev machine with no Pi dependency. Every later plan (systemd, nginx, bootstrap) targets this service.

## must_haves
- `GET /api/v1/health` returns `{"status": "ok"}` with HTTP 200 when uvicorn is running.
- SQLite connection sets `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` on every connection.
- Async engine uses `create_async_engine` with `aiosqlite` driver and `AsyncSession`.
- Alembic is initialized: `alembic upgrade head` runs without error against a fresh DB.
- A pytest covers the health endpoint and passes.

## Tasks

<task id="01-01-T1" title="Project scaffolding, dependencies, config">
  <read_first>
  - C:\Projects\My Secretary\CLAUDE.md — locked stack versions (FastAPI 0.128.x, SQLAlchemy 2.0.x, aiosqlite 0.20.x, Alembic 1.13.x, uv as env manager) and conventions (single uvicorn worker, WAL + busy_timeout=5000)
  </read_first>

  <action>
  Create `backend/pyproject.toml` configured for uv, project name `my-secretary`, requires-python `>=3.12`. Dependencies:
  - `fastapi[standard]>=0.128,<0.129`
  - `sqlalchemy[asyncio]>=2.0,<2.1`
  - `aiosqlite>=0.20,<0.21`
  - `alembic>=1.13,<1.14`
  - `pydantic-settings>=2.0`
  Dev dependencies (`[dependency-groups]` or `[project.optional-dependencies] dev`): `pytest>=8`, `httpx>=0.27`, `pytest-asyncio>=0.23`, `anyio`.

  Create `backend/app/__init__.py` (empty) and `backend/app/models/__init__.py` (empty package marker).

  Create `backend/app/config.py` using `pydantic_settings.BaseSettings`:
  ```python
  from pydantic_settings import BaseSettings, SettingsConfigDict

  class Settings(BaseSettings):
      model_config = SettingsConfigDict(env_file=".env", extra="ignore")
      database_url: str = "sqlite+aiosqlite:///./secretary.db"
      api_prefix: str = "/api/v1"

  settings = Settings()
  ```

  Create `backend/.env.example`:
  ```
  DATABASE_URL=sqlite+aiosqlite:///./secretary.db
  ```
  </action>

  <acceptance_criteria>
  - [ ] `backend/pyproject.toml` contains `requires-python = ">=3.12"`
  - [ ] grep `backend/pyproject.toml` shows `fastapi[standard]`, `sqlalchemy[asyncio]`, `aiosqlite`, `alembic`
  - [ ] `backend/app/config.py` contains `class Settings(BaseSettings)` and `database_url`
  - [ ] `cd backend; uv sync` exits 0
  - [ ] `backend/.env.example` exists and contains `DATABASE_URL=sqlite+aiosqlite`
  </acceptance_criteria>
</task>

<task id="01-01-T2" title="Async DB engine with WAL + health endpoint">
  <read_first>
  - C:\Projects\My Secretary\backend\app\config.py — settings.database_url and api_prefix (created in T1)
  - C:\Projects\My Secretary\CLAUDE.md — decisions: WAL mode + busy_timeout=5000 set at SQLite startup; single uvicorn worker
  </read_first>

  <action>
  Create `backend/app/db.py` with the async engine, session factory, declarative Base, and a PRAGMA event listener:
  ```python
  from sqlalchemy import event
  from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
  from sqlalchemy.orm import DeclarativeBase
  from app.config import settings

  engine = create_async_engine(settings.database_url, echo=False)

  @event.listens_for(engine.sync_engine, "connect")
  def _set_sqlite_pragmas(dbapi_conn, _):
      cur = dbapi_conn.cursor()
      cur.execute("PRAGMA journal_mode=WAL")
      cur.execute("PRAGMA busy_timeout=5000")
      cur.close()

  SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

  class Base(DeclarativeBase):
      pass

  async def get_session() -> AsyncSession:
      async with SessionLocal() as session:
          yield session
  ```

  Create `backend/app/main.py`:
  ```python
  from fastapi import FastAPI
  from app.config import settings

  app = FastAPI(title="My Secretary")

  @app.get(f"{settings.api_prefix}/health")
  async def health():
      return {"status": "ok"}
  ```
  The health endpoint MUST resolve to `/api/v1/health`.
  </action>

  <acceptance_criteria>
  - [ ] `backend/app/db.py` contains `create_async_engine` and `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`
  - [ ] `backend/app/db.py` contains `async_sessionmaker` and `class Base(DeclarativeBase)`
  - [ ] `backend/app/main.py` registers a route resolving to `/api/v1/health` returning `{"status": "ok"}`
  - [ ] `cd backend; uv run uvicorn app.main:app` starts, and `curl http://localhost:8000/api/v1/health` returns `{"status":"ok"}` with HTTP 200
  </acceptance_criteria>
</task>

<task id="01-01-T3" title="Alembic migrations + health test">
  <read_first>
  - C:\Projects\My Secretary\backend\app\db.py — Base metadata and engine URL (created in T2)
  - C:\Projects\My Secretary\backend\app\config.py — database_url
  </read_first>

  <action>
  Run `cd backend; uv run alembic init migrations` to scaffold, then edit:

  `backend/alembic.ini` — leave `sqlalchemy.url` empty (set in env.py from settings).

  `backend/migrations/env.py` — make it use the SYNC sqlite URL for migrations (Alembic offline/online does not need async). Derive a sync URL by stripping `+aiosqlite` from `settings.database_url`. Set `target_metadata = Base.metadata`:
  ```python
  from app.config import settings
  from app.db import Base
  config.set_main_option("sqlalchemy.url", settings.database_url.replace("+aiosqlite", ""))
  target_metadata = Base.metadata
  ```
  Ensure `app` is importable (run alembic from `backend/` so `app` is on path).

  Generate an initial empty migration so the chain exists:
  `cd backend; uv run alembic revision -m "init"` (an empty upgrade is fine — no models yet).

  Create `backend/tests/test_health.py`:
  ```python
  from fastapi.testclient import TestClient
  from app.main import app

  def test_health():
      client = TestClient(app)
      r = client.get("/api/v1/health")
      assert r.status_code == 200
      assert r.json() == {"status": "ok"}
  ```
  </action>

  <acceptance_criteria>
  - [ ] `backend/migrations/env.py` contains `target_metadata = Base.metadata`
  - [ ] `backend/migrations/env.py` strips `+aiosqlite` for the migration URL (grep `replace("+aiosqlite"`)
  - [ ] `cd backend; uv run alembic upgrade head` exits 0 against a fresh DB
  - [ ] at least one file exists under `backend/migrations/versions/`
  - [ ] `cd backend; uv run pytest tests/test_health.py` exits 0
  </acceptance_criteria>
</task>

## Verification
From `backend/`: `uv sync` succeeds, `uv run alembic upgrade head` exits 0, `uv run pytest` passes, and a running uvicorn instance returns `{"status":"ok"}` at `http://localhost:8000/api/v1/health`. A `secretary.db-wal` file appears after first DB access, confirming WAL mode.
