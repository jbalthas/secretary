---
phase: 06-google-home-tts
plan: 02
subsystem: tts
tags: [tts, pychromecast, gtts, fastapi, staticfiles, webhook]

requires:
  - phase: 06-google-home-tts
    plan: 01
    provides: tts_enabled DB column, config fields, RED tests (test_tts.py, test_settings.py)

provides:
  - app/services/tts.py: sync TTSClient (gTTS + pychromecast) with SHA-256 MP3 caching
  - app/services/tts_settings.py: get_tts_enabled() patchable seam using app_db engine URL
  - app/schemas/tts.py: TTSRequest, TTSEnabledRead, TTSEnabledUpdate Pydantic models
  - app/routers/tts.py: POST /api/v1/tts, GET/PUT /api/v1/settings/tts
  - app/routers/webhooks.py: POST /api/v1/webhooks/brief (hmac-guarded)
  - main.py: StaticFiles mount at /tts-audio serving CACHE_DIR

affects: [06-03, 06-04]

tech-stack:
  added:
    - pychromecast==14.0.9
    - gTTS==2.5.4
  patterns:
    - "TTSClient is sync/blocking (no await) — mirrors PushoverClient pattern"
    - "get_tts_enabled() derives sync URL from app_db.engine.url for test-DB compatibility"
    - "speak_text calls _tts_settings.get_tts_enabled() for patchability at app.services.tts_settings.get_tts_enabled"
    - "Webhook guard: hmac.compare_digest (constant-time) on X-Webhook-Secret header"
    - "browser.stop_discovery() always in finally block — prevents mDNS leak on teardown"
    - "No-cast-found: warn + return (no raise) — file is written regardless of cast availability"

key-files:
  created:
    - backend/app/services/tts.py
    - backend/app/services/tts_settings.py
    - backend/app/schemas/tts.py
    - backend/app/routers/tts.py
    - backend/app/routers/webhooks.py
  modified:
    - backend/app/main.py
    - backend/pyproject.toml

decisions:
  - "get_tts_enabled() reads from same test DB file by deriving sync URL from app_db.engine.url — passes test_set_tts_enabled without requiring a separate session factory"
  - "Webhook router is app/routers/webhooks.py (not tts.py) — required by test patch targets app.routers.webhooks.send_daily_brief and app.routers.webhooks.settings"
  - "No RuntimeError when cast device not found — log warning and return so MP3 is written to cache regardless"
  - "tts_settings.py created in Plan 02 (ahead of Plan 03) — required immediately for test_tts_endpoint_disabled patch seam"

metrics:
  duration: 6min
  completed: 2026-06-15
---

# Phase 6 Plan 02: TTS Service and HTTP Surface Summary

**Sync TTSClient (gTTS + pychromecast + SHA-256 MP3 cache), four routes via two routers, patchable get_tts_enabled() seam, and StaticFiles mount — turns all 9 Plan-01 RED tests green**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-15T02:21:11Z
- **Completed:** 2026-06-15T02:27:32Z
- **Tasks:** 2
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- Created `backend/app/services/tts.py` — sync `TTSClient.speak()` that SHA-256-hashes text, writes `CACHE_DIR/{key}.mp3` via gTTS, then casts via pychromecast with correct `wait → play_media → sleep(3) → stop_discovery()` lifecycle. `CACHE_DIR` exported as module-level `Path`.
- Created `backend/app/schemas/tts.py` — `TTSRequest`, `TTSEnabledRead`, `TTSEnabledUpdate` Pydantic models.
- Created `backend/app/services/tts_settings.py` — `get_tts_enabled()` derives a sync URL from `app_db.engine.url` so it reads from the same file the test async engine uses (no separate DB config needed).
- Created `backend/app/routers/tts.py` — `POST /api/v1/tts` (calls `get_tts_enabled()` → speaks or returns disabled), `GET /api/v1/settings/tts`, `PUT /api/v1/settings/tts`.
- Created `backend/app/routers/webhooks.py` — `POST /api/v1/webhooks/brief` guarded by `hmac.compare_digest` on `X-Webhook-Secret` header, calls `send_daily_brief`.
- Updated `backend/app/main.py` — imports both new routers, calls `CACHE_DIR.mkdir(exist_ok=True)`, mounts `StaticFiles` at `/tts-audio`.
- Updated `backend/pyproject.toml` — added `pychromecast==14.0.9` and `gTTS==2.5.4` to runtime dependencies.

## Task Commits

1. **Task 1: TTSClient service (gTTS + pychromecast) + schema** — `311f92a` (feat)
2. **Task 2: TTS router, webhooks router, tts_settings seam, and main.py wiring** — `a0dfebc` (feat)

## Files Created/Modified

- `backend/app/services/tts.py` — sync TTSClient, CACHE_DIR Path export, gTTS + pychromecast integration
- `backend/app/services/tts_settings.py` — get_tts_enabled() patchable flag seam
- `backend/app/schemas/tts.py` — TTSRequest, TTSEnabledRead, TTSEnabledUpdate
- `backend/app/routers/tts.py` — POST /tts, GET/PUT /settings/tts
- `backend/app/routers/webhooks.py` — POST /webhooks/brief with secret guard
- `backend/app/main.py` — include_router(tts.router), include_router(webhooks.router), StaticFiles mount
- `backend/pyproject.toml` — pychromecast and gTTS runtime deps

## Decisions Made

- `webhooks.py` is a separate router from `tts.py` — required by Plan-01 test patch targets (`app.routers.webhooks.send_daily_brief`, `app.routers.webhooks.settings`). The plan's task 2 action listed it as part of `tts.py` but the RED test contracts are authoritative.
- `get_tts_enabled()` created in Plan 02 (not deferred to Plan 03 as originally intended) — the `test_tts_endpoint_disabled` test patches it, so it must exist for Plan 02's tests to pass.
- TTSClient logs warning + returns when no cast devices found (rather than raising `RuntimeError`) — `test_tts_client_caches_mp3` mocks `get_listed_chromecasts` to return `([], browser)` and asserts the MP3 file was written; a RuntimeError would prevent that assertion.
- `get_tts_enabled()` derives sync URL from `app_db.engine.url` — when conftest patches `app_db.engine` with the test engine, `get_tts_enabled()` automatically uses the same `test_secretary.db` file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Separate webhooks router required by test patch targets**
- **Found during:** Task 2
- **Issue:** Plan task 2 action placed the webhook in `routers/tts.py`. The RED tests patch `app.routers.webhooks.send_daily_brief` and `app.routers.webhooks.settings`, meaning the webhook must live in a separate `routers/webhooks.py` module.
- **Fix:** Created `backend/app/routers/webhooks.py` as a separate router alongside `tts.py`.
- **Files modified:** `backend/app/routers/webhooks.py` (new), `backend/app/main.py`
- **Commit:** a0dfebc

**2. [Rule 1 - Bug] RuntimeError on no cast devices prevented MP3 cache write test from passing**
- **Found during:** Task 1 verification
- **Issue:** `TTSClient.speak()` raised `RuntimeError("Cast device not found")` when `pychromecast.get_listed_chromecasts` returned empty list. `test_tts_client_caches_mp3` mocks chromecasts to return empty and asserts the MP3 file exists — the RuntimeError prevented the assertion from being reached.
- **Fix:** Changed to `_log.warning(...)` and early `return` instead of raising. MP3 is always written before the cast attempt.
- **Files modified:** `backend/app/services/tts.py`
- **Commit:** 311f92a

**3. [Rule 2 - Missing functionality] tts_settings.py created in Plan 02 (ahead of Plan 03 schedule)**
- **Found during:** Task 2
- **Issue:** `test_tts_endpoint_disabled` patches `app.services.tts_settings.get_tts_enabled`. The module must exist and the router must call it for the patch to have effect. Plan 03 was intended to create this file but Plan 02's tests require it.
- **Fix:** Created `backend/app/services/tts_settings.py` with `get_tts_enabled()` using `app_db.engine.url` for test-DB compatibility.
- **Files modified:** `backend/app/services/tts_settings.py` (new)
- **Commit:** a0dfebc

### Deferred Items (Out of Scope)

**Test isolation pollution in full suite**: When running `pytest tests/` (all tests), `test_settings.py::test_set_tts_enabled` runs before `test_tts.py` (alphabetical order) and commits `tts_enabled=False` to `test_secretary.db`. This causes `test_tts_endpoint_calls_speak` and `test_tts_endpoint_enabled` to fail in the full suite because `get_tts_enabled()` reads the committed False value. These tests PASS when run as `pytest tests/test_tts.py tests/test_settings.py::test_get_tts_enabled tests/test_settings.py::test_set_tts_enabled` (plan's verify command). Fixing requires either per-test DB cleanup in conftest or individual test fixtures — out of scope for this plan. Logged to `deferred-items.md`.

## Known Stubs

None — no hardcoded empty data or placeholders flowing to UI.

## Issues Encountered

None blocking. Two bugs caught during verify (RuntimeError + wrong router file) fixed inline under Rule 1.

## User Setup Required

None for this plan — all changes are code. Real audio playback requires the `.env` vars from Plan 01:
- `GOOGLE_HOME_IP`, `GOOGLE_HOME_LAN_IP`, `GOOGLE_HOME_NAME`, `WEBHOOK_SECRET`

## Next Phase Readiness

- Plan 03 has fixed seams: import `TTSClient` at module top of `scheduler.py` and `services/brief.py` (patch at `app.scheduler.TTSClient`, `app.services.brief.TTSClient`)
- Plan 03 can use `get_tts_enabled()` from `app.services.tts_settings` (already exists) — wire into `send_daily_brief` and scheduler reminder logic
- `CACHE_DIR` and `TTSClient` exported from `app/services/tts.py` — ready for Plan 03 import

---
*Phase: 06-google-home-tts*
*Completed: 2026-06-15*
