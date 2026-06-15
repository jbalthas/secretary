---
phase: 06-google-home-tts
plan: 04
subsystem: frontend-tts
tags: [frontend, react, hooks, settings, tts, google-home]

requires:
  - phase: 06-google-home-tts
    plan: 02
    provides: POST /api/v1/tts, GET/PUT /api/v1/settings/tts endpoints

provides:
  - frontend/src/hooks/useGoogleHome.ts: fetch hook exposing speak(), setEnabled(), ttsEnabled
  - frontend/src/pages/Settings.tsx: Google Home card (text input + Speak button + tts_enabled toggle)

affects: []

tech-stack:
  added: []
  patterns:
    - "useGoogleHome mirrors useBriefSettings: GET on mount, PUT/POST with ok-boolean return"
    - "Google Home section mirrors Daily Brief card: SECTION_LABEL_STYLE + CARD_STYLE + btn-save"

key-files:
  created:
    - frontend/src/hooks/useGoogleHome.ts
  modified:
    - frontend/src/pages/Settings.tsx

decisions:
  - "Google Home section placed between Daily Brief and Routines — consistent visual ordering"
  - "tts_enabled toggle uses native checkbox (not styled switch) — mirrors existing drawer-field pattern"

metrics:
  duration: 1min
  completed: 2026-06-15
---

# Phase 6 Plan 04: Google Home UI Card Summary

**useGoogleHome hook (GET/PUT settings, POST tts) + Google Home card in Settings (input + Speak + tts_enabled toggle) mirroring the Daily Brief card pattern (D-08) — pending hardware gate**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-06-15T02:41:07Z
- **Completed:** 2026-06-15T02:42:02Z (Task 1 only; Task 2 is a hardware gate)
- **Tasks:** 1/2 (Task 2 is checkpoint:human-verify)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Created `frontend/src/hooks/useGoogleHome.ts` — mirrors `useBriefSettings.ts` exactly: async `useEffect` GET on mount, `setEnabled(value)` → PUT `/api/v1/settings/tts`, `speak(text)` → POST `/api/v1/tts`. Returns `{ ttsEnabled, loading, error, setEnabled, speak }`.
- Updated `frontend/src/pages/Settings.tsx` — added Google Home section between Daily Brief and Routines. Uses existing `SECTION_LABEL_STYLE` and `CARD_STYLE`. Card contains: text input (`ttsText`), Speak button (`className="btn-save"`) with in-flight disable, inline error on speak failure, and a labelled checkbox for `tts_enabled` backed by `setEnabled`.
- `npx tsc --noEmit` exits 0 — no type errors.

## Task Commits

1. **Task 1: useGoogleHome hook + Google Home card in Settings.tsx** — `7a230db` (feat)

## Files Created/Modified

- `frontend/src/hooks/useGoogleHome.ts` — useGoogleHome hook: ttsEnabled state, GET/PUT settings, POST tts
- `frontend/src/pages/Settings.tsx` — Google Home section added (lines ~214–270)

## Decisions Made

- Google Home section inserted between Daily Brief and Routines sections for natural flow.
- Native `<input type="checkbox">` for tts_enabled toggle — consistent with project style preference for explicit over clever.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no hardcoded empty data or placeholders. Hook fetches live from `/api/v1/settings/tts`.

## Issues Encountered

None.

## Checkpoint Status

**Task 2 (hardware gate) not yet passed.** Awaiting user to:
1. Set `GOOGLE_HOME_IP`, `GOOGLE_HOME_LAN_IP`, `GOOGLE_HOME_NAME`, `WEBHOOK_SECRET` in `backend/.env`
2. Run `alembic upgrade head` on the Pi
3. Restart the secretary service
4. `curl -X POST http://<PI_LAN_IP>:8000/api/v1/tts -H "Content-Type: application/json" -d '{"text":"Secretary test, one two three"}'` — confirm HTTP 200 and speaker speaks within ~10s
5. Open Settings page over Tailscale, type phrase, click "Speak" — confirm speaker speaks

## Self-Check: PASSED

- `frontend/src/hooks/useGoogleHome.ts` — created and committed `7a230db`
- `frontend/src/pages/Settings.tsx` — modified and committed `7a230db`

---
*Phase: 06-google-home-tts*
*Task 1 completed: 2026-06-15 | Task 2 (hardware gate): awaiting human*
