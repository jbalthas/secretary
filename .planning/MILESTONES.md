# Milestones — My Secretary

## v1.0 — Core Secretary (shipped 2026-06-15)

Foundation through Google Home TTS. All 6 phases code-complete; the TTS path is live on the Pi (hardware speaker gate passed).

**Phases:**
1. Foundation — Pi provisioning, FastAPI + async SQLite + Alembic, Tailscale HTTPS, systemd, nginx
2. Tasks & Agenda — task CRUD, recurring tasks, filterable list, merged today's agenda
3. Pushover Reminders — reminders fire via Pushover, reboot-safe, dedup-guarded
4. Calendar Sync — Google OAuth, incremental sync, 410 re-sync, revocation alert
5. Daily Brief & Routines — configurable morning brief, custom reboot-safe routines
6. Google Home TTS — speaker announcements for reminders + brief, ad-hoc TTS, secret-guarded brief webhook

**Requirements delivered:** INFRA-01–07, TASK-01–07, CAL-01–06, NOTIF-01–06 (CAL-07 routines pending final validation).

> Note: v1.0 was not run through `/gsd:complete-milestone` (no formal audit/archive); this entry records its history retroactively at the start of v2.0.

---

## v2.0 — Ingest, Organize, Guide (in progress, started 2026-06-15)

Ingest LLM-produced structured payloads into first-class goals, tasks, and routines; track progress toward goals; proactively guide the day with an approve-before-commit schedule. Phases start at Phase 8 (Phase 7 Outlook ICS owned by a separate concurrent effort).
