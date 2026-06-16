# Project Research Summary — v2.0 "Ingest, Organize, Guide"

**Project:** My Secretary (self-hosted personal assistant, Raspberry Pi 5)
**Milestone:** v2.0 — Ingest LLM-produced payloads, organize the day, guide toward goals
**Researched:** 2026-06-15
**Confidence:** HIGH on stack/architecture; HIGH on goal-tracking + time-blocking patterns; MEDIUM on import-schema design (no dominant standard); guidance kept deliberately simple (no server-side LLM in v2.0)

> Covers v2.0 net-new features only. v1.0 (Task CRUD, Calendar sync, Pushover, TTS, daily brief, routines) is treated as a dependency. The stale v1.0 summary this file replaces is preserved in git history.

---

## Executive Summary

v2.0 adds three layers on top of the shipped v1.0 app: **Ingest** (a versioned JSON contract any external LLM can target → preview → confirm → write), **Goals** (a first-class entity with milestones, linked tasks/routines, and computed progress), and **Organize/Guide** (a deterministic suggest-then-approve day planner plus goal-aware augmentation of the existing daily brief).

The single most important architectural finding: **no new Python dependencies and no server-side LLM are required.** Every feature is buildable on the existing FastAPI + SQLAlchemy 2.0 async + Alembic + Pydantic v2 + React/Vite stack. The user talks to their own LLM externally; the secretary only validates and ingests the resulting JSON.

---

## Recommended Stack Additions

**None — reuse the existing stack.** Specific reuse patterns:

| Need | Reuse | Pattern |
|------|-------|---------|
| Publish the import contract | Pydantic v2 | `model_json_schema()` served at `GET /api/v1/ingest/schema`; paste into the LLM |
| Validate incoming payload | Pydantic v2 | `model_validate_json()`; `schema_version: Literal["1.0"]` for free version gating (422 on mismatch) |
| Goals + Milestones + FKs | SQLAlchemy 2.0 + Alembic | New `Goal`/`Milestone` models; `goal_id` + `external_key` columns on Task/Routine; `lazy="selectin"` for async |
| Day planner | Hand-rolled greedy interval-fill (~50 lines) | Pure deterministic function: tasks + events → `ProposedSchedule`; writes nothing. `PuLP`/`ortools`/`timeboard` all ruled out as wrong-size |
| Ingest + plan UI | Native React 19 | `<textarea>` paste + `<input type=file>` + `FileReader`; timeline rendered as divs (same pattern as existing agenda). No new FE libs |

**Explicit blocklist (do NOT add):** server-side LLM/Anthropic SDK, `jsonschema` (Pydantic covers it), `react-hook-form`/`tanstack-query`/`react-dropzone`, any solver library, CSV/iCal parsers.

---

## Feature Landscape (P1 → P3)

**P1 — Goals + Ingest foundation (Phase 8):** Goals CRUD, Milestone child model, Task `goal_id`+`estimated_minutes`, Routine `goal_id`, versioned import schema + documented LLM prompt, ingest endpoint (validate → preview → confirm → write), paste/upload UI, Goals list+detail view, progress % computed from linked-task completion.

**P2 — Organize + Guide (Phase 9):** gap-finding day planner, priority + goal-urgency sort, peak-hours setting, buffer blocks, propose-then-approve UI, local plan storage (no calendar write), "next best task" surface, goal snapshot in daily brief, stall detection, weekly digest job, milestone-completion celebration (reuses TTS + Pushover).

**P3 / deferred (v2.1+):** Google Calendar write-back for approved blocks, partial-ingest conflict report, mid-day re-plan, LLM-driven coaching.

**Anti-features (out of scope, single-user self-hosted):** habit streaks/streak counters, gamification/points, OKR scoring, social/sharing, daily motivational pushes, notification-per-completion, any review that requires manual input.

---

## Architecture Highlights

```
External LLM (user-driven) ──emits──> JSON payload
        │ paste/upload
        ▼
/ingest/preview ──_resolve(payload, dry_run=True)──> diff (creates/updates)   [no writes]
/ingest/confirm ──_resolve(payload, dry_run=False)─> goals→tasks→routines      [one transaction]
        │ match on external_key (not title); payload-hash dedup
        ▼
   Goal / Milestone / Task(goal_id, estimated_minutes) / Routine(goal_id)
        │
planner_service.propose_day_plan(tasks, events) ──pure fn──> ProposedBlock[]   [no writes]
POST /plan/approve ──delete-then-insert for date_key──> ScheduledBlock         [only writer]
        │
guidance_service.build_goal_summary() ──SYNC──> injected into existing brief.py
```

- **Ingest is stateless preview-then-commit:** client resends the full payload on confirm (no server-side pending state). Two endpoints share one private `_resolve(payload, session, dry_run)`.
- **Match on `external_key`** (stable slug the LLM assigns), never on title → idempotent re-import.
- **Migration chain (current HEAD 0005):** 0006 goals → 0007 task FK/estimate cols → 0008 routine FK → 0009 scheduled_blocks. All `external_key`/FK columns nullable. Write all four before `alembic upgrade head`.
- **Guidance service must be SYNC** (same `create_engine`+`sessionmaker` pattern as existing `brief.py`/`tts_settings.py`) — async-in-thread-pool would deadlock under APScheduler.
- **Planner is a plain on-demand function**, NOT an APScheduler job. Only `/plan/approve` persists.
- Existing 8 routers untouched; only `brief.py`, `scheduler.py`, `main.py`, `models/__init__.py`, `Today.tsx`, `agenda.ts` get targeted additions.

---

## Top Pitfalls & Guardrails

### Critical (build the guard before the feature)
1. **Ingest idempotency** — re-import silently duplicates without `external_key` matching + a payload-hash/`IngestRecord` dedup guard. Build before the first commit path.
2. **Destructive overwrite** — blindly `session.merge()`-ing over user-edited rows is the hardest bug to recover from. Preview must show a diff; respect `user_modified_at` / conflict handling.
3. **UTC everywhere** — naive datetimes produce wrong time blocks twice a year (DST). Establish a UTC policy before any planner time-arithmetic.
4. **All-day / multi-day calendar events** — Google returns `start.date` (not `start.dateTime`); unnormalized events crash gap-finding. Normalize to `(start_dt, end_dt, is_all_day)`.
5. **APScheduler job duplication** — every new job (stall detection, weekly digest) needs explicit `id=` + `replace_existing=True`. Silent failure = duplicate Pushover spam.
6. **Alembic multiple heads** — adding 4 tables in one milestone risks branched revisions; verify `alembic heads` returns exactly one.

### Watch
- Recurring-task expansion can flood the planner — cap/expand deliberately.
- Stale plan when the calendar changes after approval — re-plan, don't silently drift.
- Notification budget across v1 + v2 jobs — audit all Pushover paths before adding guidance nudges; keep guidance pull-not-push (weekly digest + brief snapshot, nudge only on genuine 7+ day stall).
- Orphaned `goal_id` links on task delete — use `ON DELETE SET NULL`.

---

## Open Questions (decide during phase planning)
- Habits: recurring-task `habit` flag (recommended for v2.0) vs. own table (defer to v3).
- Stall threshold (7 vs 14 days) — make it a user setting, not hardcoded.
- Weekly digest delivery — Pushover primary; TTS opt-in (Sunday TTS can be jarring).
- `user_timezone` as an explicit DB setting vs. relying on Pi system tz.
- `IngestRecord` retention policy.

---

## Phase Ordering Recommendation

| Phase | Focus | Gate Test |
|-------|-------|-----------|
| 8 | Goals entity + Import contract (ship together) | Paste an LLM payload → preview shows N goals/tasks/routines → confirm → they appear, progress % renders; re-import creates no duplicates |
| 9 | Day auto-organize + goal guidance | Request a day plan → proposed blocks fill gaps around calendar events → approve → plan shows in Today; daily brief includes goal snapshot; stalled goal triggers a nudge |

> v2.0 phases start at **Phase 8** (Phase 7 Outlook ICS is owned by a separate concurrent effort). The architecture research suggested optionally splitting guidance into its own Phase 10; roadmapper to decide based on size.

---

*Synthesized 2026-06-15 from STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md for My Secretary v2.0.*
