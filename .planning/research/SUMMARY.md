# Project Research Summary

**Project:** My Secretary (self-hosted personal assistant, Raspberry Pi 5)
**Domain:** IoT / self-hosted personal productivity
**Researched:** 2026-06-12
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

Self-hosted personal secretary on Pi 5 — task management, Google Calendar sync, proactive notifications (Pushover + Google Home TTS), and voice input (Google Assistant via IFTTT). Pattern: single-process Python async backend (FastAPI + APScheduler in-process) with SQLite, served behind nginx, accessed remotely via Tailscale. React SPA built on dev machine, served as static files — no Node.js on the Pi at runtime.

Top risks are operational: Google OAuth refresh tokens expire in 7 days if consent screen stays in "Testing" mode; APScheduler jobs duplicate on restart without dedup guards; SQLite locks under concurrent access without WAL mode. None are hard to prevent if addressed upfront.

Tailscale Funnel (not just Tailscale VPN) is required for IFTTT to reach the Pi — this is the project's biggest live-verification unknown.

---

## Recommended Stack

| Component | Technology | Version | Notes |
|-----------|-----------|---------|-------|
| OS | Raspberry Pi OS Bookworm | Debian 12 | 64-bit default on Pi 5 |
| Runtime | Python | 3.12 | Install via `uv python install 3.12` |
| Backend | FastAPI | 0.128.x | `fastapi[standard]` includes uvicorn |
| ASGI server | Uvicorn | (via fastapi[standard]) | Single worker only |
| Scheduler | APScheduler | 3.11.x | **NOT 4.x** — v4 is alpha with breaking API |
| ORM | SQLAlchemy | 2.0.x async | `create_async_engine` + `AsyncSession` |
| SQLite driver | aiosqlite | 0.20.x | Required for SQLAlchemy async |
| Migrations | Alembic | 1.13.x | From day one |
| Google Calendar | google-api-python-client | 2.x | + google-auth-oauthlib 1.x |
| HTTP client | httpx | 0.27.x | Async Pushover calls |
| TTS (outbound) | pychromecast + gTTS | 14.x / 2.5.x | Pi → Google Home speaker |
| Voice (inbound) | IFTTT free tier | — | Google Assistant → webhook |
| Frontend | React + Vite | 19.2.x / 8.x | Built on dev machine, rsync'd to Pi |
| Reverse proxy | nginx | 1.26.x | HTTPS via Tailscale cert |
| Remote access | Tailscale | latest | Funnel required for IFTTT |
| Python env | uv | latest | Replaces pip/virtualenv |

---

## Table Stakes Features (v1 Must-Haves)

1. Task CRUD (create / edit / complete) — core interaction loop
2. Today's agenda view (tasks + events merged)
3. Google Calendar read sync (OAuth + incremental polling)
4. Pushover reminders fire reliably (missed reminders = lost trust)
5. Persist across Pi reboots (systemd `Restart=always`)
6. Responsive web UI usable on phone
7. Remote access via Tailscale
8. Voice "add task" via Google Assistant → IFTTT → webhook
9. Daily brief delivered proactively (morning push, not pull)
10. Recurring routines with cron precision

**Differentiators worth building in v1:**
- Pi → Google Home TTS announcements for reminders and daily brief
- Custom daily brief content (configurable template)

**Defer to v2:**
- Google Calendar event write
- Pushover action buttons
- Voice queries beyond pre-set trigger phrases

---

## Architecture Overview

```
Browser (Tailscale) ──→ nginx :443 ──→ /api/* → FastAPI :8000
Phone (Pushover)    ←──                       ↕
Google Home (TTS)   ←── pychromecast (LAN)    APScheduler (in-process)
Google Assistant    ──→ IFTTT ──→ nginx :443 ──→ /webhooks/ifttt
Google Calendar     ↔── OAuth2 polling (5 min incremental sync)
                                               ↕
                                          SQLite .db
```

**Hard constraints:**
- Single uvicorn worker only — multiple = duplicate APScheduler fires
- pychromecast serves MP3 over LAN; Pi must be on same subnet as Google Home
- WAL mode set before any concurrent writes begin
- `replace_existing=True` + explicit `id=` on every APScheduler job

---

## Top Pitfalls

### Critical (will break in prod)

1. **Google OAuth 7-day token expiry** — Publish consent screen to "In production" immediately. Add Pushover alert on `invalid_grant`.
2. **APScheduler job duplication on restart** — Always use `id=` + `replace_existing=True`; use SQLAlchemyJobStore.
3. **SQLite locking** — `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000` at startup.
4. **Tailscale Funnel required for IFTTT** — VPN alone is private; IFTTT can't reach it. Enable `tailscale funnel 443`.
5. **AsyncIOScheduler not BackgroundScheduler** — FastAPI runs on the event loop; thread-based scheduler breaks async SQLAlchemy.

### Likely

6. **pychromecast mDNS fails post-reboot** — Use static DHCP reservation + `known_hosts=[<ip>]` to bypass mDNS.
7. **gTTS requires internet** — Cache by text hash; pre-generate static MP3s for common phrases as fallback.
8. **systemd starts before network** — `After=network-online.target time-sync.target tailscaled.service` + exponential backoff.

---

## Key Open Questions (Live Verification Required)

| Question | Risk | Fallback |
|----------|------|---------|
| Does `tailscale funnel 443` reach IFTTT's servers? | All voice commands fail | Router port-forward |
| Can personal Gmail publish OAuth consent to "In production"? | Calendar sync dies in 7 days | Re-add self as test user periodically |
| Does pychromecast work with specific Google Home/Nest device? | TTS never works | Use Home Assistant or REST endpoint |
| Is IFTTT free tier still 1 applet with webhook trigger in 2026? | Voice integration paywalled | Make.com or abandon voice input |

---

## Phase Ordering Recommendation

| Phase | Focus | Gate Test |
|-------|-------|-----------|
| 1 | Pi OS, FastAPI skeleton, nginx, Tailscale | `curl https://secretary.ts.net/api/v1/health` returns 200 from phone |
| 2 | Task CRUD + React UI | Add task from phone browser, see it appear |
| 3 | Pushover reminders + APScheduler | Task reminder fires to phone at set time |
| 4 | Google Calendar OAuth + sync | Google Calendar event appears in app within 5 min |
| 5 | Daily brief + recurring routines | 8am brief fires as Pushover with agenda summary |
| 6 | IFTTT voice input + Tailscale Funnel | "Hey Google, add task X" → task in UI |
| 7 | Google Home TTS announcements | `POST /api/v1/tts` → Google Home speaks message |

Phases 1–5 are high-confidence. Phases 6–7 have external unknowns with defined fallbacks.
