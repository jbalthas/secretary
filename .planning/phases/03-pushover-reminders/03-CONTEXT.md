# Phase 3: Pushover Reminders - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Task reminders fire as Pushover push notifications at the scheduled time, reliably, including after Pi reboots.

Phase 3 delivers the Pushover client/service and task reminder scheduling. The daily brief notification (NOTIF-02) is fully realized in Phase 5 — Phase 3 only builds the plumbing that Phase 5 will reuse.

</domain>

<decisions>
## Implementation Decisions

### Notification Format
- **D-01:** Notification title = task title only (no "Reminder:" prefix)
- **D-02:** Notification body = task description if set, empty body if not
- **D-03:** Pushover priority maps to task priority: high task → Pushover priority 1 (high, bypasses quiet hours); medium/low task → Pushover priority 0 (normal)

### Job Lifecycle
- **D-04:** Reminder job is upserted on every task save (create or update) — `replace_existing=True` handles reschedules cleanly; no need to diff old vs new `reminder_at`
- **D-05:** If `reminder_at` is null, no job is scheduled (or existing job is removed)
- **D-06:** When a task is deleted OR marked complete, its pending reminder job is removed from APScheduler immediately
- **D-07:** Job ID convention: `reminder_task_{task_id}` — stable, deduplication-safe

### Post-Fire Cleanup
- **D-08:** DateTrigger (one-shot) jobs — APScheduler removes them automatically after execution. No `reminder_fired_at` column in the DB. No extra guard needed.

### NOTIF-02 Scope
- **D-09:** Phase 3 builds the Pushover HTTP client as a reusable service (not just for tasks). NOTIF-02 (daily brief via Pushover) is not implemented in Phase 3 — it is delivered in Phase 5 when the brief scheduling and agenda content exist. Requirements traceability stays as-is (no column update needed — it's understood as "plumbing complete in 3, brief complete in 5").

### Carried Forward (from prior phases)
- APScheduler 3.x (not 4.x), `AsyncIOScheduler` with `SQLAlchemyJobStore` for persistence
- Single uvicorn worker only — multiple workers cause duplicate APScheduler fires
- `id=` + `replace_existing=True` on every APScheduler job
- WAL mode + busy_timeout already set at DB startup (no changes needed)

### Claude's Discretion
- APScheduler module structure (e.g., `backend/app/scheduler.py` vs inline in `main.py`)
- Pushover client module location (e.g., `backend/app/services/pushover.py`)
- Error handling when Pushover API call fails (log and swallow vs retry)
- SQLAlchemyJobStore table name and URL derivation (sync URL from settings, same pattern as Alembic)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — NOTIF-01 and NOTIF-02 are Phase 3 scope; see traceability table

### Infrastructure (Phase 1 outputs)
- `backend/app/main.py` — FastAPI app instance; scheduler startup/shutdown wires into lifespan here
- `backend/app/db.py` — Async SQLAlchemy session setup; sync URL needed for SQLAlchemyJobStore
- `backend/app/config.py` — Settings object; add `pushover_api_token` and `pushover_user_key` here
- `backend/app/models/__init__.py` — Task model with `reminder_at`, `priority`, `title`, `description` fields

### Phase 2 outputs (task CRUD router)
- `backend/app/routers/tasks.py` — CRUD endpoints; reminder job upsert/remove must be called from create, update, delete, and complete operations here

### Tech Stack Reference
- `.planning/CLAUDE.md` — APScheduler 3.x guidance (SQLAlchemyJobStore, AsyncIOScheduler, single worker)

### No external specs
- Pushover REST API is simple (single POST to api.pushover.net/1/messages.json) — no additional spec doc needed

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/config.py` — `Settings` (pydantic-settings); extend with `pushover_api_token: str` and `pushover_user_key: str` from `.env`
- `backend/app/db.py` — derive sync SQLite URL (strip `+aiosqlite`) for SQLAlchemyJobStore, same pattern Alembic uses
- `backend/app/routers/tasks.py` — all four CRUD endpoints need scheduler calls injected; existing async session pattern applies

### Established Patterns
- All endpoints are `async def`; reminder sender function must be a regular (sync) callable that APScheduler can call, or wrapped appropriately
- Settings loaded via `from app.config import settings` singleton
- New routers/services added to `backend/app/`; mount point is `main.py`

### Integration Points
- `main.py` lifespan: start `AsyncIOScheduler` on startup, shutdown on teardown
- `routers/tasks.py` create/update: call `scheduler.upsert_reminder(task)` after DB commit
- `routers/tasks.py` delete + complete: call `scheduler.remove_reminder(task_id)` after DB operation

</code_context>

<specifics>
## Specific Ideas

- Pushover priority mapping: `high` → 1, `medium` → 0, `low` → 0 (not negative — no silent notifications)
- Job ID: `reminder_task_{task_id}` (e.g., `reminder_task_42`)
- The Pushover service module should be thin — just an `httpx` async call to the Pushover API; no retry logic needed for v1

</specifics>

<deferred>
## Deferred Ideas

- Pushover action buttons (e.g., "Mark complete" from notification) — deferred to v2 backlog
- Retry logic on Pushover API failure — log and continue for v1
- NOTIF-02 daily brief notification — Phase 5

</deferred>

---

*Phase: 03-pushover-reminders*
*Context gathered: 2026-06-12*
