# Roadmap — My Secretary

## Overview

16 phases | 70 requirements | Infrastructure → Task UI → Reminders → Calendar Sync → Routines/Brief → Google Home TTS → Goals+Ingest Backend → Goals+Ingest UI → Day Organize → Guidance → v2.1 Update Engine → v2.1 Update Loop UI → v2.2 Progression Substrate → v2.2 Context Export + Advisor Prompt → v2.2 Advisory Ingest + Sync Review UI

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
| 10 | Day Auto-Organize | 4/4 | Complete   | 2026-06-17 |
| 11 | Goal-Guided Guidance | 2/4 | Complete    | 2026-06-18 |
| 12 | Update Resolution Engine | 4/4 | Complete    | 2026-06-22 |
| 13 | Update Loop UI | 3/4 | In Progress|  |
| 14 | Progression Substrate | Goal progress history accumulates automatically; trend data exists before export is built | PROG-01, PROG-02 | 3 |
| 15 | Context Export + Advisor Prompt | User can copy a rich LLM advisory brief and advisor system prompt in one action from a new Sync page | EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06, PROMPT-01 | 4 |
| 16 | Advisory Ingest + Sync Review UI | User can paste an LLM advisory response, preview a rationale-annotated diff, and confirm goal/milestone adjustments atomically | ADVISE-01, ADVISE-02, ADVISE-03, ADVISE-04, ADVISE-05, ADVISE-06, ADVISE-07, SYNC-01, SYNC-02 | 5 |

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

<details>
<summary>✅ <strong>v2.0 — Ingest, Organize, Guide</strong> (Phases 8–11) — SHIPPED 2026-06-23</summary>

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
- [x] 09-03-PLAN.md — Goals page + GoalDrawer: list, detail, milestones, linked tasks (Wave 2)
- [x] 09-04-PLAN.md — Drawer goal linking + Ingest page (prompt/paste/upload/preview/confirm) (Wave 2)
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
**Plans:** 4/4 plans complete

Plans:
- [x] 10-01-PLAN.md — Wave 0 tests + ScheduledBlock model + plan schemas + AppSettings work-hours + migration 0009 (Wave 1)
- [x] 10-02-PLAN.md — Pure planner_service.propose_day_plan (gap-find + first-fit + tiered ordering) (Wave 2)
- [x] 10-03-PLAN.md — Plan router: propose/approve/replan/blocks/delete + staleness + main.py wiring (Wave 3)
- [x] 10-04-PLAN.md — Frontend: usePlan/useWorkHours, Organize page, Today staleness badge, Settings work-hours, nav/route (Wave 4)
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
**Plans:** 4/4 plans complete

Plans:
- [x] 11-01-PLAN.md — Migration 0010 (completed_at + stall settings) + stamp + stall-threshold API + Wave 0 tests (Wave 1)
- [x] 11-02-PLAN.md — guidance_service stall nudge + brief goal snapshot + stall_check job (GUIDE-01, GUIDE-03) (Wave 2)
- [ ] 11-03-PLAN.md — GET /guidance/next-best-task scoring endpoint (GUIDE-02) (Wave 2)
- [x] 11-04-PLAN.md — Today Focus banner + Settings stall-threshold field + checkpoint (GUIDE-02, GUIDE-03) (Wave 3)
**UI hint**: yes

</details>

---

## v2.1 Phases — Close the Loop

> Phases continue at 12. Requirements: UPDATE-01..04, NOTIF-07..08, INGEST-08 (7 total). Hard constraints: no new dependencies, no server-side LLM, minimize API/token cost.

---

### Phase 12: Update Resolution Engine
**Goal:** The backend can receive a free-text progress update, resolve it to a concrete action (mark done / reschedule / drop) by fuzzy-matching today's scheduled blocks and tasks without any LLM call, and fire a configurable mid-day check-in notification that survives reboots.
**Depends on:** Phase 10 (ScheduledBlock rows, plan router), Phase 11 (completed_at stamp)
**Requirements:** UPDATE-02, UPDATE-03, NOTIF-07, INGEST-08
**Success Criteria** (what must be TRUE):
1. Posting a free-text update that clearly names a task or block causes the backend to return a resolved action (done/reschedule/drop) with the matched entity — no LLM call made, verified by absence of any external HTTP request in tests.
2. Posting an update that is ambiguous (multiple plausible matches) or matches nothing returns an `ambiguous` or `no_match` status with candidate list, never silently applying an action or dropping the input.
3. A mid-day check-in Pushover notification fires at the configured time (default 12:00) with a deep-link URL into the Today update view; the job is registered via APScheduler SQLAlchemyJobStore and survives a Pi reboot.
4. The existing ingest endpoint accepts an `intra_day_update` payload type — validated against a versioned Pydantic schema — and applies it idempotently; posting the same update payload twice produces no double-mutation.
**Plans:** 4/4 plans complete

Plans:
- [x] 12-01-PLAN.md — Wave 0: rapidfuzz dep + schema/service stubs + migration 0015 (check-in cols + update_log) + main wiring + 10 red tests (Wave 1)
- [x] 12-02-PLAN.md — Resolution engine: resolve_update (WRatio + intent) + POST /updates/resolve (UPDATE-02, UPDATE-03) (Wave 2)
- [x] 12-03-PLAN.md — Check-in scheduler: PushoverClient url + checkin_service + schedule_checkin + /settings/check-in-time (NOTIF-07) (Wave 2)
- [x] 12-04-PLAN.md — Ingest extension: IntraDayUpdateImport + idempotent apply (done/drop stateless, reschedule via UpdateLog) (INGEST-08) (Wave 2)
**UI hint**: no

---

### Phase 13: Update Loop UI
**Goal:** User can log progress in seconds from the Today tab, see ambiguous matches to confirm, review what slipped at end of day, and toggle/schedule the check-in notification from Settings — all without leaving the app.
**Depends on:** Phase 12 (update resolution API, check-in scheduler API)
**Requirements:** UPDATE-01, UPDATE-03, UPDATE-04, NOTIF-08
**Success Criteria** (what must be TRUE):
1. A quick-update text box is visible on the Today tab; the user can type (or use phone keyboard dictation) and submit a free-text update without opening any task form; the result is reflected in the Today view immediately.
2. When the backend returns an ambiguous or no-match status, the user sees the candidate list and can confirm the correct match or dismiss — the update is never silently dropped.
3. After the end of the current work day, the Today tab shows a rollup card listing completed vs. slipped items; unfinished items appear in the next day's brief and plan via the existing rollover path.
4. From Settings, the user can enable/disable the mid-day check-in and change its time(s); the new schedule takes effect without a server restart and persists across reboots.
**Plans:** 3/4 plans executed

Plans:
- [x] 13-01-PLAN.md — Wave 0 pure-lib stubs + tests: isAfterWorkHours + deriveRollup (UPDATE-01, UPDATE-04)
- [x] 13-02-PLAN.md — Backend: resolver apply-step + confirmed_id path + check_in_enabled migration 0016 (UPDATE-01, UPDATE-03, NOTIF-08)
- [x] 13-03-PLAN.md — Today quick-update box + CandidateCard + rollup card + CSS (UPDATE-01, UPDATE-03, UPDATE-04)
- [ ] 13-04-PLAN.md — useCheckInSettings + Settings check-in section + golden-path checkpoint (NOTIF-08)
**UI hint**: yes

---

## v2.2 Phases — LLM Advisory Loop

> Phases continue at 14. Requirements: EXPORT-01..06, PROG-01..02, ADVISE-01..07, SYNC-01..02, PROMPT-01 (18 total). Hard constraints (locked since v2.0): no new dependencies, no server-side LLM, minimize token cost. Migration HEAD entering this milestone: 0016 → new migrations 0017 then 0018.
>
> **PROMPT-01 placement note:** The advisor prompt (`advisorPrompt.ts`) is delivered in Phase 15 with a placeholder schema block. The schema block is regenerated from `AdvisoryPayload.model_json_schema()` at the end of Phase 16 once the advisory Pydantic models are finalized. Plan-phase 15 must call this out explicitly so Phase 16 does not re-open Phase 15 scope.

---

### Phase 14: Progression Substrate
**Goal:** Goal progress history accumulates automatically each week so that trend data exists before the export or advisory UI is built.
**Depends on:** Phase 8 (Goal, Milestone, Task models), Phase 11 (completed_at stamp, guidance_service.py sync pattern)
**Requirements:** PROG-01, PROG-02
**Success Criteria** (what must be TRUE):
1. After the weekly APScheduler job fires, one `goal_progress_snapshots` row per active goal exists in the DB, capturing that week's `progress_pct`, `milestones_done`, `tasks_completed_week`, and `tasks_slipped_week`; firing the job twice on the same day produces no duplicate rows (idempotent via UNIQUE index on `(goal_id, snapshotted_on)`).
2. The snapshot job is a plain sync function (no `async def`, no `await`) following the `brief.py` / `guidance_service.py` pattern — verified by the test running it directly and asserting no `asyncio` event loop is touched.
3. User can trigger an on-demand snapshot from the `/advisor` Sync page (via `POST /api/v1/export/snapshot`) without waiting for the weekly job, so trend data accumulates from first setup.
**Plans:** TBD
**UI hint**: no

---

### Phase 15: Context Export + Advisor Prompt
**Goal:** User can copy a complete, token-budgeted LLM advisory brief and a documented advisor system prompt in one action from the Sync page, enabling the outbound half of the advisory loop without waiting for Phase 16.
**Depends on:** Phase 14 (goal_progress_snapshots rows for trend section; degrades to `no_data` if absent), Phase 11 (guidance_service.get_stalled_goals()), Phase 10 (ScheduledBlock for planned-vs-actual)
**Requirements:** EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06, PROMPT-01
**Note on PROMPT-01:** The advisor prompt is delivered here with a placeholder `[SCHEMA BLOCK]` in place of the auto-generated advisory JSON schema. The schema block is regenerated from `AdvisoryPayload.model_json_schema()` at the end of Phase 16. Plan-phase 15 must flag this as a known one-line update deferred to Phase 16.
**Success Criteria** (what must be TRUE):
1. User can tap one button on the Sync page (`/advisor`) and have the complete advisor brief copied to the clipboard, ready to paste into an external LLM; the bundle header contains `generated_at` and a `session_id`.
2. The exported bundle lists each active goal with title, type, target date and days remaining, live-computed `progress_pct`, a milestone list, top-3 active tasks (title/priority/due date), overdue task count, a 4-week progress trend array with velocity label (`accelerating` / `steady` / `stalling` / `no_data`), and career/learning-type goals ordered first.
3. The bundle includes a 14-day planned-vs-actual block summary (blocks planned / completed / slipped from `ScheduledBlock`), a 7-day calendar load as per-day event counts only (no event titles), and a stalled-goals list reusing `guidance_service.get_stalled_goals()`.
4. User can copy the advisor system prompt from the Sync page in one click — role framing, scope/out-of-scope list, placeholder JSON schema block, example payload, and `notes`-field guidance — before copying the export bundle.
**Plans:** TBD
**UI hint**: yes

---

### Phase 16: Advisory Ingest + Sync Review UI
**Goal:** User can paste an LLM advisory JSON response into the Sync page, preview a per-item diff with rationale, accept or reject individual rows, and confirm the accepted subset — applied atomically and idempotently — closing the full advisory loop.
**Depends on:** Phase 14 (migration 0017 in place), Phase 15 (Sync page shell, useExport hook, advisorPrompt.ts placeholder)
**Requirements:** ADVISE-01, ADVISE-02, ADVISE-03, ADVISE-04, ADVISE-05, ADVISE-06, ADVISE-07, SYNC-01, SYNC-02
**Note on PROMPT-01 update:** This phase finalizes `AdvisoryPayload` and its nested models. The last plan of this phase regenerates the schema block in `advisorPrompt.ts` from `AdvisoryPayload.model_json_schema()`, completing PROMPT-01.
**Critical correctness gates (must be in plan):**
- `await session.flush()` + `goal_key_to_id` map helper shared with `apply_import` (no fork)
- `advisory_id` idempotency via `AdvisoryLog` table (migration 0018, mirrors `UpdateLog` pattern)
- Backward-compat regression test: existing `payload_type="standard"` / `schema_version 1.x` payloads still validate
- `rationale: str` required (non-null) on every `GoalAdjustment` and `MilestoneAdjustment`
- CI / grep guard: `grep -r "anthropic\|openai\|litellm" backend/app/` must return zero
**Success Criteria** (what must be TRUE):
1. User can paste an LLM advisory JSON payload into the Sync page and see a per-item diff — entity, field, old value, new value, rationale — with no DB writes; an advisory payload that omits `rationale` on any item, references an unknown `external_key`, or includes fields outside the advisory schema (goal status/title/type, task fields) is rejected at validation with field-level 422 errors.
2. User can accept or reject individual diff rows; clicking Confirm applies only the accepted subset in a single atomic transaction — injecting a DB error mid-apply leaves zero changes persisted.
3. Confirmed advisory changes are idempotent on a stable `advisory_id`: confirming the same advisory payload a second time returns the original result with no duplicate rows or milestone entries.
4. Goal target dates and priority ranks adjusted by the advisory are visible in the Goals view immediately after confirm; the advisor's free-text `notes` field is displayed prominently on the Sync page before confirm and is never written to goal or milestone entities.
5. The Sync page shows "last advisor sync: N days ago" (reads `AppSettings.last_advisory_at` stamped on confirm) and displays a non-blocking warning when a pasted payload's `session_id` is older than 7 days.
**Plans:** TBD
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
| 12. Update Resolution Engine | 0/? | Not started | - |
| 13. Update Loop UI | 0/? | Not started | - |
| 14. Progression Substrate | 0/? | Not started | - |
| 15. Context Export + Advisor Prompt | 0/? | Not started | - |
| 16. Advisory Ingest + Sync Review UI | 0/? | Not started | - |
