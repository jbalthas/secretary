---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: LLM Advisory Loop
status: planning
last_updated: "2026-06-29T18:38:37.750Z"
last_activity: 2026-06-29 - Phase 15 context gathered
progress:
  total_phases: 16
  completed_phases: 9
  total_plans: 36
  completed_plans: 35
---

# Project State

## Current Position

Phase: Phase 14 - Progression Substrate (implementation complete)
Plan: 2 of 2 complete
Status: Phase 15 context gathered; ready to plan Phase 15
Last activity: 2026-06-29 - Phase 15 context gathered (CONTEXT.md written)

> **v2.1 carry-over:** Phase 13 (update-loop-ui) left at plan 4 of 4 — Quick-update capture box + End-of-day rollup unfinished. Intentionally deferred at v2.2 start; resume separately if/when wanted.

---

## Project Reference

**Core value:** One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

**Current focus:** Milestone v2.2 — LLM Advisory Loop (Phase 15: Context Export + Advisor Prompt)

---

## v2.0 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 8 | Goals + Ingest Backend | GOAL-01, GOAL-02, GOAL-03, GOAL-06, INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07 | Complete |
| 9 | Goals + Ingest UI | GOAL-04, GOAL-05, INGEST-03, INGEST-05 | Complete |
| 10 | Day Auto-Organize | PLAN-01, PLAN-02 | Complete |
| 11 | Goal-Guided Guidance | GUIDE-01, GUIDE-02, GUIDE-03 | Complete |

---

## v2.1 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 12 | Update Resolution Engine | UPDATE-02, UPDATE-03, NOTIF-07, INGEST-08 | Complete |
| 13 | Update Loop UI | UPDATE-01, UPDATE-03, UPDATE-04, NOTIF-08 | In Progress (plan 4/4 pending) |

---

## v2.2 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 14 | Progression Substrate | PROG-01, PROG-02 | Not started |
| 15 | Context Export + Advisor Prompt | EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06, PROMPT-01 | Not started |
| 16 | Advisory Ingest + Sync Review UI | ADVISE-01, ADVISE-02, ADVISE-03, ADVISE-04, ADVISE-05, ADVISE-06, ADVISE-07, SYNC-01, SYNC-02 | Not started |

---

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: Outlook Calendar ICS feed integration (separate concurrent effort, do not modify)
- Phases 8–11 added: v2.0 Ingest, Organize, Guide (2026-06-15)
- Phases 12–13 added: v2.1 Close the Loop (2026-06-22)
- Phases 14–16 added: v2.2 LLM Advisory Loop (2026-06-29)

### v2.2 Key Architectural Decisions (from research)

- **No new dependencies** — zero new Python packages or npm packages; stdlib + existing Pydantic v2 + existing React patterns cover all 18 requirements
- **Migration chain** — Alembic HEAD is 0016; Phase 14 adds 0017 (goal_progress_snapshots + UNIQUE index + retention cleanup job); Phase 16 adds 0018 (advisory_rationale TEXT NULL on goals + advisory_log table); write both migrations before `alembic upgrade head`
- **Sync/async boundary** — snapshot_service.py MUST be sync (create_engine + sessionmaker, same brief.py pattern); export_service.py is async (FastAPI route only); advisory ingest functions are async (extend existing ingest_service.py)
- **payload_type discriminator** — `payload_type: Literal["standard"] = "standard"` added to IngestPayload (default preserves backward compat); `AdvisoryPayload` has `payload_type: Literal["advisory"]` as required field; no schema_version bump for advisory
- **Advisory scope** — advisory payload writes ONLY to Goal.target_date, Goal.priority_rank, Milestone.target_date, Milestone.done (forward-only), Milestone.title; goal creation/status/title/type and all task fields are blocked by schema omission + extra="forbid"
- **advisory_id idempotency** — AdvisoryLog table (migration 0018) mirrors UpdateLog pattern; advisory payload carries advisory_id; confirm checks AdvisoryLog before applying
- **session.flush() guard** — _apply_advisory() must call await session.flush() after goal upserts, then build goal_key_to_id map; extract as shared _flush_and_build_goal_map() helper reused by both apply_import and _apply_advisory
- **rationale required** — rationale: str (not Optional) on every GoalAdjustment and MilestoneAdjustment; validation rejects advisory payloads where any item omits rationale
- **PROMPT-01 placeholder** — advisorPrompt.ts delivered in Phase 15 with placeholder schema block; schema block regenerated from AdvisoryPayload.model_json_schema() at end of Phase 16; plan-phase 15 must call this out
- **No server-side LLM** — CI guard: grep -r "anthropic\|openai\|litellm" backend/app/ must return zero; this is a locked hard constraint, not a preference

### Decisions Made (prior milestones — preserved)

- APScheduler 3.x (not 4.x alpha) — SQLAlchemyJobStore for persistence, AsyncIOScheduler for FastAPI event loop compatibility
- Single uvicorn worker only — multiple workers cause duplicate APScheduler fires
- WAL mode + busy_timeout=5000 set at SQLite startup
- Always use `id=` + `replace_existing=True` on every APScheduler job
- pychromecast: use static DHCP reservation + `known_hosts=[<ip>]` to bypass mDNS issues post-reboot
- gTTS requires internet — cache by text hash; pre-generate static MP3s for common phrases as fallback
- systemd: `After=network-online.target time-sync.target tailscaled.service`
- [01-01] uv as package manager with hatchling build backend; packages=["app"] for editable install
- [01-01] Alembic env.py derives sync URL by stripping +aiosqlite from settings.database_url
- [01-02] @vitejs/plugin-react ^6 required for Vite 8 (v4 peer constraint excludes Vite 8)
- [Phase 02-tasks-agenda]: Sync TestClient (not async) for test stubs — mirrors existing test_health.py pattern
- [Phase 02-tasks-agenda]: exclude_unset=True on PATCH prevents partial updates from resetting unset optional fields
- [Phase 02-03]: NavLink style callback used for isActive; types/task.ts created in 02-03 since 02-01 ran in parallel
- [02-05]: buildAgenda accepts injectable `now` for deterministic tests; all-day = T00:00:00; PLACEHOLDER_EVENTS named export for Phase 4 swap
- [Phase 03-02]: Sync httpx.Client in PushoverClient.send — APScheduler 3.x runs jobs in thread pool, not async
- [Phase 03-02]: Deferred PushoverClient import in _send_reminder prevents circular import at scheduler module load
- [03-03]: update_task checks task.completed after DB refresh to branch between remove_reminder and upsert_reminder
- [03-03]: Monkeypatch at app.routers.tasks.<helper> (not app.scheduler) for router-level test isolation
- [Phase 06-01]: Plan 02 must import TTSClient at module top (not deferred) in routers/tts.py, scheduler.py, brief.py to keep patch targets stable
- [Phase 06-01]: Plan 03 must expose get_tts_enabled() in app/services/tts_settings.py as the single tts_enabled flag seam
- [Phase 06-01]: Plan 02 must export CACHE_DIR as module-level Path from app/services/tts.py; MP3 cache naming: sha256(text)[:16].mp3
- [Phase 06-02]: Webhook must be in routers/webhooks.py (not tts.py) — test patch targets app.routers.webhooks.send_daily_brief are authoritative
- [Phase 06-02]: tts_settings.py created in Plan 02 ahead of Plan 03 — test_tts_endpoint_disabled requires the seam to exist immediately
- [Phase 06-02]: TTSClient logs warning (not raises) when no cast device found — test_tts_client_caches_mp3 asserts MP3 exists regardless of cast availability
- [Phase 06-google-home-tts]: Use module-ref import (import ... as _tts_settings) for get_tts_enabled() in scheduler.py and brief.py — direct function import bypasses unittest.mock patch on the source module attribute
- [Phase 04-calendar-sync]: Settings.tsx left untouched (phases 5/6 inline-style pattern preserved); .settings-card CSS not added
- [Phase 04-04]: agenda.test.ts updated to buildAgenda(tasks,events,now) 3-arg signature; PLACEHOLDER_EVENTS tests removed
- [v2.0 roadmap]: guidance_service.py must be SYNC (same create_engine+sessionmaker pattern as brief.py) — async-in-thread-pool deadlocks under APScheduler
- [v2.0 roadmap]: Migration chain from HEAD 0005: 0006 goals → 0007 task FK+estimated_minutes → 0008 routine FK → 0009 scheduled_blocks; write all four before alembic upgrade head
- [v2.0 roadmap]: Ingest is stateless preview-then-commit — client resends full payload on confirm; no server-side pending state; _resolve() shared between preview and confirm to prevent drift
- [v2.0 roadmap]: Match ingest entities on external_key (stable LLM slug), never on title; external_key is nullable so manually-created records omit it
- [v2.0 roadmap]: Planner is a pure deterministic function (no DB write); only POST /plan/approve writes ScheduledBlock rows; delete-then-insert for date_key on approve (idempotent)
- [v2.0 roadmap]: Habit maps to a recurring Task with a habit flag (not its own table) for v2.0; separate Habit table deferred to v3
- [Phase 07]: [07-02] UID domain stripped + UtcDateTime TypeDecorator added so SQLite reads start_dt/end_dt back UTC tz-aware; Outlook sync on separate 5-min job id
- [Phase 08]: Wave 0 TDD: defer ingest_service import inside test body to keep test_ingest.py collectable before service module exists
- [Phase 08-02]: GoalStatus uses status enum (active|archived|completed) per D-13, overriding the archived:bool in ARCHITECTURE.md draft
- [Phase 08-02]: lazy=selectin mandatory on all Goal/Milestone relationships (prevents MissingGreenlet in async SQLAlchemy); batch_alter_table required for SQLite ALTER on existing tables
- [Phase 08]: celebrate functions are SYNC (not async) — PushoverClient/TTSClient are sync; call via run_in_threadpool from async route (D-10/D-11)
- [Phase 08]: progress_pct never stored; computed via two aggregate SQL queries (Tasks+Milestones by goal_id) on every GoalRead (D-02)
- [Phase 08-goals-ingest-backend]: TestClient(raise_server_exceptions=False) required in test_ingest.py so monkeypatched RuntimeError yields HTTP 500 instead of propagating
- [Phase 08-goals-ingest-backend]: external_key added to TaskRead so ingest tests can verify external_key is returned in GET /tasks/ responses
- [Phase 09]: [09-01] Ingest preview is a read-only dry-run (_exists helper, no begin/flush/commit); shares external_key SELECT shape with apply_import to prevent drift
- [Phase 09]: [09-01] EntityDiff.title maps RoutineImport.name; habits previewed as Task rows on Task.external_key
- [Phase 09]: [09-01] Routine goal_id needs no router change — model_dump()+setattr loop already pass it; column from migration 0008
- [Phase 09]: [09-02] GoalSelect prop-driven (parent owns useGoals) to avoid double-fetch; routine goal_id typed number|null for unlink
- [Phase 09]: [09-03] Goal detail is an in-page selectedGoalId sub-view (no route); Goals.tsx owns its own TaskDrawer for linked-task edits
- [Phase 09]: [09-04] Routines always send explicit goal_id (null to unlink) under backend exclude_unset=True; tasks omit goal_id when unset
- [Phase 09]: [09-04] TaskDrawer goals prop is required — every TaskDrawer render site (Tasks.tsx, Goals.tsx) must pass goals from useGoals()
- [Phase 10]: [10-01] Work hours exposed as HH:MM strings in API but persisted as four integer columns; set_work_hours touches no scheduler (no job)
- [Phase 10]: [10-01] Migration 0009 adds work-hours columns as nullable (no server_default) to avoid NOT NULL failure on existing app_settings id=1; router coalesces None to 9/0/18/0
- [Phase 10]: [10-02] Planner read-only guarantee verified at source level (no db-layer import, no async def), not via sys.modules — ORM models transitively load Base from the db module
- [Phase 10]: [10-03] local_tz from os.environ TZ (default UTC) per RESEARCH §10; no DB user_timezone setting — resolves Phase 10 open question
- [Phase 10]: [10-04] fully_booked has two causes (packed vs. past work-hours end); Organize empty-state copy branches on isAfterWorkHours(workEnd) — frontend-only, no schema change
- [Phase 11]: [11-01] completed_at nullable no server_default; stall_threshold_days coalesces None->7 on read; Wave 0 test stubs use deferred imports
- [Phase 11-goal-guided-guidance]: [11-02] get_stalled_goals() is public API for tests; send_stall_nudge() returns False on rate-limit; brief goal queries inside existing _Session block
- [v2.1 roadmap]: UPDATE-03 spans Phases 12+13 — Phase 12 owns the backend ambiguity signal (return status + candidates), Phase 13 owns the frontend confirmation UI; requirement assigned to Phase 13 (observable user behavior)
- [v2.1 roadmap]: Check-in Pushover notification includes a deep-link URL (app relative path /today?update=1); no new dependency — URL string built in Python
- [v2.1 roadmap]: INGEST-08 extends existing ingest Pydantic schema with a schema_version Literal bump or new payload_type discriminator; server only validates JSON, no LLM parsing
- [v2.1 roadmap]: No new Alembic migration needed for NOTIF-07/08 if check-in time stored in existing app_settings table (new nullable columns); migration needed if new columns added — continue chain from 0011+
- [Phase 12-01]: [12-01] Wave 0 test strategy: 10 RED tests in test_updates.py, deferred imports prevent collection errors, schedule_checkin stub in scheduler.py, check-in lifespan block logs failures (NOTIF-07 guard)
- [Phase 12-03]: [12-03] checkin_service.py uses module-alias import (import app.services.pushover as _pushover) not from-import, so unittest.mock.patch on app.services.pushover.PushoverClient intercepts the runtime reference
- [Phase 12-02]: [12-02] Strip intent/stop words from query before rapidfuzz matching — WRatio on full text dilutes score with 'done', 'with', etc.
- [Phase 12-02]: [12-02] Tie-break: if multiple candidates score >= CONFIDENT_THRESHOLD, return ambiguous — prevents wrong pick on near-duplicate titles like 'Team sync A' vs 'Team sync B'
- [Phase 12-04]: drop reuses completed=True (no separate drop flag/column) — Phase 13 slipped-vs-done rollup must treat completed=True as ambiguous
- [Phase 12-04]: GET /tasks/{task_id} added to tasks router — test verification required it, omitted from plan
- [Phase 13]: isAfterWorkHours uses >= boundary for exact-minute match; deriveRollup treats completed=true as done per UI-SPEC (Phase 12-04 ambiguity noted in code)
- [Phase 13]: confirmed_id/confirmed_type/confirmed_action added to UpdateRequest (optional); confirmed_id bypasses fuzzy match for UPDATE-03 confirm flow
- [Phase 13]: [13-02] reschedule=tomorrow via timedelta(days=1) from utc now; delta-preserving for blocks; due_date for tasks
- [Phase 13]: [13-02] check_in_enabled nullable Boolean; None coalesces to True; GET check-in-time returns 'enabled' field (plans 03/04 wire the toggle)
- [Phase 13-update-loop-ui]: useUpdate hook is stateless — Today.tsx owns all update-flow state (text, phase, candidates, candStatus, updError)
- [Phase 13-update-loop-ui]: CandidateCard uses local Set<number> for skipped candidates — avoids lifting skip state to Today.tsx

### Open Questions (Live Verification Required)

- Does `tailscale funnel 443` reach IFTTT's servers? (Phase 6 fallback: router port-forward)
- Can personal Gmail publish OAuth consent to "In production"? (Phase 4 risk)
- Does pychromecast work with specific Google Home/Nest device? (Phase 6 fallback: Home Assistant)
- Stall threshold: 7 vs 14 days — make it a user setting, not hardcoded (decide in Phase 11)
- `user_timezone` as explicit DB setting vs. relying on Pi system tz (decide in Phase 10)
- Current Alembic HEAD: verify latest migration number before writing Phase 12 migrations (known: 0011+ from task-lists quick task)

### Blockers

None

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260615-bi1 | Cross out / mark-done activities on the Today tab (tasks persist complete; events get a UI-only server-side done flag) | 2026-06-15 | b445a83 | [260615-bi1-cross-out-mark-done-activities-on-the-to](./quick/260615-bi1-cross-out-mark-done-activities-on-the-to/) |
| 260615-bll | Rolling 7-day week view in Today tab, grouped by day | 2026-06-15 | 0fa2e7f | [260615-bll-show-rolling-7-day-week-view-in-today-ta](./quick/260615-bll-show-rolling-7-day-week-view-in-today-ta/) |
| 260615-bse | Weekly voice readout (tasks + events) on Google Home, alongside daily brief; webhook `range=day\|week` | 2026-06-15 | 4fabd1f | [260615-bse-add-weekly-voice-readout-tasks-events-to](./quick/260615-bse-add-weekly-voice-readout-tasks-events-to/) |
| 260617-bvj | Fix task→goal unlink: send goal_id explicitly (null) from TaskDrawer; widen TaskCreate type; backend regression test | 2026-06-17 | a3f65fa | [260617-bvj-fix-task-to-goal-unlink-in-taskdrawer-se](./quick/260617-bvj-fix-task-to-goal-unlink-in-taskdrawer-se/) |
| 260617-ldm | Add per-task estimated_minutes (Duration) field: backend TaskCreate schema + frontend types + TaskDrawer Collapsible input; planner block sizing without re-ingest | 2026-06-17 | 361915a | [260617-ldm-add-per-task-estimated-minutes-duration-](./quick/260617-ldm-add-per-task-estimated-minutes-duration-/) |
| 260618-dbv | Add task lists (list_name nullable string): migration 0011, model, schemas, GET /tasks/lists, list_name filter on GET /tasks/, TaskDrawer autocomplete input, Tasks page chip row filter | 2026-06-18 | 5d6bbd5 | [260618-dbv-add-task-lists-a-simple-list-name-string](./quick/260618-dbv-add-task-lists-a-simple-list-name-string/) |
| 260618-mlt | Let Organize prioritize a specifically selected task list | 2026-06-18 | pending | [260618-mlt-let-organize-prioritize-a-specifically-s](./quick/260618-mlt-let-organize-prioritize-a-specifically-s/) |
| 260619-hier | Add hierarchical umbrella lists across tasks, goals, ingest, filters, and Organize | 2026-06-19 | pending | [260619-hier-hierarchical-umbrella-lists](./quick/260619-hier-hierarchical-umbrella-lists/) |
| 260619-u0n | Include tomorrow's due tasks in the Google Home briefing | 2026-06-20 | eddb8b2 | [260619-u0n-include-tomorrow-s-due-tasks-in-the-goog](./quick/260619-u0n-include-tomorrow-s-due-tasks-in-the-goog/) |
| 260624-kmx | Redesign Today page into a Now view: hero next-best task card, momentum strip, timeline rail with now-marker | 2026-06-24 | b30c1db | [260624-kmx-redesign-today-page-into-a-now-view-hero](./quick/260624-kmx-redesign-today-page-into-a-now-view-hero/) |

### Todos

None

---

## Session Continuity

Last session: 2026-06-29T18:38:37.746Z
Next action: Run /gsd:plan-phase 15 — context captured (15-CONTEXT.md). Advisory scope: approval MAY create new tasks (ADVISE-08, create-only)
