# Milestones — My Secretary

## v2.0 — Ingest, Organize, Guide (Shipped: 2026-06-23)

**Scope:** 4 phases (8–11), 16 plans. Requirements: INGEST-01–08, GOAL-01–06, PLAN-01–02, GUIDE-01–03.

**Key accomplishments:**

- **Goals & Milestones as first-class entities** — `GoalStatus` enum (active/archived/completed), live `progress_pct` computed from task + milestone aggregates (never stored), and completion celebrations via Pushover/TTS.
- **Versioned ingest contract** — `GET /ingest/schema` (generated from the Pydantic model) + a documented LLM prompt; validate → dry-run preview diff → atomic transactional commit; idempotent upsert matched on a stable `external_key` across goals, tasks, routines, and habits.
- **Goals UI + Ingest page** — goals list/detail with milestones and archiving, goal-linking in the Task and Routine drawers, and a paste/upload payload flow with preview diff and field-level 422 errors.
- **Day Auto-Organize** — pure deterministic `propose_day_plan` first-fit packer plus five plan endpoints (propose/approve/replan/blocks/delete); approved blocks fold into Today's agenda as Planned/staleness-badged items, with an editable Work Hours card in Settings.
- **Goal-Guided Guidance** — stall-nudge Pushover alerts (configurable threshold) and goal context + next-best-task focus woven into the existing daily brief.

> Note: v1.0 and v2.0 were both completed before being formally archived; this entry records v2.0 retroactively. v2.1 "Close the Loop" (Phases 12–13) was already in progress at archival time and remains the active milestone.

---

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

> Note: v1.0 was not run through `/gsd:complete-milestone` (no formal audit/archive); this entry records its history retroactively.

---
