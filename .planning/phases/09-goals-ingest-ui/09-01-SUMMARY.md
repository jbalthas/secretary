---
phase: 09-goals-ingest-ui
plan: 01
subsystem: ingest-backend
tags: [ingest, preview, goals, routines, dry-run]
requires:
  - "Ingest apply_import + external_key matching (Phase 08)"
  - "Routine.goal_id column (migration 0008)"
provides:
  - "POST /api/v1/ingest/preview — read-only create/update diff"
  - "IngestPreviewResult + EntityDiff schemas"
  - "goal_id on RoutineCreate/Update/Read schemas"
affects:
  - "Phase 09 UI (09-02..04) consumes /ingest/preview for the preview-before-confirm step"
tech-stack:
  added: []
  patterns:
    - "Read-only dry-run resolver (_exists) mirrors _upsert_* SELECT, never writes"
    - "Stateless preview: client resends full payload on confirm (no server-side pending state)"
key-files:
  created: []
  modified:
    - backend/app/schemas/ingest.py
    - backend/app/services/ingest_service.py
    - backend/app/routers/ingest.py
    - backend/app/schemas/routine.py
    - backend/tests/test_ingest.py
decisions:
  - "EntityDiff.title maps RoutineImport.name (routines use .name not .title)"
  - "Habits previewed as Task rows matched on Task.external_key (same as apply_import)"
  - "No router change for routine goal_id — model_dump() + setattr loop already pass it through"
metrics:
  duration: "~2 min"
  completed: 2026-06-16
  tasks: 2
  files: 5
---

# Phase 09 Plan 01: Ingest Preview Endpoint Summary

Read-only `POST /api/v1/ingest/preview` returning a per-entity create-vs-update diff (reusing the Phase 08 `external_key` matching logic but writing nothing), plus `goal_id` surfaced on the routine Pydantic schemas to satisfy the GOAL-05 routine half.

## What Was Built

- **`/ingest/preview` route** — accepts the same `IngestPayload` as `/confirm`, so invalid payloads get the identical HTTP 422 via Pydantic validation.
- **`dry_run_import`** — pure read-only resolver. A shared `_exists(model, external_key, session)` helper runs `select(model).where(model.external_key == ...)` for goals, tasks, routines, and habits; returns `action="update"` when found, else `"create"`. No `session.begin/flush/add/commit`.
- **`EntityDiff` / `IngestPreviewResult` schemas** — `{external_key, title, action}` arrays grouped by goals/tasks/routines/habits.
- **Routine `goal_id`** — added to `RoutineCreate`, `RoutineUpdate`, `RoutineRead`. No router change needed; existing `Routine(**body.model_dump())` and the patch `setattr` loop pass it through, and the column exists from migration 0008.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — failing preview tests (TDD RED) | 2e8e598 | backend/tests/test_ingest.py |
| 2 | Preview schema + dry_run_import + /preview route + routine goal_id (GREEN) | 2edeb3c | ingest.py (schema/service/router), routine.py |

## Verification

- `pytest backend/tests/test_ingest.py backend/tests/test_goals.py -q` → 24 passed.
- Full suite: 106 passed, 1 pre-existing unrelated failure (`test_calendar.py::test_callback_stores_credentials` — fails identically with this plan's changes stashed; logged in deferred-items.md).
- 4 preview tests cover: create diff, update badge, writes-nothing, and 422 on bad payload.

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

- `test_calendar.py::test_callback_stores_credentials` fails pre-existing (out of scope, not caused by ingest preview). Documented in `.planning/phases/09-goals-ingest-ui/deferred-items.md`.

## Self-Check: PASSED
- FOUND: backend/app/services/ingest_service.py (dry_run_import)
- FOUND: backend/app/routers/ingest.py (/preview)
- FOUND: backend/app/schemas/ingest.py (IngestPreviewResult)
- FOUND: backend/app/schemas/routine.py (goal_id x3)
- FOUND: commit 2e8e598
- FOUND: commit 2edeb3c
