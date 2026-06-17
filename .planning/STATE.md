---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Phases — Ingest, Organize, Guide
status: verifying
last_updated: "2026-06-17T13:29:18.410Z"
last_activity: 2026-06-17
progress:
  total_phases: 11
  completed_phases: 9
  total_plans: 34
  completed_plans: 34
---

# Project State

## Current Position

Phase: 10
Plan: Not started
Status: Ready to verify
Last activity: 2026-06-17 - Completed quick task 260617-bvj: fix task→goal unlink in TaskDrawer

---

## Project Reference

**Core value:** One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

**Current focus:** Phase 09 — goals-ingest-ui

---

## v2.0 Phase Map

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 8 | Goals + Ingest Backend | GOAL-01, GOAL-02, GOAL-03, GOAL-06, INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07 | Not started |
| 9 | Goals + Ingest UI | GOAL-04, GOAL-05, INGEST-03, INGEST-05 | Not started |
| 10 | Day Auto-Organize | PLAN-01, PLAN-02 | Not started |
| 11 | Goal-Guided Guidance | GUIDE-01, GUIDE-02, GUIDE-03 | Not started |

---

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: Outlook Calendar ICS feed integration (separate concurrent effort, do not modify)
- Phases 8–11 added: v2.0 Ingest, Organize, Guide (2026-06-15)

### Decisions Made

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

### Open Questions (Live Verification Required)

- Does `tailscale funnel 443` reach IFTTT's servers? (Phase 6 fallback: router port-forward)
- Can personal Gmail publish OAuth consent to "In production"? (Phase 4 risk)
- Does pychromecast work with specific Google Home/Nest device? (Phase 6 fallback: Home Assistant)
- Stall threshold: 7 vs 14 days — make it a user setting, not hardcoded (decide in Phase 11)
- `user_timezone` as explicit DB setting vs. relying on Pi system tz (decide in Phase 10)

### Blockers

None

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260615-bi1 | Cross out / mark-done activities on the Today tab (tasks persist complete; events get a UI-only server-side done flag) | 2026-06-15 | b445a83 | [260615-bi1-cross-out-mark-done-activities-on-the-to](./quick/260615-bi1-cross-out-mark-done-activities-on-the-to/) |
| 260615-bll | Rolling 7-day week view in Today tab, grouped by day | 2026-06-15 | 0fa2e7f | [260615-bll-show-rolling-7-day-week-view-in-today-ta](./quick/260615-bll-show-rolling-7-day-week-view-in-today-ta/) |
| 260615-bse | Weekly voice readout (tasks + events) on Google Home, alongside daily brief; webhook `range=day\|week` | 2026-06-15 | 4fabd1f | [260615-bse-add-weekly-voice-readout-tasks-events-to](./quick/260615-bse-add-weekly-voice-readout-tasks-events-to/) |
| 260617-bvj | Fix task→goal unlink: send goal_id explicitly (null) from TaskDrawer; widen TaskCreate type; backend regression test | 2026-06-17 | a3f65fa | [260617-bvj-fix-task-to-goal-unlink-in-taskdrawer-se](./quick/260617-bvj-fix-task-to-goal-unlink-in-taskdrawer-se/) |

### Todos

None

---

## Session Continuity

Last session: 2026-06-17T14:00:00Z
Next action: Run `/gsd:plan-phase 8` to break Phase 8 (Goals + Ingest Backend) into executable plans
