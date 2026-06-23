# My Secretary

## What This Is

A self-hosted personal secretary running on a Raspberry Pi 5. It handles scheduling, task management, push notifications, recurring routines, and bidirectional Google Home voice integration. Accessible from anywhere via Tailscale VPN.

## Core Value

One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

## Current Milestone: v2.1 "Close the Loop"

**Goal:** Keep the day's plan accurate as it unfolds — the secretary checks in, the user logs progress in seconds (no manual reorganizing), and the schedule self-corrects.

**Target features:**
- **Mid-day check-in** — configurable Pushover (+ optional Google Home TTS) reminder(s) prompting the user to log what they've done, deep-linking into the app
- **Quick-update capture** — an in-app box on the Today tab; phone keyboard dictation is the voice path (zero new dependencies)
- **No-LLM update resolution** — most updates (mark done / reschedule / drop) resolved by fuzzy-matching against today's existing scheduled blocks/tasks with pure server-side logic
- **Messy-dump escape hatch** — multi-intent updates routed through the existing external-LLM ingest contract, extended with an "intra-day update" payload type (server only validates JSON)
- **End-of-day rollup** — surfaces what slipped and feeds the existing rollover logic so unfinished items carry forward

**Key context:**
- HARD CONSTRAINTS (locked since v2.0): no new dependencies; **no server-side LLM**; minimize API/token cost
- Reuse Pydantic v2, SQLAlchemy/Alembic, native React, APScheduler, Pushover/TTS — all already in the codebase
- Builds directly on shipped pieces: plan-task completion, scheduled_blocks, the planner, the daily brief, and the ingest pipeline
- Phase numbering continues from v2.0 — this milestone starts at Phase 12

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
- Goals, milestones, and habits are first-class DB entities; the versioned import contract is live; the ingest endpoint validates, commits atomically, and is idempotent (Validated in Phase 8: goals-ingest-backend — GOAL-01/02/03/06, INGEST-01/02/04/06/07; 20 phase tests green, live Pushover+TTS celebration delivery pending human test on Pi)
- Goals are manageable from the web UI (list, drill-in detail, milestones, archive); tasks and routines link to goals via a shared dropdown; the Ingest page paste/uploads an LLM JSON payload, previews a per-entity dry-run diff, then confirms (Validated in Phase 9: goals-ingest-ui — GOAL-04/05, INGEST-03/05; 18/18 verifier must-haves, golden-path human UAT approved)
- The backend resolves free-text progress updates to mark done / reschedule / drop by fuzzy-matching today's blocks and tasks with no LLM call, fires a configurable mid-day check-in notification that survives reboots, and accepts an intra-day update payload on the ingest contract (Validated in Phase 12: update-resolution-engine — UPDATE-02/03, NOTIF-07, INGEST-08; 12/12 verifier must-haves, 10 phase tests green)

### Active

**v2.1 — Close the Loop (requirements defined in REQUIREMENTS.md):**
- [x] Mid-day check-in reminder(s) — configurable Pushover/TTS prompt to log progress, deep-links into app — Phase 12 (NOTIF-07)
- [ ] Quick-update capture box on Today (keyboard-dictation voice path, no new deps)
- [x] No-LLM update resolution — fuzzy-match mark done / reschedule / drop against today's blocks/tasks — Phase 12 (UPDATE-02/03)
- [x] Messy-dump escape hatch — intra-day update payload type on the existing external-LLM ingest contract — Phase 12 (INGEST-08)
- [ ] End-of-day rollup feeding existing rollover logic

**v2.0 — Ingest, Organize, Guide (complete):**
- [x] Stable versioned import contract (JSON schema) + documented LLM prompt — Phase 8 backend
- [x] Validating ingest endpoint + UI (paste/upload → preview → confirm → write) — backend (Phase 8) + UI (Phase 9)
- [x] First-class Goals entity with target dates, linked tasks/routines, progress reporting — backend (Phase 8) + UI (Phase 9)
- [x] Day auto-organize: propose time-blocks around calendar events, user approves before commit — Phase 10
- [x] Goal-guided guidance: progress + next-best-action surfacing — Phase 11

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
*Last updated: 2026-06-22 — Milestone v2.1 "Close the Loop" started (intra-day update loop); v2.0 complete (Phases 8–11)*
