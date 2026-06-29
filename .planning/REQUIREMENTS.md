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
- [x] **INGEST-03**: User can preview an import (dry-run) and see exactly what will be created vs. updated (counts + per-entity diff) before anything is written to the DB
- [x] **INGEST-04**: On confirm, the payload is written transactionally — goals, then tasks, then routines, then habits — so a partial failure rolls back cleanly
- [x] **INGEST-05**: User can submit a payload by pasting JSON into a textarea OR uploading a `.json` file from the web UI
- [x] **INGEST-06**: Re-importing the same payload is idempotent — entities are matched on a stable `external_key` (not title) and upserted, so no duplicates are created
- [x] **INGEST-07**: Payload can create habits (recurring behaviors) in addition to goals, tasks, and routines; a habit maps to a recurring task flagged as a habit and may link to a goal

### Goals (GOAL)

- [x] **GOAL-01**: User can create, edit, and archive a goal with a title, type (career/life/health/learning/financial), optional description/context, and optional target date (archive preserves history; no hard delete)
- [x] **GOAL-02**: Each goal shows a progress percentage computed from its linked tasks' completion (recalculated on read, not stored)
- [x] **GOAL-03**: A goal can have milestones (title, optional target date, done flag); milestone completion contributes to the goal's tracked progress
- [x] **GOAL-04**: User can view all goals in a dedicated Goals view and drill into a goal detail showing its milestones, linked tasks, and progress
- [x] **GOAL-05**: User can link a task to a goal from the task form (goal dropdown); routines can also be tagged to a goal
- [x] **GOAL-06**: Completing a milestone fires a celebration announcement (Google Home TTS + Pushover), reusing existing notification infrastructure

### Day Organize (PLAN)

- [x] **PLAN-01**: User can request a proposed plan for the current day — the planner treats synced calendar events as fixed blocks, finds free intervals, and fills them with pending tasks ordered by priority and due date, sizing each block from the task's `estimated_minutes` (default 30 if unset)
- [x] **PLAN-02**: User can review the proposed plan and accept/edit/reject blocks before anything commits; the approved plan is stored locally and rendered in the Today view (no Google Calendar write in v2.0)

### Guidance (GUIDE)

- [x] **GUIDE-01**: The daily brief includes a goal snapshot — each active goal's progress and the single most-urgent task linked to it
- [x] **GUIDE-02**: The Today view surfaces a "next best task" — the highest-scoring pending task by priority × goal urgency × due-date proximity
- [x] **GUIDE-03**: If a goal has had no task completions for a configurable threshold (default 7 days), the user receives a Pushover nudge that it has stalled

---

## Milestone v2.1 Requirements — Close the Loop

> Intra-day update loop: the secretary checks in, the user logs progress in seconds, the schedule self-corrects. HARD CONSTRAINTS (locked since v2.0): no new dependencies, no server-side LLM, minimize API/token cost. REQ-IDs continue in NOTIF/INGEST and a new UPDATE category. Phase numbering continues from v2.0 (starts at Phase 12).

### Intra-day Updates (UPDATE)

- [x] **UPDATE-01**: User can log progress via a quick-update box on the Today view by typing or phone keyboard dictation (free text), without opening any task form
- [x] **UPDATE-02**: System resolves simple updates — mark a task/block done, reschedule it, or drop it — by fuzzy-matching the text against today's existing scheduled blocks/tasks, with no LLM call
- [x] **UPDATE-03**: A quick update that is ambiguous or matches nothing is surfaced to the user to confirm/correct, never guessed at or silently dropped
- [x] **UPDATE-04**: At end of day, user sees a rollup of completed vs. slipped items, and unfinished items carry forward into the next day via the existing brief/rollover path

### Notifications & Google Home (NOTIF) — continued

- [x] **NOTIF-07**: User receives a configurable mid-day check-in notification (Pushover, optionally announced on Google Home) prompting them to log progress, with a link that deep-links into the Today update view
- [x] **NOTIF-08**: User can configure the check-in time(s) and enable/disable them from the web UI; the schedule persists across reboots (APScheduler SQLAlchemyJobStore)

### Ingest (INGEST) — continued

- [x] **INGEST-08**: The import contract supports an "intra-day update" payload type (mark done / reschedule / drop against today's plan) that the ingest endpoint validates and applies idempotently — letting the user route a messy multi-intent spoken dump through any external LLM

---

## Milestone v2.2 Requirements — LLM Advisory Loop

> Bidirectional sync with an EXTERNAL LLM: the secretary exports a rich, compact context bundle for the LLM to reason over, and ingests the LLM's goal/timeline adjustments back through the existing ingest contract. HARD CONSTRAINTS (locked since v2.0): no new dependencies, no server-side LLM, minimize token cost. North star: maximize the user's time and accelerate their growth as an engineer/career person. REQ-IDs continue in new categories: EXPORT, PROG, ADVISE, SYNC, PROMPT. Phase numbering continues (starts at Phase 14). Migration HEAD is 0016 → new migrations 0017/0018.

### Context Export (EXPORT)

- [ ] **EXPORT-01**: User can copy a complete advisor brief (Markdown with embedded JSON schema) to the clipboard with one action on the Sync page, ready to paste into an external LLM; the bundle header carries `generated_at` and a `session_id`
- [ ] **EXPORT-02**: The bundle lists each active goal with title, type, target_date (+ days remaining), live-computed progress_pct, milestone list, top-3 active tasks (title/priority/due date), and overdue-task count
- [ ] **EXPORT-03**: The bundle includes a 14-day planned-vs-actual block summary (blocks planned / completed / slipped) aggregated from ScheduledBlock
- [ ] **EXPORT-04**: The bundle includes a per-goal progress trend (last 4 weekly values) and a velocity label (accelerating / steady / stalling / no_data), degrading gracefully to `no_data` until snapshots accumulate
- [ ] **EXPORT-05**: The bundle includes a 7-day calendar load as per-day event counts only (never event titles — privacy) and a stalled-goals list reusing `guidance_service.get_stalled_goals()`
- [ ] **EXPORT-06**: Career- and learning-type goals are ordered/flagged first in the bundle so the advisor's attention is steered by the data, not the prompt alone

### Progression Substrate (PROG)

- [ ] **PROG-01**: A weekly APScheduler job (SYNC, `brief.py` pattern) writes one `goal_snapshots` row per active goal — capturing that week's progress_pct, milestones_done, tasks_completed_week, tasks_slipped_week — and survives reboots; the snapshot stores a copy of progress_pct for trend only (live progress_pct remains computed, never overwritten)
- [ ] **PROG-02**: User can trigger an on-demand snapshot from the Sync page without waiting for the weekly job, so trend data exists from first setup

### Advisory Ingest (ADVISE)

- [ ] **ADVISE-01**: The import contract accepts an advisory payload (distinguished by a `payload_type` discriminator, default-compatible with existing payloads) validated against a published schema, returning field-level errors on malformed input; undocumented fields are rejected (`extra="forbid"`)
- [ ] **ADVISE-02**: An advisory payload can adjust goal `target_date` and `priority_rank`, and milestone `target_date`/`done`/`title`, each item carrying a REQUIRED `rationale`; goals matched by `external_key`, milestones by `(goal, title)`
- [ ] **ADVISE-03**: An advisory payload cannot create goals, change goal status/title/type, or modify any task field — these are blocked by schema validation with clear errors
- [ ] **ADVISE-04**: User can preview an advisory payload as a per-item diff (entity, field, old → new value, rationale) with no DB writes
- [ ] **ADVISE-05**: User can confirm and have the accepted advisory changes applied in a single atomic transaction, idempotent on a stable `advisory_id` (AdvisoryLog), stamping `last_advisory_at`
- [ ] **ADVISE-06**: A top-level free-text `notes` field from the advisor is surfaced prominently before confirm and is never written to goal/milestone entities
- [ ] **ADVISE-07**: User can accept/reject individual diff rows and confirm only the accepted subset

### Sync Review UI (SYNC)

- [ ] **SYNC-01**: A dedicated `/advisor` page runs the full loop without navigating away — copy advisor prompt, copy export bundle, paste the LLM's JSON response, preview the diff, confirm — reusing the existing ingest UI patterns (`useIngest`, DiffGroup, error-list)
- [ ] **SYNC-02**: The Sync page shows "last advisor sync: N days ago" and warns (non-blocking) when a pasted payload's `session_id` is stale (>7 days old)

### Advisor Prompt (PROMPT)

- [ ] **PROMPT-01**: User can copy a documented advisor system prompt from the Sync page in one click — role framing (career/engineering advisor for Jack, 4-week horizon, career/learning goals prioritized), explicit in-scope and out-of-scope lists, an auto-generated JSON schema block matching the advisory Pydantic models, an example payload, and `notes`-field guidance

---

## Future / Backlog (post-v2.0)

> Items below were deferred from v1.0 or flagged P3 during v2.0 research; not in the current milestone.

- Energy-aware day planning (peak-hours setting) + automatic buffer blocks between tasks — deferred from v2.0 Organize
- ~~Mid-day re-plan button (re-propose remaining time) — P3~~ → promoted into v2.1 (UPDATE + NOTIF-07)
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
| INGEST-01 | Phase 8 — Goals + Ingest Backend | Complete |
| INGEST-02 | Phase 8 — Goals + Ingest Backend | Complete |
| INGEST-04 | Phase 8 — Goals + Ingest Backend | Complete |
| INGEST-06 | Phase 8 — Goals + Ingest Backend | Complete |
| INGEST-07 | Phase 8 — Goals + Ingest Backend | Complete |
| GOAL-04 | Phase 9 — Goals + Ingest UI | Complete |
| GOAL-05 | Phase 9 — Goals + Ingest UI | Complete |
| INGEST-03 | Phase 9 — Goals + Ingest UI | Complete |
| INGEST-05 | Phase 9 — Goals + Ingest UI | Complete |
| PLAN-01 | Phase 10 — Day Auto-Organize | Complete |
| PLAN-02 | Phase 10 — Day Auto-Organize | Complete |
| GUIDE-01 | Phase 11 — Goal-Guided Guidance | Complete |
| GUIDE-02 | Phase 11 — Goal-Guided Guidance | Complete |
| GUIDE-03 | Phase 11 — Goal-Guided Guidance | Complete |
| UPDATE-02 | Phase 12 — Update Resolution Engine | Complete |
| UPDATE-03 | Phase 12 — Update Resolution Engine | Complete |
| NOTIF-07 | Phase 12 — Update Resolution Engine | Complete |
| INGEST-08 | Phase 12 — Update Resolution Engine | Complete |
| UPDATE-01 | Phase 13 — Update Loop UI | Complete |
| UPDATE-03 | Phase 13 — Update Loop UI | Complete |
| UPDATE-04 | Phase 13 — Update Loop UI | Complete |
| NOTIF-08 | Phase 13 — Update Loop UI | Complete |
| PROG-01 | Phase 14 — Progression Substrate | Pending |
| PROG-02 | Phase 14 — Progression Substrate | Pending |
| EXPORT-01 | Phase 15 — Context Export + Advisor Prompt | Pending |
| EXPORT-02 | Phase 15 — Context Export + Advisor Prompt | Pending |
| EXPORT-03 | Phase 15 — Context Export + Advisor Prompt | Pending |
| EXPORT-04 | Phase 15 — Context Export + Advisor Prompt | Pending |
| EXPORT-05 | Phase 15 — Context Export + Advisor Prompt | Pending |
| EXPORT-06 | Phase 15 — Context Export + Advisor Prompt | Pending |
| PROMPT-01 | Phase 15 — Context Export + Advisor Prompt (schema block updated at end of Phase 16) | Pending |
| ADVISE-01 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| ADVISE-02 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| ADVISE-03 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| ADVISE-04 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| ADVISE-05 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| ADVISE-06 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| ADVISE-07 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| SYNC-01 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
| SYNC-02 | Phase 16 — Advisory Ingest + Sync Review UI | Pending |
