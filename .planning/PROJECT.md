# My Secretary

## What This Is

A self-hosted personal secretary running on a Raspberry Pi 5. It handles scheduling, task management, push notifications, recurring routines, and bidirectional Google Home voice integration. Accessible from anywhere via Tailscale VPN.

## Core Value

One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

## Context

- **Platform:** Raspberry Pi 5, fresh Raspberry Pi OS
- **Access:** Home network + remote via Tailscale (no port forwarding)
- **Interaction:** Web UI (browser dashboard) + Google Home voice + Pushover push notifications
- **Owner:** Jack B, solo personal use

## Architecture Decisions

- **Backend:** FastAPI (Python) — lightweight, async, easy to integrate with Google APIs
- **Database:** SQLite — local, zero-config, sufficient for personal use
- **Frontend:** React + Vite — fast dev, runs as static files served by backend
- **Scheduler:** APScheduler — cron-style jobs for routines and reminders
- **Reverse proxy:** nginx — serves the UI, handles HTTPS locally
- **Remote access:** Tailscale — VPN mesh, no port forwarding required
- **Notifications:** Pushover — reliable push to phone, simple API
- **Google integration:** Google Calendar API (sync) + IFTTT webhooks (Google Home voice → Pi)
- **Pi → Google Home:** Google Home SDK / Routines webhook or Chromecast TTS

## Requirements

### Validated

- Pushover notifications for task reminders fire reliably and survive Pi reboots (Validated in Phase 3: pushover-reminders — NOTIF-01 complete, reboot gate pending human test)
- Daily brief fires at a UI-configurable time with today's agenda, and custom recurring routines (cron) persist across reboots (Validated in Phase 5: daily-brief-routines — CAL-06, CAL-07, NOTIF-02; golden-path human UAT passed)

### Active

- [ ] Pi OS and service setup (nginx, systemd, Python env)
- [ ] Tailscale installed and accessible remotely
- [ ] FastAPI backend running as systemd service
- [ ] React web dashboard with task and schedule views
- [ ] SQLite schema for tasks, events, routines
- [ ] Google Calendar OAuth + bidirectional sync
- [ ] Task CRUD via web UI and API
- [x] Recurring routines (daily brief, custom schedules) — Phase 5
- [ ] Pushover notifications for reminders and events
- [ ] IFTTT webhook → Pi API for "add task" voice commands
- [ ] Pi → Google Home TTS announcements for reminders
- [ ] Google Home routine trigger → Pi daily brief

### Out of Scope

- Multi-user support — personal use only
- Mobile native app — web UI is sufficient
- Public internet exposure — Tailscale handles remote access securely

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tailscale over port forwarding | Security — no open ports on home router | — Pending |
| Pushover over ntfy | Reliability, minimal setup, $5 one-time vs ongoing self-host burden | — Pending |
| IFTTT for Google Home → Pi | Google Home doesn't natively webhook; IFTTT bridges the gap easily | — Pending |
| SQLite over Postgres | Single user, local only, zero ops overhead | — Pending |
| APScheduler over Celery | No broker needed for single-node personal use | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-14 after Phase 5 (daily-brief-routines) completion*
