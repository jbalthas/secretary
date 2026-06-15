---
phase: 06-google-home-tts
plan: 01
subsystem: testing
tags: [tts, pychromecast, gtts, alembic, pytest, red-tests]

requires:
  - phase: 05-daily-brief-routines
    provides: AppSettings model, brief.py, scheduler.py, test patterns

provides:
  - tts_enabled boolean column on app_settings (migration 0004)
  - google_home_ip, google_home_lan_ip, google_home_name, webhook_secret in Settings
  - 16 RED (failing) tests covering all NOTIF-03/04/05/06 behaviors
  - Stable mock seams for Plans 02/03/04 to implement against

affects: [06-02, 06-03, 06-04]

tech-stack:
  added: []
  patterns:
    - "TTS router patch target: app.routers.tts.TTSClient (module-top import)"
    - "TTS flag seam: app.services.tts_settings.get_tts_enabled() -> bool"
    - "Brief TTS patch target: app.services.brief.TTSClient (module-top import)"
    - "Scheduler TTS patch target: app.scheduler.TTSClient (module-top import)"
    - "MP3 cache naming: sha256(text.encode()).hexdigest()[:16].mp3 under CACHE_DIR"
    - "CACHE_DIR exported as module-level Path from app/services/tts.py"

key-files:
  created:
    - backend/migrations/versions/0004_add_tts_enabled.py
    - backend/tests/test_tts.py
    - .gitignore
  modified:
    - backend/app/config.py
    - backend/app/models/__init__.py
    - backend/.env.example
    - backend/tests/test_settings.py
    - backend/tests/test_scheduler.py
    - backend/tests/test_brief.py

key-decisions:
  - "Plan 02 must import TTSClient at module top (not inside function) of routers/tts.py, scheduler.py, and services/brief.py to keep patch targets stable"
  - "Plan 03 must expose get_tts_enabled() in app/services/tts_settings.py as the single flag seam"
  - "Plan 02 must export CACHE_DIR as module-level Path in app/services/tts.py"
  - "Migration 0004 uses server_default='1' so existing id=1 row gets tts_enabled=True without separate UPDATE"
  - "Webhook tests patch app.routers.webhooks.settings and app.routers.webhooks.send_daily_brief"

patterns-established:
  - "Wave 0 RED test scaffold: write all validation tests before implementation so Plans 02/03/04 have fixed targets"
  - "TTS seam pattern: always mock at module boundary (TTSClient class), never patch gTTS/pychromecast inside routers"

requirements-completed: [NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06]

duration: 3min
completed: 2026-06-15
---

# Phase 6 Plan 01: Wave 0 Foundation Summary

**Alembic migration 0004 adds tts_enabled to app_settings, 4 new Settings fields for Cast device + webhook, and 16 RED pytest contracts covering every NOTIF-03/04/05/06 behavior**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-15T02:15:17Z
- **Completed:** 2026-06-15T02:18:28Z
- **Tasks:** 2
- **Files modified:** 7 (5 modified, 2 created new, 1 new .gitignore)

## Accomplishments

- Added `tts_enabled` bool column to `AppSettings` model with Alembic migration 0004 (`server_default="1"`, chaining from 0003)
- Appended 4 Settings fields (`google_home_ip`, `google_home_lan_ip`, `google_home_name`, `webhook_secret`) and corresponding `.env.example` entries
- Created `tts_cache/` entry in root `.gitignore`
- Created `backend/tests/test_tts.py` with 7 RED tests covering TTS endpoint, webhook endpoint, and MP3 cache-write behavior
- Extended `test_settings.py`, `test_scheduler.py`, `test_brief.py` with 9 additional RED tests
- All 16 RED tests collect without import errors; all fail because implementation does not exist (correct Wave 0 state)

## Task Commits

1. **Task 1: Add config fields, env.example, gitignore, DB column + migration** - `8a8c682` (feat)
2. **Task 2: Write failing RED tests for all NOTIF-03/04/05/06 behaviors** - `5535d54` (test)

**Plan metadata:** _(final docs commit — see below)_

## Files Created/Modified

- `backend/app/config.py` - Added 4 new Settings fields: google_home_ip, google_home_lan_ip, google_home_name, webhook_secret
- `backend/app/models/__init__.py` - Added `tts_enabled: Mapped[bool]` to AppSettings
- `backend/migrations/versions/0004_add_tts_enabled.py` - New migration: adds tts_enabled Boolean column, server_default="1", down_revision='0003'
- `backend/.env.example` - Appended GOOGLE_HOME_IP, GOOGLE_HOME_LAN_IP, GOOGLE_HOME_NAME, WEBHOOK_SECRET
- `.gitignore` - Created at project root with `tts_cache/`
- `backend/tests/test_tts.py` - New file: 7 RED tests (TTS endpoint, webhook auth, MP3 cache)
- `backend/tests/test_settings.py` - Extended: test_get_tts_enabled, test_set_tts_enabled
- `backend/tests/test_scheduler.py` - Extended: test_reminder_calls_tts, test_reminder_tts_failure_swallowed, test_reminder_tts_respects_flag
- `backend/tests/test_brief.py` - Extended: test_build_brief_speech_empty, test_build_brief_speech_format, test_brief_calls_tts, test_brief_tts_failure_swallowed

## Decisions Made

- Module-top TTSClient imports required in routers/tts.py, scheduler.py, and services/brief.py (not deferred imports) — ensures patch targets are stable at `app.routers.tts.TTSClient`, `app.scheduler.TTSClient`, `app.services.brief.TTSClient`
- `get_tts_enabled()` consolidated in `app/services/tts_settings.py` — single source of truth for flag check, patchable without touching models
- `CACHE_DIR` exported as module-level `Path` from `app/services/tts.py` — allows `test_tts_client_caches_mp3` to redirect cache location via `tmp_path`
- `server_default="1"` in migration 0004 — avoids separate UPDATE for existing row

## Deviations from Plan

None — plan executed exactly as written. No `.gitignore` file existed at project root; creating it is consistent with the plan's intent (the plan instructs adding `tts_cache/` to `.gitignore` at the repo root).

## Known RED Tests (intentionally failing — Wave 0)

All 16 tests below are intentionally RED. Implementation does not exist yet. Plans 02/03/04 turn them green.

| Test | File | Fails because |
|------|------|---------------|
| test_tts_endpoint_calls_speak | test_tts.py | app.routers.tts does not exist |
| test_tts_endpoint_enabled | test_tts.py | app.routers.tts does not exist |
| test_tts_endpoint_disabled | test_tts.py | app.routers.tts does not exist |
| test_webhook_brief_correct_secret | test_tts.py | app.routers.webhooks does not exist |
| test_webhook_brief_wrong_secret | test_tts.py | app.routers.webhooks does not exist |
| test_webhook_brief_missing_secret | test_tts.py | app.routers.webhooks does not exist |
| test_tts_client_caches_mp3 | test_tts.py | app.services.tts does not exist |
| test_get_tts_enabled | test_settings.py | /api/v1/settings/tts route returns 404 |
| test_set_tts_enabled | test_settings.py | /api/v1/settings/tts route returns 404 |
| test_reminder_calls_tts | test_scheduler.py | app.scheduler.TTSClient does not exist |
| test_reminder_tts_failure_swallowed | test_scheduler.py | app.scheduler.TTSClient does not exist |
| test_reminder_tts_respects_flag | test_scheduler.py | app.scheduler.TTSClient does not exist |
| test_build_brief_speech_empty | test_brief.py | build_brief_speech not exported from brief.py |
| test_build_brief_speech_format | test_brief.py | build_brief_speech not exported from brief.py |
| test_brief_calls_tts | test_brief.py | app.services.brief.TTSClient does not exist |
| test_brief_tts_failure_swallowed | test_brief.py | app.services.brief.TTSClient does not exist |

## Issues Encountered

None.

## User Setup Required

None for this plan — all changes are code and migration artifacts.

New `.env` vars added to `.env.example` that will require population before Plans 03/04 can fully function on the Pi:
- `GOOGLE_HOME_IP` — Cast device static IP
- `GOOGLE_HOME_LAN_IP` — Pi's LAN IP (where gTTS MP3 is served from)
- `GOOGLE_HOME_NAME` — Optional friendly name
- `WEBHOOK_SECRET` — Shared secret for `/api/v1/webhooks/brief`

## Next Phase Readiness

- Plan 02 has fixed targets: create `app/routers/tts.py`, `app/routers/webhooks.py`, `app/services/tts.py`, extend `app/routers/settings.py`, add `build_brief_speech()` to `brief.py`
- Plan 03 has fixed seam: create `app/services/tts_settings.py` with `get_tts_enabled() -> bool`, wire into scheduler and brief
- Migration chain intact: 0003 → 0004; running `alembic upgrade head` on the Pi will add the column

---
*Phase: 06-google-home-tts*
*Completed: 2026-06-15*
