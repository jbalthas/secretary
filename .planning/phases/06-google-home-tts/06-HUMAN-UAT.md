---
status: partial
phase: 06-google-home-tts
source: [06-VERIFICATION.md]
started: 2026-06-15T03:04:18Z
updated: 2026-06-15T03:04:18Z
---

## Current Test

[awaiting human testing — requires Pi deploy + physical Google Home speaker]

## Tests

### 1. Hardware gate — Google Home speaks within 10 seconds
expected: `POST /api/v1/tts` with a test message returns HTTP 200 `{"status":"ok"}` AND the Google Home speaker (10.20.219.9) audibly says the phrase within ~10 seconds. The full cast path is wired in code (TTSClient.speak → gTTS → pychromecast.get_listed_chromecasts → cast.wait() → play_media); only physical audio playback is unverified.
result: [pending]

### 2. tts_enabled toggle silences announcements
expected: With "Announce on Google Home" toggled OFF, `POST /api/v1/tts` returns `{"status":"disabled"}` and the speaker stays silent. Toggling ON restores audible playback.
result: [pending]

### 3. Settings page "Speak" button (over Tailscale)
expected: On the Settings page (Tailscale, http://100.112.162.43:5174), typing a phrase into the Google Home card and clicking "Speak" makes the speaker say it within ~10 seconds.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

## Notes

Blocked on first-time Pi deployment (repo not yet cloned on Pi, `secretary` systemd
service not yet configured, `backend/.env` not yet written). Required `.env` values
identified: GOOGLE_HOME_IP=10.20.219.9, GOOGLE_HOME_LAN_IP=10.20.219.8, GOOGLE_HOME_NAME=,
WEBHOOK_SECRET=<secret>. After deploy, run `alembic upgrade head` then restart the service.
Run `/gsd:verify-work 6` to walk these tests once hardware is reachable.
