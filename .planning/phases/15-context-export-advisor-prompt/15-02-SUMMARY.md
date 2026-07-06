---
phase: 15-context-export-advisor-prompt
plan: 02
subsystem: backend-export
tags: [export, advisor-brief, sync-service, fastapi]
requires:
  - 15-01 (RED test scaffold: tests/test_export.py, export bundle contract)
  - brief._compute_progress_sync (live progress, D-03)
  - guidance_service._find_stalled_goals (stalled list)
  - snapshot_service / GoalProgressSnapshot (migration 0017, trend data)
provides:
  - export_service.build_export_bundle() -> {markdown, session_id, generated_at}
  - export_service._velocity_label(snapshots) -> trend label
  - schemas.export.BundleResponse
  - GET /api/v1/export/bundle (sync)
affects:
  - Phase 16 advisory ingest / sync review UI (consumes the exported brief)
tech-stack:
  added: []
  patterns:
    - "Sync service via create_engine + sessionmaker (brief.py boilerplate); FastAPI threadpools sync routes"
    - "All ORM access inside the `with _Session()` block (lazy=selectin needs open session; Pitfall 2 DetachedInstanceError)"
    - "Deferred model/service imports inside functions to keep module load light + preserve test patch targets"
key-files:
  created:
    - backend/app/services/export_service.py
  modified:
    - backend/app/schemas/export.py
    - backend/app/routers/export.py
decisions:
  - "[15-02] Calendar load renders all 7 days (today..+6) with explicit 0 counts, not only days with events — gives the LLM a complete week shape; titles never rendered (D-05)"
  - "[15-02] Token-budget truncation re-renders goal sections + block summary with compact=True only if len(markdown)//4 > 30000; never drops a whole goal (D-06/D-07)"
  - "[15-02] overdue compares t.due_date (tz-stripped) < datetime.now(); top tasks sorted by (-priority_rank, due_date or datetime.max), cap 3"
metrics:
  duration: "~6 min"
  completed: 2026-06-29
  tasks: 2
  files: 3
  tests: "8/8 export green; 171/172 full suite (1 pre-existing unrelated failure)"
---

# Phase 15 Plan 02: Backend Export Bundle Summary

Sync `export_service.build_export_bundle()` assembles the advisor brief as a Markdown string (goals ordered career/learning-first with live progress, milestones, top-3 tasks, overdue count, 4-week trend + velocity label), a 14-day planned/completed/slipped block table, a privacy-safe 7-day per-day calendar count, and a stalled-goals list — exposed via a sync `GET /api/v1/export/bundle` returning `BundleResponse`. Turns the 15-01 RED tests GREEN (8/8).

## What Was Built

### Task 1 — export_service.py (commit 4864cc9)
- `_velocity_label(snapshots)`: `<2` → `no_data`; delta `>= +10` → `accelerating`; `<= -5` → `stalling`; else `steady`.
- `build_export_bundle()`: queries active goals, sorts career/learning first then by target_date; renders each goal section inside the session (live `_compute_progress_sync`, milestones, top-3 active tasks, overdue count, last-4 snapshot trend + velocity); 14-day `ScheduledBlock` summary table; 7-day calendar COUNT-only block; stalled goals via `_find_stalled_goals(s, 7)` on the open session.
- Copied brief.py engine boilerplate verbatim; sync only; no LLM imports; no new migration; stateless `uuid4` session_id.

### Task 2 — schema + endpoint (commit 0aeb679)
- Added `BundleResponse(markdown, session_id, generated_at)` alongside the intact `SnapshotResponse`.
- Added sync `@router.get("/bundle")` → `BundleResponse(**export_service.build_export_bundle())`; router already registered in main.py (no wiring change).

## Verification

- `pytest tests/test_export.py -q` → 8/8 green (test_no_llm_imports, test_velocity_label, test_bundle_endpoint, test_bundle_contains_goal_section, test_block_summary, test_goal_ordering, test_calendar_section_privacy, test_trend_no_data).
- `grep -c "async def\|await " export_service.py` → 0; `grep -c "async def" routers/export.py` → 0.
- `grep -rc "anthropic\|openai\|litellm" backend/app/` → 0.
- Alembic HEAD stays 0017 (no new version file).
- Full suite: 171 passed, 1 failed.

## Deviations from Plan

None — plan executed as written.

## Deferred Issues

**1. Pre-existing unrelated test failure (out of scope)**
- `tests/test_calendar.py::test_callback_stores_credentials` fails (404 on `/auth/google/callback`).
- Verified pre-existing: stashed all 15-02 changes and the test still failed — it is a CAL-02 OAuth callback issue, not export-related.
- Per scope boundary (only auto-fix issues caused by the current task), NOT fixed. Logged in `deferred-items.md`.

## Known Stubs

None. The bundle wires real data from goals, milestones, tasks, scheduled blocks, calendar events, and progress snapshots. The empty-state strings (`no_data` trend, `- none` stalled, zero calendar counts) are intentional graceful-degradation outputs, not stubs.

## Self-Check: PASSED
- FOUND: backend/app/services/export_service.py
- FOUND: backend/app/schemas/export.py (BundleResponse)
- FOUND: backend/app/routers/export.py (get_export_bundle)
- FOUND commit: 4864cc9
- FOUND commit: 0aeb679
