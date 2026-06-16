# Requirements — My Secretary

## v1 Requirements

### Infrastructure (INFRA)

- [x] **INFRA-01**: Pi 5 is configured with Raspberry Pi OS Bookworm 64-bit, uv, Python 3.12, and project virtualenv
- [x] **INFRA-02**: FastAPI service runs and returns 200 on `GET /api/v1/health`
- [x] **INFRA-03**: Service runs as a systemd unit with `Restart=always`, starts on boot after network and Tailscale
- [x] **INFRA-04**: nginx reverse proxies to FastAPI, serves React static files, and terminates HTTPS via Tailscale cert
- [x] **INFRA-05**: User can access the web UI from any device via Tailscale (e.g. `https://secretary.ts.net`)
- [x] **INFRA-06**: Alembic migrations are wired up; SQLite uses WAL mode from first init
- [x] **INFRA-07**: Setup script exists to bootstrap a fresh Pi end-to-end with minimal manual steps

### Tasks (TASK)

- [x] **TASK-01**: User can create a task with title, optional description, optional due date, and priority (high/medium/low)
- [x] **TASK-02**: User can edit any field of an existing task
- [x] **TASK-03**: User can mark a task complete
- [x] **TASK-04**: User can delete a task
- [x] **TASK-05**: User can attach a reminder time to a task; reminder fires a Pushover notification at that time
- [x] **TASK-06**: User can create a recurring task (daily, weekly, or custom cron expression)
- [x] **TASK-07**: Task list is filterable by status (pending / completed) and sortable by due date and priority

### Scheduling & Calendar (CAL)

- [x] **CAL-01**: User completes Google OAuth flow in the web UI; tokens are stored and auto-refreshed
- [x] **CAL-02**: App syncs Google Calendar events incrementally every 5 minutes (syncToken strategy)
- [x] **CAL-03**: On HTTP 410 from Google, app falls back to a full re-sync automatically
- [x] **CAL-04**: App sends a Pushover alert if the Google OAuth token is revoked (`invalid_grant`)
- [x] **CAL-05**: Today's agenda view shows tasks (with due dates) and calendar events merged and sorted by time
- [x] **CAL-06**: Daily brief fires at a user-configurable time (default 8am); delivered as a Pushover notification with today's agenda summary
- [ ] **CAL-07**: User can define custom recurring routines (name, cron schedule, action); routines persist across reboots via APScheduler SQLAlchemyJobStore

### Notifications & Google Home (NOTIF)

- [x] **NOTIF-01**: Task reminders deliver a Pushover push notification to user's phone at the scheduled time
- [x] **NOTIF-02**: Daily brief delivers a Pushover push notification with agenda content
- [x] **NOTIF-03**: User can trigger a TTS announcement on their Google Home from the web UI (`POST /api/v1/tts`)
- [x] **NOTIF-04**: Task reminders also announce on Google Home via pychromecast + gTTS (in addition to Pushover)
- [x] **NOTIF-05**: Daily brief announces on Google Home at brief time (in addition to Pushover)
- [x] **NOTIF-06**: Google Home morning routine can trigger the daily brief via a webhook endpoint

---

## Milestone v2.0 Requirements — Ingest, Organize, Guide

> Phases start at Phase 8 (Phase 7 Outlook ICS owned by a separate concurrent effort). REQ-IDs continue in new categories: INGEST, GOAL, PLAN, GUIDE.

### Ingest (INGEST)

- [x] **INGEST-01**: App publishes a stable, versioned import schema (`GET /api/v1/ingest/schema`, generated from the Pydantic model) and a documented LLM prompt the user can paste into any LLM to produce a compliant payload
- [x] **INGEST-02**: Ingest endpoint validates an uploaded/pasted JSON payload against the schema and returns field-level errors (HTTP 422) on malformed input; `schema_version` mismatch is rejected with a clear message
- [ ] **INGEST-03**: User can preview an import (dry-run) and see exactly what will be created vs. updated (counts + per-entity diff) before anything is written to the DB
- [x] **INGEST-04**: On confirm, the payload is written transactionally — goals, then tasks, then routines, then habits — so a partial failure rolls back cleanly
- [ ] **INGEST-05**: User can submit a payload by pasting JSON into a textarea OR uploading a `.json` file from the web UI
- [x] **INGEST-06**: Re-importing the same payload is idempotent — entities are matched on a stable `external_key` (not title) and upserted, so no duplicates are created
- [x] **INGEST-07**: Payload can create habits (recurring behaviors) in addition to goals, tasks, and routines; a habit maps to a recurring task flagged as a habit and may link to a goal

### Goals (GOAL)

- [x] **GOAL-01**: User can create, edit, and archive a goal with a title, type (career/life/health/learning/financial), optional description/context, and optional target date (archive preserves history; no hard delete)
- [x] **GOAL-02**: Each goal shows a progress percentage computed from its linked tasks' completion (recalculated on read, not stored)
- [x] **GOAL-03**: A goal can have milestones (title, optional target date, done flag); milestone completion contributes to the goal's tracked progress
- [ ] **GOAL-04**: User can view all goals in a dedicated Goals view and drill into a goal detail showing its milestones, linked tasks, and progress
- [ ] **GOAL-05**: User can link a task to a goal from the task form (goal dropdown); routines can also be tagged to a goal
- [x] **GOAL-06**: Completing a milestone fires a celebration announcement (Google Home TTS + Pushover), reusing existing notification infrastructure

### Day Organize (PLAN)

- [ ] **PLAN-01**: User can request a proposed plan for the current day — the planner treats synced calendar events as fixed blocks, finds free intervals, and fills them with pending tasks ordered by priority and due date, sizing each block from the task's `estimated_minutes` (default 30 if unset)
- [ ] **PLAN-02**: User can review the proposed plan and accept/edit/reject blocks before anything commits; the approved plan is stored locally and rendered in the Today view (no Google Calendar write in v2.0)

### Guidance (GUIDE)

- [ ] **GUIDE-01**: The daily brief includes a goal snapshot — each active goal's progress and the single most-urgent task linked to it
- [ ] **GUIDE-02**: The Today view surfaces a "next best task" — the highest-scoring pending task by priority × goal urgency × due-date proximity
- [ ] **GUIDE-03**: If a goal has had no task completions for a configurable threshold (default 7 days), the user receives a Pushover nudge that it has stalled

---

## Future / Backlog (post-v2.0)

> Items below were deferred from v1.0 or flagged P3 during v2.0 research; not in the current milestone.

- Energy-aware day planning (peak-hours setting) + automatic buffer blocks between tasks — deferred from v2.0 Organize
- Mid-day re-plan button (re-propose remaining time) — P3
- Weekly goal digest (automated Friday/Sunday review) — deferred from v2.0 Guidance (partially served by the existing weekly voice readout, quick task 260615-bse)
- Per-item ingest conflict report (resolve title conflicts on re-import) — P3
- Google Calendar write-back for approved plan blocks — needs write OAuth scope + conflict/undo handling
- Goal-guided coaching via LLM API (server-side) — v3.0 concept

## v1-era Deferred (still backlog)

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
| INFRA-07 | Phase 1 — Foundation | Done (01-04) |
| TASK-01 | Phase 2 — Tasks & Agenda | Complete |
| TASK-02 | Phase 2 — Tasks & Agenda | Complete |
| TASK-03 | Phase 2 — Tasks & Agenda | Complete |
| TASK-04 | Phase 2 — Tasks & Agenda | Complete |
| TASK-05 | Phase 2 — Tasks & Agenda | Complete |
| TASK-06 | Phase 2 — Tasks & Agenda | Complete |
| TASK-07 | Phase 2 — Tasks & Agenda | Complete |
| CAL-05 | Phase 2 — Tasks & Agenda | Complete |
| NOTIF-01 | Phase 3 — Pushover Reminders | Complete |
| NOTIF-02 | Phase 5 — Daily Brief & Routines | Complete |
| CAL-01 | Phase 4 — Calendar Sync | Complete |
| CAL-02 | Phase 4 — Calendar Sync | Complete |
| CAL-03 | Phase 4 — Calendar Sync | Complete |
| CAL-04 | Phase 4 — Calendar Sync | Complete |
| CAL-06 | Phase 5 — Daily Brief & Routines | Complete |
| CAL-07 | Phase 5 — Daily Brief & Routines | Pending |
| NOTIF-03 | Phase 6 — Google Home TTS | Complete |
| NOTIF-04 | Phase 6 — Google Home TTS | Complete |
| NOTIF-05 | Phase 6 — Google Home TTS | Complete |
| NOTIF-06 | Phase 6 — Google Home TTS | Complete |
| GOAL-01 | Phase 8 — Goals + Ingest Backend | Complete |
| GOAL-02 | Phase 8 — Goals + Ingest Backend | Complete |
| GOAL-03 | Phase 8 — Goals + Ingest Backend | Complete |
| GOAL-06 | Phase 8 — Goals + Ingest Backend | Complete |
| INGEST-01 | Phase 8 — Goals + Ingest Backend | Pending |
| INGEST-02 | Phase 8 — Goals + Ingest Backend | Pending |
| INGEST-04 | Phase 8 — Goals + Ingest Backend | Pending |
| INGEST-06 | Phase 8 — Goals + Ingest Backend | Complete |
| INGEST-07 | Phase 8 — Goals + Ingest Backend | Complete |
| GOAL-04 | Phase 9 — Goals + Ingest UI | Pending |
| GOAL-05 | Phase 9 — Goals + Ingest UI | Pending |
| INGEST-03 | Phase 9 — Goals + Ingest UI | Pending |
| INGEST-05 | Phase 9 — Goals + Ingest UI | Pending |
| PLAN-01 | Phase 10 — Day Auto-Organize | Pending |
| PLAN-02 | Phase 10 — Day Auto-Organize | Pending |
| GUIDE-01 | Phase 11 — Goal-Guided Guidance | Pending |
| GUIDE-02 | Phase 11 — Goal-Guided Guidance | Pending |
| GUIDE-03 | Phase 11 — Goal-Guided Guidance | Pending |
