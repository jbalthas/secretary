# Requirements — My Secretary

## v1 Requirements

### Infrastructure (INFRA)

- [x] **INFRA-01**: Pi 5 is configured with Raspberry Pi OS Bookworm 64-bit, uv, Python 3.12, and project virtualenv
- [x] **INFRA-02**: FastAPI service runs and returns 200 on `GET /api/v1/health`
- [x] **INFRA-03**: Service runs as a systemd unit with `Restart=always`, starts on boot after network and Tailscale
- [x] **INFRA-04**: nginx reverse proxies to FastAPI, serves React static files, and terminates HTTPS via Tailscale cert
- [x] **INFRA-05**: User can access the web UI from any device via Tailscale (e.g. `https://secretary.ts.net`)
- [x] **INFRA-06**: Alembic migrations are wired up; SQLite uses WAL mode from first init
- [ ] **INFRA-07**: Setup script exists to bootstrap a fresh Pi end-to-end with minimal manual steps

### Tasks (TASK)

- [x] **TASK-01**: User can create a task with title, optional description, optional due date, and priority (high/medium/low)
- [x] **TASK-02**: User can edit any field of an existing task
- [x] **TASK-03**: User can mark a task complete
- [x] **TASK-04**: User can delete a task
- [x] **TASK-05**: User can attach a reminder time to a task; reminder fires a Pushover notification at that time
- [x] **TASK-06**: User can create a recurring task (daily, weekly, or custom cron expression)
- [x] **TASK-07**: Task list is filterable by status (pending / completed) and sortable by due date and priority

### Scheduling & Calendar (CAL)

- [ ] **CAL-01**: User completes Google OAuth flow in the web UI; tokens are stored and auto-refreshed
- [ ] **CAL-02**: App syncs Google Calendar events incrementally every 5 minutes (syncToken strategy)
- [ ] **CAL-03**: On HTTP 410 from Google, app falls back to a full re-sync automatically
- [ ] **CAL-04**: App sends a Pushover alert if the Google OAuth token is revoked (`invalid_grant`)
- [x] **CAL-05**: Today's agenda view shows tasks (with due dates) and calendar events merged and sorted by time
- [ ] **CAL-06**: Daily brief fires at a user-configurable time (default 8am); delivered as a Pushover notification with today's agenda summary
- [ ] **CAL-07**: User can define custom recurring routines (name, cron schedule, action); routines persist across reboots via APScheduler SQLAlchemyJobStore

### Notifications & Google Home (NOTIF)

- [x] **NOTIF-01**: Task reminders deliver a Pushover push notification to user's phone at the scheduled time
- [ ] **NOTIF-02**: Daily brief delivers a Pushover push notification with agenda content
- [ ] **NOTIF-03**: User can trigger a TTS announcement on their Google Home from the web UI (`POST /api/v1/tts`)
- [ ] **NOTIF-04**: Task reminders also announce on Google Home via pychromecast + gTTS (in addition to Pushover)
- [ ] **NOTIF-05**: Daily brief announces on Google Home at brief time (in addition to Pushover)
- [ ] **NOTIF-06**: Google Home morning routine can trigger the daily brief via a webhook endpoint

---

## v2 Requirements (Deferred)

- IFTTT voice → "add task" (IFTTT webhook + Tailscale Funnel) — deferred; IFTTT latency and Funnel setup are better tackled after core loop is stable
- Google Calendar event write — deferred; read-only sync sufficient for v1, write adds conflict resolution complexity
- Pushover action buttons (complete task from notification) — deferred
- Voice queries ("what's on my schedule?") — requires Dialogflow or similar; out of scope for v1
- Multi-user support — personal use only

---

## Out of Scope

- Public internet exposure — Tailscale handles remote access; no open router ports ever
- Mobile native app — responsive web UI is sufficient
- Natural language parsing ("remind me in 3 days") — too much complexity for v1
- Container/Docker deployment — single-process on Pi, no container overhead needed
- Multi-calendar support — one Google account is enough

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 1 — Foundation | Complete |
| INFRA-02 | Phase 1 — Foundation | Complete |
| INFRA-03 | Phase 1 — Foundation | Done (01-03) |
| INFRA-04 | Phase 1 — Foundation | Done (01-03) |
| INFRA-05 | Phase 1 — Foundation | Done (01-03) |
| INFRA-06 | Phase 1 — Foundation | Complete |
| INFRA-07 | Phase 1 — Foundation | Pending |
| TASK-01 | Phase 2 — Tasks & Agenda | Complete |
| TASK-02 | Phase 2 — Tasks & Agenda | Complete |
| TASK-03 | Phase 2 — Tasks & Agenda | Complete |
| TASK-04 | Phase 2 — Tasks & Agenda | Complete |
| TASK-05 | Phase 2 — Tasks & Agenda | Complete |
| TASK-06 | Phase 2 — Tasks & Agenda | Complete |
| TASK-07 | Phase 2 — Tasks & Agenda | Complete |
| CAL-05 | Phase 2 — Tasks & Agenda | Complete |
| NOTIF-01 | Phase 3 — Pushover Reminders | Complete |
| NOTIF-02 | Phase 5 — Daily Brief & Routines | Pending |
| CAL-01 | Phase 4 — Calendar Sync | Pending |
| CAL-02 | Phase 4 — Calendar Sync | Pending |
| CAL-03 | Phase 4 — Calendar Sync | Pending |
| CAL-04 | Phase 4 — Calendar Sync | Pending |
| CAL-06 | Phase 5 — Daily Brief & Routines | Pending |
| CAL-07 | Phase 5 — Daily Brief & Routines | Pending |
| NOTIF-03 | Phase 6 — Google Home TTS | Pending |
| NOTIF-04 | Phase 6 — Google Home TTS | Pending |
| NOTIF-05 | Phase 6 — Google Home TTS | Pending |
| NOTIF-06 | Phase 6 — Google Home TTS | Pending |
