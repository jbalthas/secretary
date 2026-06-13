---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-06-13T00:24:31.376Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 4
---

# Project State

## Current Phase

Phase 1 — Foundation (Pi setup, FastAPI, nginx, Tailscale)

## Current Plan

Plan 4 of 4 (01-04 next)

## Status

in-progress

## Last Updated

2026-06-12

---

## Project Reference

**Core value:** One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

**Current focus:** Phase 01 — foundation

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
- [01-02] @vitejs/plugin-react ^6 required for Vite 8 (v4 peer constraint excludes Vite 8)
- [Phase 02-03]: NavLink style callback used for isActive; types/task.ts created in 02-03 since 02-01 ran in parallel

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

Last session: 2026-06-13T00:24:31.374Z
Next action: Execute 01-04 (bootstrap orchestration)
