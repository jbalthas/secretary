# My Secretary

## What This Is

A self-hosted personal secretary running on a Raspberry Pi 5. It handles scheduling, task management, push notifications, recurring routines, and bidirectional Google Home voice integration. Accessible from anywhere via Tailscale VPN.

## Core Value

One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.

## Current Milestone: v2.2 "LLM Advisory Loop"

**Goal:** Make the secretary the system-of-record for a periodic advisory sync — it exports a rich picture of progress for an external LLM to reason over, and ingests the LLM's timeline/goal adjustments back in. The LLM is the brain the user brings; the secretary organizes everything and remembers history.

**Target features:**
- **Context export ("brief for the LLM")** — one action that bundles goals, milestones, planned-vs-actual, completion/reschedule history, and momentum into a structured payload (Markdown + JSON) to paste into an external LLM. The outbound half the system does not yet have.
- **Progression substrate** — capture history over time (goal-progress snapshots, plan adherence, what slipped/carried) so "track my progression" has real trend data, not just current state.
- **Advisory ingest** — extend the existing versioned-JSON ingest contract with an "advisory" payload type so the LLM can push back adjusted timelines, re-prioritized goals, and new milestones — each with rationale the user reviews before it lands.
- **Sync review UI** — a place to run the loop: export → (paste to LLM) → ingest decisions → see a diff of what changed and why.
- **Advisor prompt/protocol doc** — a documented prompt (sibling to the existing ingest prompt) telling the external LLM how to act as a career/engineering advisor and what JSON to emit.

**Key context:**
- HARD CONSTRAINTS (locked since v2.0): no new dependencies; **no server-side LLM**; minimize API/token cost — this milestone EXTENDS the external-LLM ingest pattern, it does not overturn it
- Reuse Pydantic v2 (`model_json_schema` + versioned payload), SQLAlchemy/Alembic, native React, the daily-brief/guidance services — all already in the codebase
- North star: maximize the user's time and accelerate their growth as an engineer/career person
- Phase numbering continues — this milestone starts at Phase 14
- **v2.1 "Close the Loop" remains open** — Phase 13 (Quick-update capture box, End-of-day rollup) is unfinished and was intentionally not completed before starting v2.2

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
- The Sync page exports a complete token-budgeted advisory brief (goals career/learning-first, planned-vs-actual, 7-day calendar counts with no titles per D-05, momentum trend, stalled goals) and a documented advisor prompt in one click, with no server-side LLM dependency (Validated in Phase 15: context-export-advisor-prompt — EXPORT-01..06, PROMPT-01; 8/8 verifier must-haves, 14 backend tests green, live in-browser round-trip confirmed on Pi)

### Active

**v2.2 — LLM Advisory Loop (requirements being defined in REQUIREMENTS.md):**
- [x] Context export bundle (Markdown + JSON) of goals, planned-vs-actual, history, momentum for an external LLM — Phase 15 (EXPORT-01..06)
- [ ] Progression substrate — historical progress/adherence snapshots, not just current state
- [ ] Advisory ingest payload type — LLM-adjusted timelines, re-prioritized goals, new milestones with rationale
- [ ] Sync review UI — export → ingest → diff of what changed and why
- [x] Documented advisor prompt/protocol (sibling to the ingest prompt) — Phase 15 (PROMPT-01; [SCHEMA BLOCK] swap deferred to Phase 16)

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
*Last updated: 2026-06-30 — Phase 15 (Context Export + Advisor Prompt) complete: outbound half of the advisory loop shipped (EXPORT-01..06, PROMPT-01); Milestone v2.2 "LLM Advisory Loop" in progress; v2.1 "Close the Loop" left open mid-Phase-13; v2.0 complete (Phases 8–11)*
