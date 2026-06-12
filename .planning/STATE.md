# Project State

## Current Phase
Phase 1 — Foundation (Pi setup, FastAPI, nginx, Tailscale)

## Current Plan
Plan 2 of 4 (01-02 next)

## Status
in-progress

## Last Updated
2026-06-12

---

## Project Reference

**Core value:** One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

**Current focus:** Phase 1 — Foundation (Pi setup, FastAPI, nginx, Tailscale)

---

## Accumulated Context

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

Last session: 2026-06-12 — Executed 01-01 (FastAPI backend skeleton). 3 tasks, 13 files created.
Next action: Execute 01-02 (Pi provisioning / frontend)
