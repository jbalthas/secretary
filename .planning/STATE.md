---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-06-15T03:25:11.627Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 24
  completed_plans: 23
---

# Project State

## Current Phase

Phase 03 — pushover-reminders

## Current Plan

Plan 3 of 3 complete (03-03 done)

## Status

in-progress

## Last Updated

2026-06-12

---

## Project Reference

**Core value:** One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

**Current focus:** Phase 06 — google-home-tts

---

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: Outlook Calendar ICS feed integration

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

### Open Questions (Live Verification Required)

- Does `tailscale funnel 443` reach IFTTT's servers? (Phase 6 fallback: router port-forward)
- Can personal Gmail publish OAuth consent to "In production"? (Phase 4 risk)
- Does pychromecast work with specific Google Home/Nest device? (Phase 6 fallback: Home Assistant)

### Blockers

None

### Todos

None

---

## Session Continuity

Last session: 2026-06-15T03:25:07.676Z
Next action: Completed 03-03 (task reminder lifecycle wiring); Phase 03 plans complete
