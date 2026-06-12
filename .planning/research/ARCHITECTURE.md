# Architecture Research

**Project:** My Secretary
**Researched:** 2026-06-12

---

## Component Map

```
                        ┌─────────────────────────────────────────┐
                        │           Raspberry Pi 5                │
                        │                                         │
  Browser (Tailscale) ──┤→ nginx :443 ──→ /api/* → FastAPI :8000 │
  Phone (Pushover)    ←─┤                        ↕                │
  Google Home (speak) ←─┤  pychromecast          APScheduler      │
  Google Home (listen)──┤  (LAN cast)            (in-process)     │
  IFTTT webhook       ──┤→ nginx :443 ──→ /webhooks/ifttt         │
  Google Calendar     ↔─┤  (OAuth2 polling + incremental sync)    │
                        │                        ↕                │
                        │                   SQLite DB             │
                        │              (single .db file)          │
                        └─────────────────────────────────────────┘
```

**Traffic summary:**
- nginx is the only public-facing process (via Tailscale, never open internet)
- FastAPI runs on localhost:8000; nginx proxies `/api/` and `/webhooks/` to it
- nginx serves React static files from `/var/www/secretary/dist/`
- pychromecast talks directly to Google Home over LAN (no nginx involved)
- Pushover calls go outbound from FastAPI — no inbound path needed
- Google Calendar OAuth tokens stored in SQLite; sync runs inside APScheduler jobs

---

## Data Model

```sql
-- Tasks: one-off and recurring to-dos
CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY,
    title       TEXT    NOT NULL,
    notes       TEXT,
    due_at      TEXT,               -- ISO8601, nullable = no due date
    done_at     TEXT,               -- NULL = not done
    priority    INTEGER DEFAULT 0,  -- 0=normal 1=high
    source      TEXT DEFAULT 'manual', -- 'manual' | 'ifttt' | 'gcal'
    gcal_event_id TEXT,             -- links to events table if synced from calendar
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Calendar events: synced from Google Calendar (read-authoritative source)
CREATE TABLE events (
    id              INTEGER PRIMARY KEY,
    gcal_id         TEXT UNIQUE NOT NULL,  -- Google's event ID
    gcal_calendar_id TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    start_at        TEXT NOT NULL,  -- ISO8601
    end_at          TEXT NOT NULL,
    location        TEXT,
    is_all_day      INTEGER DEFAULT 0,
    notified        INTEGER DEFAULT 0,  -- 1 = reminder already sent
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Routines: named recurring jobs with their schedule and action payload
CREATE TABLE routines (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    cron        TEXT NOT NULL,      -- cron expression e.g. '0 8 * * *'
    action      TEXT NOT NULL,      -- 'daily_brief' | 'reminder' | 'tts' | 'pushover'
    payload     TEXT,               -- JSON blob, action-specific
    enabled     INTEGER DEFAULT 1,
    last_run_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reminders: fire-once notifications tied to a task or event
CREATE TABLE reminders (
    id          INTEGER PRIMARY KEY,
    task_id     INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
    fire_at     TEXT NOT NULL,      -- ISO8601
    channel     TEXT NOT NULL,      -- 'pushover' | 'tts'
    message     TEXT NOT NULL,
    sent_at     TEXT                -- NULL = pending
);

-- KV store for system state (OAuth tokens, sync cursors, etc.)
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,      -- JSON
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_due       ON tasks(due_at) WHERE done_at IS NULL;
CREATE INDEX idx_events_start    ON events(start_at);
CREATE INDEX idx_reminders_fire  ON reminders(fire_at) WHERE sent_at IS NULL;
```

**Key decisions:**
- All timestamps as ISO8601 TEXT — SQLite has no native datetime; this keeps them sortable and human-readable.
- `settings` table is the escape hatch for OAuth tokens, sync page tokens, feature flags. No separate migrations needed for new config keys.
- `events` is a local cache of Google Calendar. Google Calendar is authoritative; never write back to gcal_id rows from the app except during explicit sync.
- `tasks` created via IFTTT or calendar have a `source` tag so the UI can show provenance.

---

## API Design

All routes under `/api/v1/`. Versioning from day one costs nothing and prevents pain later.

```
# Tasks
GET    /api/v1/tasks              ?done=false&priority=1&limit=50&offset=0
POST   /api/v1/tasks              { title, notes, due_at, priority }
GET    /api/v1/tasks/{id}
PATCH  /api/v1/tasks/{id}         partial update
DELETE /api/v1/tasks/{id}
POST   /api/v1/tasks/{id}/done    marks complete (sets done_at)
POST   /api/v1/tasks/{id}/undone

# Events (read-only from UI — source of truth is Google Calendar)
GET    /api/v1/events             ?from=ISO&to=ISO
GET    /api/v1/events/{id}

# Routines
GET    /api/v1/routines
POST   /api/v1/routines           { name, cron, action, payload }
PATCH  /api/v1/routines/{id}
DELETE /api/v1/routines/{id}
POST   /api/v1/routines/{id}/run  manual trigger

# Reminders
GET    /api/v1/reminders          ?pending=true
POST   /api/v1/reminders          { task_id|event_id, fire_at, channel, message }
DELETE /api/v1/reminders/{id}

# Google Calendar
GET    /api/v1/gcal/status        { connected: bool, last_sync: ISO, calendars: [...] }
POST   /api/v1/gcal/connect       kicks off OAuth flow, returns auth_url
GET    /api/v1/gcal/callback      OAuth redirect handler
POST   /api/v1/gcal/sync          manual full sync trigger
DELETE /api/v1/gcal/disconnect    revokes token, wipes events cache

# Webhooks (no auth guard — validate IFTTT shared secret in header)
POST   /webhooks/ifttt            { action: 'add_task'|'daily_brief', payload: {...} }

# System
GET    /api/v1/health
POST   /api/v1/tts                { text, device_name? }  — trigger Pi→Google Home TTS
```

**Auth model:** Single-user, Tailscale-only. No login screen needed. Add an `X-API-Key` header check on all `/api/` routes using a key stored in `.env` — trivial to add, keeps IFTTT webhooks distinct (they use their own shared-secret header).

---

## Scheduler Integration

**APScheduler 3.x with AsyncIOScheduler** inside FastAPI's lifespan context. Do not use APScheduler 4.x (breaking API, still maturing).

```python
# app/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(url="sqlite:///secretary.db")},
    job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 60},
)

# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.scheduler import scheduler
from app.jobs import register_static_jobs

@asynccontextmanager
async def lifespan(app: FastAPI):
    register_static_jobs()   # reminder poller, gcal sync, etc.
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)
app.state.scheduler = scheduler
```

**Dependency for routes:**
```python
def get_scheduler(request: Request) -> AsyncIOScheduler:
    return request.app.state.scheduler
```

**Static jobs to register at startup:**

| Job ID | Trigger | Action |
|--------|---------|--------|
| `reminder_poller` | interval, every 60s | Query `reminders` where `fire_at <= now AND sent_at IS NULL`, dispatch Pushover/TTS |
| `gcal_sync` | interval, every 5 min | Incremental calendar sync via page token |
| `daily_brief` | cron, 08:00 daily | Assemble and announce day's events + tasks via TTS then Pushover |

**Dynamic routine jobs:** when a `Routine` row is created/updated via API, add/reschedule it in APScheduler using `scheduler.add_job(..., id=f"routine_{id}", replace_existing=True)`. On delete, call `scheduler.remove_job(f"routine_{id}")`.

**SQLAlchemy job store** persists scheduled jobs across restarts so dynamic routines survive a Pi reboot without re-seeding.

**Misfire handling:** `coalesce=True` + `misfire_grace_time=60` — if Pi was asleep and a job fires late, run it once within 60s of its scheduled time instead of firing multiple catch-up instances.

---

## Google Calendar Sync Strategy

**Approach: Incremental polling with stored sync token (not push webhooks)**

Push webhooks require a publicly reachable HTTPS URL. While Tailscale gives you remote access, Google's push notification system requires a verified domain endpoint that Google can reach from its servers — Tailscale addresses are private. Setting up a public webhook relay (e.g. via a VPS or ngrok) adds operational complexity that's not worth it for personal use.

**Chosen pattern: incremental sync via `syncToken`**

1. **Initial full sync** — fetch all events with `timeMin=now-30days`, page through results, store `nextSyncToken` from final page response in `settings` table.
2. **Incremental sync** (every 5 minutes via APScheduler) — call `events.list` with `syncToken=<stored>`. Returns only changed/deleted events since last sync. Store new token on success.
3. **Token expiration** — if Google returns HTTP 410 Gone, the sync token is stale; discard it and run a full sync again.
4. **Deleted events** — incremental results include `status: "cancelled"` entries; delete matching rows from `events`.
5. **Conflict handling** — Google Calendar is the authoritative source for `events`. Never write to it from the app (read-only sync for now). If bidirectional sync is added later, use `etag` fields to detect conflicts.

**Quota:** Google Calendar API allows 1,000,000 requests/day for personal use. A 5-minute polling interval = 288 incremental syncs/day. Entirely within quota even with multiple calendars.

**OAuth token storage:** access token + refresh token stored in `settings` table as JSON under key `gcal_oauth`. Refresh automatically using `google-auth` library; write updated token back to `settings` after each refresh.

**Calendar selection:** sync all calendars returned by `calendarList.list` where `selected=true`. Store per-calendar sync tokens keyed by `gcal_calendar_id`.

---

## Build Order

Dependencies drive this order. Each phase produces something runnable.

**Phase 1 — Foundation (Pi OS + service skeleton)**
1. Python venv, install FastAPI + Uvicorn + APScheduler + SQLite deps
2. SQLite schema applied via `alembic` or a plain `schema.sql` init script
3. FastAPI app with lifespan, health endpoint, APScheduler wired up
4. systemd unit for FastAPI (auto-restart on crash, start on boot)
5. nginx config: proxy `/api/` to localhost:8000, serve static placeholder from `/var/www/secretary/dist/`
6. Tailscale installed, Pi accessible via `secretary.tailnet-name.ts.net`

*Gate: `curl https://secretary.ts.net/api/v1/health` returns 200 from phone.*

**Phase 2 — Task CRUD + Basic UI**
1. Tasks table + all task API endpoints
2. React + Vite scaffold, `npm run build` output to `/var/www/secretary/dist/`
3. Task list and add-task form in UI
4. Deploy script: build locally (or on Pi), copy dist, nginx reloads

*Gate: Add a task from phone browser, see it appear.*

**Phase 3 — Pushover Notifications**
1. Pushover API wrapper (outbound HTTP, ~20 lines)
2. Reminders table + reminder API endpoints
3. APScheduler `reminder_poller` job wired to Pushover
4. UI: attach reminder to a task, set time

*Gate: Create task with reminder, receive Pushover notification at set time.*

**Phase 4 — Google Calendar Sync**
1. Google OAuth flow (`/api/v1/gcal/connect` + `/gcal/callback`)
2. Full sync on first connect, token stored in settings
3. Incremental sync APScheduler job
4. Events API endpoints (read-only)
5. UI: calendar view showing synced events

*Gate: Create event in Google Calendar, see it appear in app within 5 minutes.*

**Phase 5 — IFTTT Voice Input**
1. IFTTT applet: Google Assistant trigger → webhook POST to `https://secretary.ts.net/webhooks/ifttt`
2. Webhook handler: parse action, create task or trigger routine
3. Shared-secret header validation
4. Test: "Hey Google, add task buy milk" → task appears in UI

*Gate: Voice command creates task without touching phone.*

**Phase 6 — Pi → Google Home TTS**
1. Install pychromecast, gTTS in venv
2. `tts_service.py`: gTTS → temp MP3 → serve from FastAPI `/tts/{filename}` → pychromecast casts URL to device
3. `POST /api/v1/tts` endpoint
4. Wire TTS into reminder_poller (channel='tts') and daily_brief job

*Gate: Trigger TTS via API, Google Home speaks the message.*

**Phase 7 — Daily Brief + Routines**
1. Daily brief job: query today's events + incomplete tasks, compose message, TTS + Pushover summary
2. Routines CRUD (API + UI)
3. Dynamic APScheduler job management on routine create/update/delete

*Gate: 8am daily brief fires, hear summary on Google Home, receive Pushover with same info.*

---

## Key Architectural Constraints to Keep in Mind

- **Single process, single worker.** Run uvicorn with one worker (`--workers 1`). APScheduler is in-process; multiple workers would spawn duplicate schedulers firing duplicate jobs.
- **pychromecast requires Pi to serve the MP3.** gTTS generates audio; pychromecast tells the Chromecast device to fetch it via HTTP. The Pi must be reachable by the Google Home on LAN — it is, since both are on the same home network. Do not route this through Tailscale.
- **IFTTT webhook requires public reachability.** IFTTT's servers POST to your URL. The Tailscale HTTPS URL (`secretary.ts.net`) is reachable by IFTTT because Tailscale's MagicDNS routes are accessible from the internet when the device is online. Verify this works in Phase 5; if not, a Tailscale funnel (public HTTPS relay) is the fallback.
- **SQLite WAL mode.** Enable `PRAGMA journal_mode=WAL` on startup. APScheduler and FastAPI both write concurrently; WAL allows one writer + multiple readers without locking contention.
- **Token refresh timing.** The Google OAuth access token expires in 1 hour. The incremental sync job runs every 5 minutes, so it will hit expiry. Use `google.auth.transport.requests.Request()` to auto-refresh inside the sync job; catch `google.auth.exceptions.RefreshError` and disable sync + notify via Pushover if the token is truly revoked.
