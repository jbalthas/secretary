---
status: resolved
phase: 06-google-home-tts
source: [06-VERIFICATION.md]
started: 2026-06-15T03:04:18Z
updated: 2026-06-15T03:20:00Z
---

## Current Test

[complete — hardware gate passed]

## Tests

### 1. Hardware gate — Google Home speaks within 10 seconds
expected: `POST /api/v1/tts` with a test message returns HTTP 200 `{"status":"ok"}` AND the Google Home speaker (10.20.219.9) audibly says the phrase within ~10 seconds.
result: PASSED — on 2026-06-15, `curl POST http://10.20.219.8:8000/api/v1/tts` returned `{"status":"ok"}` HTTP 200 and the "Home 4108 speaker" (Google Nest Mini, 10.20.219.9) audibly said "Secretary test, one two three". Required two deploy fixes (see Notes).

### 2. tts_enabled toggle silences announcements
expected: With "Announce on Google Home" toggled OFF, `POST /api/v1/tts` returns `{"status":"disabled"}` and the speaker stays silent. Toggling ON restores audible playback.
result: [pending — optional; not exercised during the gate test]

### 3. Settings page "Speak" button (over Tailscale)
expected: On the Settings page (Tailscale, http://100.112.162.43:5174), typing a phrase into the Google Home card and clicking "Speak" makes the speaker say it within ~10 seconds.
result: [pending — optional; core gate validated via curl]

## Summary

total: 3
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

## Notes

Gate PASSED 2026-06-15. Two issues surfaced and were fixed during the test:

1. **LAN binding (deploy):** uvicorn bound `127.0.0.1:8000`, so the speaker could not fetch
   the MP3 from `http://10.20.219.8:8000/tts-audio/...`. Fixed by binding `0.0.0.0:8000`
   (now reflected in `deploy/secretary.service`).
2. **Blank GOOGLE_HOME_NAME (code):** `get_listed_chromecasts(friendly_names=[])` matched no
   device when the name was blank. Fixed in `app/services/tts.py` to discover via
   `get_chromecasts(known_hosts=[ip])` and match by host — `GOOGLE_HOME_NAME` is now truly optional.

Working `.env` on Pi: GOOGLE_HOME_IP=10.20.219.9, GOOGLE_HOME_LAN_IP=10.20.219.8,
GOOGLE_HOME_NAME=Home 4108 speaker (now optional), WEBHOOK_SECRET set.

Optional remaining checks (tests 2 & 3) can be walked anytime via `/gsd:verify-work 6`.
