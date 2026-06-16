# My Secretary

## What This Is

A self-hosted personal secretary running on a Raspberry Pi 5. It handles scheduling, task management, push notifications, recurring routines, and bidirectional Google Home voice integration. Accessible from anywhere via Tailscale VPN.

## Core Value

One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

## Current Milestone: v2.0 "Ingest, Organize, Guide"

**Goal:** The secretary ingests LLM-produced structured payloads into first-class goals, tasks, and routines; tracks progress toward those goals; and proactively guides the day by proposing an approved schedule around calendar events.

**Target features:**
- **Import contract** — a stable, versioned JSON schema plus a documented prompt the user runs in any LLM, which emits the payload
- **Ingest flow** — a validating endpoint and UI to paste/upload the payload, preview what it will create, confirm, then write goals/tasks/routines
- **Goals entity** — first-class career/life goals with target dates, linked tasks/routines, and progress reporting
- **Day auto-organize** — proposes time-blocks around synced calendar events; the user approves before anything commits
- **Goal-guided guidance** — surfaces goal progress and next-best actions (augmented daily brief / dedicated view / proactive nudges)

**Key context:**
- External LLM flow — no API key or cost in v2.0; built-in server-side chat deferred to a future milestone
- Suggest-then-approve scheduling — no silent auto-commit
- Builds on existing Task/Routine/Calendar models; adds Goals + Ingest + Planning as new layers
- Phase 7 (Outlook ICS) is owned by a separate concurrent effort — v2.0 numbering starts at Phase 8

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
- Reminders and the daily brief announce on the Google Home speaker alongside Pushover, ad-hoc TTS is triggerable from the web UI, and a secret-guarded webhook triggers the brief (Validated in Phase 6: google-home-tts — NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06; code + 53 backend tests verified, hardware speaker gate pending human test on Pi deploy)

### Active

**v2.0 — Ingest, Organize, Guide:**
- [ ] Stable versioned import contract (JSON schema) + documented LLM prompt
- [ ] Validating ingest endpoint + UI (paste/upload → preview → confirm → write)
- [ ] First-class Goals entity with target dates, linked tasks/routines, progress reporting
- [ ] Day auto-organize: propose time-blocks around calendar events, user approves before commit
- [ ] Goal-guided guidance: progress + next-best-action surfacing

**v1.0 (carried over / pending validation):**
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
- [x] Pi → Google Home TTS announcements for reminders — Phase 6 (hardware gate pending)
- [x] Google Home routine trigger → Pi daily brief — Phase 6 (secret-guarded webhook)

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
*Last updated: 2026-06-15 — started milestone v2.0 (Ingest, Organize, Guide)*
