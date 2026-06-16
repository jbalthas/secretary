# Roadmap — My Secretary

## Overview

10 phases | 45 requirements | Infrastructure → Task UI → Reminders → Calendar Sync → Routines/Brief → Google Home TTS → Goals+Ingest Backend → Goals+Ingest UI → Day Organize → Guidance

---

## Phase Summary Table

| # | Phase | Goal | Requirements | Criteria |
|---|-------|------|--------------|----------|
| 1 | Foundation | Pi is fully configured, reachable remotely, backend running | INFRA-01–07 | 4 |
| 2 | Tasks & Agenda | 5/5 | Complete   | 2026-06-13 |
| 3 | Pushover Reminders | 3/3 | Complete   | 2026-06-13 |
| 4 | Calendar Sync | 4/4 | Complete   | 2026-06-15 |
| 5 | Daily Brief & Routines | Morning brief fires proactively; custom routines persist | CAL-06, CAL-07 | 3 |
| 6 | Google Home TTS | 3/4 | In Progress|  |
| 7 | Outlook Calendar ICS feed integration | TBD | TBD | TBD |
| 8 | Goals + Ingest Backend | 4/4 | Complete   | 2026-06-16 |
| 9 | Goals + Ingest UI | User can manage goals, link tasks, and submit LLM payloads from the web UI | GOAL-04, GOAL-05, INGEST-03, INGEST-05 | 4 |
| 10 | Day Auto-Organize | User can get and approve a proposed day plan built around calendar events | PLAN-01, PLAN-02 | 4 |
| 11 | Goal-Guided Guidance | Daily brief includes goal progress; today view surfaces next-best-task; stalled goals trigger nudges | GUIDE-01, GUIDE-02, GUIDE-03 | 3 |

---

## Phase Details

### Phase 1: Foundation
**Goal:** The Pi is fully provisioned, the backend is reachable over Tailscale from any device, and the service survives reboots.
**Requirements:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Gate test:** `curl https://secretary.ts.net/api/v1/health` returns HTTP 200 from a phone on LTE (not home Wi-Fi).
**Success Criteria:**
1. Health endpoint returns 200 from a phone on a mobile network via Tailscale.
2. Rebooting the Pi causes the service to come back up within 60 seconds without manual intervention.
3. nginx serves the (placeholder) React app over HTTPS at the Tailscale hostname.
4. A fresh Pi can be bootstrapped end-to-end by running the setup script with minimal manual steps.
**Plans:** 4 plans
- [x] 01-01-PLAN.md — FastAPI health endpoint + async SQLite (WAL) + Alembic (INFRA-02, INFRA-06)
- [x] 01-02-PLAN.md — Pi provisioning script (uv/Python 3.12) + placeholder React app (INFRA-01)
- [x] 01-03-PLAN.md — Tailscale HTTPS + systemd service + nginx reverse proxy (INFRA-03, INFRA-04, INFRA-05)
- [ ] 01-PLAN-bootstrap-smoketest.md — End-to-end bootstrap script + reboot/remote smoke test (INFRA-07)
**UI hint**: no

---

### Phase 2: Tasks & Agenda
**Goal:** User can create, edit, complete, and delete tasks from the web UI, and see today's tasks merged with any placeholder calendar events.
**Requirements:** TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, CAL-05
**Gate test:** On a phone browser, create a task with a due date, mark it complete, then verify the today's agenda view shows and hides it correctly.
**Success Criteria:**
1. User can create a task with title, description, due date, and priority from the web UI on a phone browser.
2. User can edit any field of a task, mark it complete, and delete it.
3. User can set a reminder time on a task (notification delivery validated in Phase 3).
4. User can create a recurring task (daily, weekly, or custom cron) and see it re-appear after completion.
5. Task list can be filtered by pending/completed and sorted by due date or priority.
**Plans:** 5/5 plans complete
- [x] 02-01-PLAN.md — Test scaffold + Vite proxy + Task TS contract (Wave 0)
- [x] 02-02-PLAN.md — Backend: Task model, migration, CRUD router (Wave 1)
- [x] 02-03-PLAN.md — Frontend SPA shell: router, bottom nav, useTasks, theme (Wave 1)
- [x] 02-04-PLAN.md — Tasks page: rows, drawer form, FAB, filter/sort (Wave 2)
- [x] 02-05-PLAN.md — Today agenda: merge logic + view (Wave 2)
**UI hint**: yes

---

### Phase 3: Pushover Reminders
**Goal:** Task reminders fire as Pushover push notifications at the scheduled time, reliably, including after Pi reboots.
**Requirements:** NOTIF-01, NOTIF-02
**Gate test:** Create a task with a reminder 2 minutes in the future, reboot the Pi, confirm the Pushover notification arrives at the correct time.
**Success Criteria:**
1. A Pushover notification arrives on the user's phone within 60 seconds of a task's reminder time.
2. Reminders scheduled before a Pi reboot still fire correctly after the Pi comes back up.
3. No duplicate notifications fire when the service restarts (APScheduler dedup guard in place).
**Plans:** 3/3 plans complete
- [x] 03-01-PLAN.md — Wave 0: Pushover config + failing scheduler/Pushover unit tests (NOTIF-01, NOTIF-02)
- [x] 03-02-PLAN.md — PushoverClient + APScheduler singleton + lifespan wiring (NOTIF-01, NOTIF-02)
- [x] 03-03-PLAN.md — Task router reminder integration + lifecycle tests (NOTIF-01)
**UI hint**: no

---

### Phase 4: Calendar Sync
**Goal:** Google Calendar events sync into the app automatically; OAuth tokens stay alive; the user is alerted if tokens expire.
**Requirements:** CAL-01, CAL-02, CAL-03, CAL-04
**Gate test:** Create a Google Calendar event on a phone, wait 5 minutes, confirm the event appears in the app's agenda view without any manual refresh.
**Success Criteria:**
1. User completes the Google OAuth flow in the web UI and the app stores and auto-refreshes the token.
2. A new Google Calendar event appears in the app within 5 minutes of creation.
3. If Google returns HTTP 410 (sync token invalid), the app performs a full re-sync without user intervention.
4. If the OAuth token is revoked, the user receives a Pushover alert within the next sync cycle.
**Plans**: TBD
**UI hint**: yes

---

### Phase 5: Daily Brief & Routines
**Goal:** A morning brief fires automatically at a configurable time with today's agenda; users can define custom recurring routines that survive reboots.
**Requirements:** CAL-06, CAL-07
**Gate test:** Set the daily brief time to 2 minutes from now; confirm a Pushover notification arrives with today's task and event summary.
**Success Criteria:**
1. A Pushover notification with today's agenda summary arrives at the user-configured brief time (default 8am).
2. The brief time is configurable from the web UI without editing config files.
3. User can create, edit, and delete custom recurring routines (name, cron schedule, action); routines persist and fire correctly after a Pi reboot.
**Plans**: TBD
**UI hint**: yes

---

### Phase 6: Google Home TTS
**Goal:** Reminders and the daily brief announce on the Google Home speaker in addition to Pushover; user can trigger ad-hoc TTS from the web UI; Google Home morning routine can trigger the brief.
**Requirements:** NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06
**Gate test:** Trigger `POST /api/v1/tts` with a test message and hear it play on the Google Home speaker within 10 seconds.
**Success Criteria:**
1. Submitting a message via the web UI causes the Google Home speaker to speak that message aloud.
2. When a task reminder fires, the announcement plays on Google Home in addition to the Pushover notification.
3. The daily brief plays on Google Home at brief time in addition to the Pushover notification.
4. Triggering the Google Home morning routine calls the Pi webhook and causes the daily brief to fire.
**Plans:** 4/4 plans complete
- [x] 06-01-PLAN.md — Wave 0: config + tts_enabled migration + .env/.gitignore + all failing tests (NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06)
- [x] 06-02-PLAN.md — TTSClient service + StaticFiles mount + /tts, /settings/tts, /webhooks/brief router (NOTIF-03, NOTIF-06)
- [x] 06-03-PLAN.md — build_brief_speech + reminder/brief TTS hooks (best-effort, tts_enabled-gated) (NOTIF-04, NOTIF-05)
- [ ] 06-04-PLAN.md — Frontend Google Home card + useGoogleHome hook + hardware gate checkpoint (NOTIF-03)
**UI hint**: yes

### Phase 7: Outlook Calendar ICS feed integration

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 7 to break down)

---

## v2.0 Phases — Ingest, Organize, Guide

> Phases start at 8 (Phase 7 Outlook ICS is a separate concurrent effort). Requirements: INGEST-01..07, GOAL-01..06, PLAN-01..02, GUIDE-01..03 (18 total).

---

### Phase 8: Goals + Ingest Backend
**Goal:** Goals, milestones, and habits exist as first-class DB entities; the versioned import contract is live; the ingest endpoint validates, previews, and commits LLM payloads atomically and idempotently.
**Depends on:** Phase 6 (existing Task/Routine models + notification infrastructure)
**Requirements:** GOAL-01, GOAL-02, GOAL-03, GOAL-06, INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07
**Success Criteria** (what must be TRUE):
1. User can create, edit, and archive a goal with title, type, description, and optional target date via the API; archiving preserves the goal in history without hard-deleting it.
2. A goal's progress percentage is returned on every read, computed live from its linked tasks' completion ratio; milestones are listed and their completion is reflected in the detail response.
3. Completing a milestone triggers a Pushover notification and Google Home TTS announcement reusing existing notification infrastructure.
4. `POST /api/v1/ingest/confirm` writes goals, then tasks, then routines in a single transaction — injecting a failure mid-commit leaves zero new rows; re-posting the same payload is idempotent (no duplicate entities created, matched via `external_key`).
5. `GET /api/v1/ingest/schema` returns the versioned JSON schema; posting a payload with a mismatched `schema_version` or extra fields returns HTTP 422 with field-level error detail.
**Plans:** 4/4 plans complete

Plans:
- [x] 08-01-PLAN.md — Wave 0 test stubs (test_goals.py + test_ingest.py, all 20 named tests, red)
- [x] 08-02-PLAN.md — Goal/Milestone models + Task/Routine columns + FK pragma + migrations 0006/0007/0008
- [x] 08-03-PLAN.md — Goals CRUD + live progress + milestone CRUD + celebrations (GOAL-01/02/03/06)
- [x] 08-04-PLAN.md — Versioned, validating, atomic, idempotent ingest endpoint (INGEST-01/02/04/06/07)
**UI hint**: no

---

### Phase 9: Goals + Ingest UI
**Goal:** User can manage goals and link tasks from the web UI, and submit an LLM payload by pasting JSON or uploading a file, preview what will be created, then confirm.
**Depends on:** Phase 8
**Requirements:** GOAL-04, GOAL-05, INGEST-03, INGEST-05
**Success Criteria** (what must be TRUE):
1. User can open a Goals page that lists all active goals with their progress percentages; drilling into a goal shows its milestones, linked tasks, and progress detail.
2. User can link a task to a goal from the task edit form (goal dropdown); the link is reflected immediately in the goal detail view.
3. User can paste a JSON payload into a textarea or upload a `.json` file in the Ingest page and trigger a dry-run preview showing counts and per-entity diff before anything is written.
4. User can click Confirm on the preview and see the new goals/tasks/routines appear in the app; the Confirm button is disabled on submit to prevent double-commit.
**Plans:** 4 plans

Plans:
- [x] 09-01-PLAN.md — Backend: ingest preview endpoint + routine goal_id schema + Wave 0 tests (Wave 1)
- [x] 09-02-PLAN.md — Frontend foundation: goal types, useGoals, GoalSelect, BottomNav tab, routes, CSS (Wave 1)
- [ ] 09-03-PLAN.md — Goals page + GoalDrawer: list, detail, milestones, linked tasks (Wave 2)
- [ ] 09-04-PLAN.md — Drawer goal linking + Ingest page (prompt/paste/upload/preview/confirm) (Wave 2)
**UI hint**: yes

---

### Phase 10: Day Auto-Organize
**Goal:** User can request a proposed day plan that fills free time around calendar events with prioritized tasks, review and edit the proposal, then approve it — at which point the plan is stored locally and shown in Today.
**Depends on:** Phase 8 (Task.estimated_minutes from migration 0007; Goal entity for urgency scoring)
**Requirements:** PLAN-01, PLAN-02
**Success Criteria** (what must be TRUE):
1. Requesting a plan for today returns proposed blocks that fit only within free time between existing calendar events; all-day events are treated as context, not time blockers.
2. Proposed blocks are sized from `estimated_minutes` (default 30 if unset) and ordered by priority then due-date proximity; the planner never auto-commits — `GET /plan/propose` writes nothing to the DB.
3. User can remove, reorder, or adjust proposed blocks before approving; clicking Approve once commits the plan; a second Approve for the same date is rejected (idempotent, not duplicated).
4. Approved plan blocks appear in the Today view alongside calendar events and tasks; if a calendar event is added after approval and overlaps an approved block, a staleness warning is shown.
**Plans**: TBD
**UI hint**: yes

---

### Phase 11: Goal-Guided Guidance
**Goal:** The secretary proactively surfaces goal progress — in the daily brief, in the Today view, and as a stall-detection nudge — without becoming notification noise.
**Depends on:** Phase 8 (Goals entity + progress), Phase 9 (Goals UI visible)
**Requirements:** GUIDE-01, GUIDE-02, GUIDE-03
**Success Criteria** (what must be TRUE):
1. The daily brief includes a goal snapshot section listing each active goal's progress percentage and the single most-urgent task linked to it.
2. The Today view displays a "next best task" — the highest-scoring pending task by priority × goal urgency × due-date proximity — surfaced above the agenda.
3. If a goal has had no task completions for a configurable threshold (default 7 days), the user receives a Pushover nudge; no more than one guidance-type notification fires per day across all guidance paths.
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/4 | In progress | - |
| 2. Tasks & Agenda | 5/5 | Complete | 2026-06-13 |
| 3. Pushover Reminders | 3/3 | Complete | 2026-06-13 |
| 4. Calendar Sync | 0/? | Not started | - |
| 5. Daily Brief & Routines | 0/? | Not started | - |
| 6. Google Home TTS | 3/4 | In progress | - |
| 7. Outlook Calendar ICS | 0/? | Not started | - |
| 8. Goals + Ingest Backend | 0/? | Not started | - |
| 9. Goals + Ingest UI | 0/? | Not started | - |
| 10. Day Auto-Organize | 0/? | Not started | - |
| 11. Goal-Guided Guidance | 0/? | Not started | - |
