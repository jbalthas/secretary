---
phase: 6
slug: google-home-tts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-14
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `06-RESEARCH.md` → "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing, version in `backend/pyproject.toml`) |
| **Config file** | `backend/pyproject.toml` (existing `[tool.pytest.ini_options]`) |
| **Quick run command** | `cd backend && pytest tests/test_tts.py -x` |
| **Full suite command** | `cd backend && pytest` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && pytest tests/test_tts.py tests/test_brief.py tests/test_scheduler.py tests/test_settings.py -x`
- **After every plan wave:** Run `cd backend && pytest`
- **Before `/gsd:verify-work`:** Full suite must be green + manual speaker gate test
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| NOTIF-03 | `POST /api/v1/tts` calls `TTSClient.speak` with submitted text | unit (mock TTSClient) | `pytest tests/test_tts.py::test_tts_endpoint_calls_speak -x` | ❌ W0 |
| NOTIF-03 | `POST /api/v1/tts` returns 200 when `tts_enabled=True` | unit | `pytest tests/test_tts.py::test_tts_endpoint_enabled -x` | ❌ W0 |
| NOTIF-03 | `POST /api/v1/tts` returns disabled status when `tts_enabled=False` | unit | `pytest tests/test_tts.py::test_tts_endpoint_disabled -x` | ❌ W0 |
| NOTIF-03 | `GET /api/v1/settings/tts` returns `tts_enabled` value | unit | `pytest tests/test_settings.py::test_get_tts_enabled -x` | ❌ W0 |
| NOTIF-03 | `PUT /api/v1/settings/tts` updates `tts_enabled` and persists | unit | `pytest tests/test_settings.py::test_set_tts_enabled -x` | ❌ W0 |
| NOTIF-04 | `_send_reminder` calls `TTSClient.speak` with `"Reminder: {title}"` | unit (mock TTSClient) | `pytest tests/test_scheduler.py::test_reminder_calls_tts -x` | ❌ W0 |
| NOTIF-04 | `_send_reminder` swallows TTSClient exception (D-05) | unit | `pytest tests/test_scheduler.py::test_reminder_tts_failure_swallowed -x` | ❌ W0 |
| NOTIF-04 | `_send_reminder` skips TTS when `tts_enabled=False` | unit | `pytest tests/test_scheduler.py::test_reminder_tts_respects_flag -x` | ❌ W0 |
| NOTIF-05 | `send_daily_brief` calls `TTSClient.speak` with speech-formatted brief | unit (mock TTSClient) | `pytest tests/test_brief.py::test_brief_calls_tts -x` | ❌ W0 |
| NOTIF-05 | `build_brief_speech` returns `"Good morning. Nothing scheduled today."` when empty | unit | `pytest tests/test_brief.py::test_build_brief_speech_empty -x` | ❌ W0 |
| NOTIF-05 | `build_brief_speech` strips HH:MM + bullet prefix, joins with `. ` | unit | `pytest tests/test_brief.py::test_build_brief_speech_format -x` | ❌ W0 |
| NOTIF-05 | `send_daily_brief` swallows TTS exception (D-05) | unit | `pytest tests/test_brief.py::test_brief_tts_failure_swallowed -x` | ❌ W0 |
| NOTIF-06 | `POST .../webhooks/brief` with correct secret calls `send_daily_brief` | unit (mock send_daily_brief) | `pytest tests/test_tts.py::test_webhook_brief_correct_secret -x` | ❌ W0 |
| NOTIF-06 | `POST .../webhooks/brief` with wrong secret returns 403 | unit | `pytest tests/test_tts.py::test_webhook_brief_wrong_secret -x` | ❌ W0 |
| NOTIF-06 | `POST .../webhooks/brief` with missing secret returns 403 | unit | `pytest tests/test_tts.py::test_webhook_brief_missing_secret -x` | ❌ W0 |
| NOTIF-03 | `TTSClient.speak` writes an MP3 to `tts_cache/` (mock gTTS) | unit | `pytest tests/test_tts.py::test_tts_client_caches_mp3 -x` | ❌ W0 |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_tts.py` — new file: NOTIF-03 endpoint tests, NOTIF-06 webhook tests, MP3 cache-write test (mock `gTTS` + `pychromecast`)
- [ ] `backend/tests/test_brief.py` — extend: `test_build_brief_speech_*`, `test_brief_calls_tts`, `test_brief_tts_failure_swallowed`
- [ ] `backend/tests/test_scheduler.py` — extend: `test_reminder_calls_tts`, `test_reminder_tts_failure_swallowed`, `test_reminder_tts_respects_flag`
- [ ] `backend/tests/test_settings.py` — extend: `test_get_tts_enabled`, `test_set_tts_enabled`
- [ ] Alembic migration adding `app_settings.tts_enabled` must exist before any test using `AppSettings.tts_enabled`

*All TTS/cast paths are mocked at the `TTSClient` boundary; gTTS and pychromecast are never invoked for real in tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Speaker announces text within 10s of `POST /api/v1/tts` | NOTIF-03 (gate) | Real Chromecast cast + audio output cannot be automated; device-hardware dependent | On the Pi: `curl -X POST http://<pi-lan-ip>:8000/api/v1/tts -H 'Content-Type: application/json' -d '{"text":"hello"}'` → hear it on the Google Home within 10s |
| Reminder fires → speaker announces alongside Pushover | NOTIF-04 (gate) | Requires real scheduler fire + real device | Create a task due in ~1 min; confirm both Pushover and speaker fire |
| Daily brief plays on speaker at brief time | NOTIF-05 (gate) | Requires real device | Trigger brief; confirm speaker speaks the natural-language brief |
| Google Home morning routine → webhook → brief fires | NOTIF-06 (gate) | Requires IFTTT applet + Tailscale funnel + real routine | Speak the routine trigger phrase; confirm webhook hits the Pi and brief fires |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test files above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
