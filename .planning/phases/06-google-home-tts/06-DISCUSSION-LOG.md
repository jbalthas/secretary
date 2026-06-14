# Phase 6: Google Home TTS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 06-google-home-tts
**Areas discussed:** Announcement wording, Delivery & failures, Ad-hoc UI + device, Endpoint security

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Announcement wording | Reminder phrasing + how the daily brief is read aloud | |
| Delivery & failures | TTS alongside Pushover; behavior when speaker unreachable; global on/off toggle | |
| Ad-hoc UI + device | Where the Speak control lives; device configured in UI vs env; single vs group | |
| Endpoint security | Auth for POST /api/v1/tts and the routine webhook | |

**User's choice:** "You decide" — user deferred all gray areas to Claude's recommended defaults.
**Notes:** No interactive deep-dive requested. Claude locked recommended defaults for every area,
grounded in existing codebase patterns (PushoverClient, Settings card/hook, scheduler hook points)
and prior-phase decisions (pychromecast known_hosts, gTTS caching, sync services).

---

## Announcement wording — Claude's default

- Reminder: `"Reminder: {title}"` (+ `". {description}"` if present). No priority readout.
- Brief: separate spoken formatter, "Good morning." greeting, bullets/columns stripped, natural sentences; "Nothing scheduled today." when empty.
- Ad-hoc: speaks submitted text verbatim.

## Delivery & failures — Claude's default

- TTS fires alongside Pushover (Pushover first/independent).
- Best-effort: failures caught, logged, swallowed; never block Pushover.
- No "speaker unreachable" alert in v1.
- Global `tts_enabled` toggle (default on); quiet hours deferred.

## Ad-hoc UI + device — Claude's default

- "Google Home" card in Settings (text input + Speak button + toggle), mirroring Daily Brief card.
- Device fixed in `.env` (`google_home_ip`), single device; groups deferred.

## Endpoint security — Claude's default

- Routine-trigger brief webhook requires shared-secret token (`webhook_secret`) — called from outside Tailscale.
- `POST /api/v1/tts` protected by Tailscale boundary only, consistent with other endpoints.

## Deferred Ideas

- Quiet hours, per-item TTS opt-in, speaker groups, speaker-unreachable alerting, voice input (already v2).
