---
phase: 16-advisory-ingest-sync-review-ui
verified: 2026-07-05T00:00:00Z
status: passed
score: 10/10 must-have truths verified (across 5 plans)
---

# Phase 16: Advisory Ingest + Sync Review UI Verification Report

**Phase Goal:** User can paste an LLM advisory JSON response into the Sync page, preview a per-item diff with rationale, accept or reject individual rows, and confirm the accepted subset — applied atomically and idempotently — closing the full advisory loop.
**Verified:** 2026-07-05
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AdvisoryPayload validates the advisorPrompt.ts example payload and rejects unknown keys | ✓ VERIFIED | `backend/app/schemas/advisory.py` — all 4 models have `ConfigDict(extra="forbid")`; `test_advisory_schema.py` 10/10 pass in isolation |
| 2 | rationale REQUIRED on every GoalAdjustment/MilestoneAdjustment/TaskCreation | ✓ VERIFIED | Fields declared `rationale: str` with no default on all three models; tests `test_rationale_required_*` pass |
| 3 | Forbidden ops schema-blocked (no goal create/status/title/type change; TaskCreation has no id) | ✓ VERIFIED | `GoalAdjustment` only carries `target_date`/`priority_rank`/`rationale`; `TaskCreation` has no `id` field; `extra="forbid"` rejects any additional key |
| 4 | Backward-compat: IngestPayload validates with payload_type omitted | ✓ VERIFIED | `schemas/ingest.py` has `payload_type: Literal["standard"] = "standard"`; `test_ingest.py` still green |
| 5 | Migration 0018 creates advisory_log, adds last_advisory_at + priority_rank, applies/reverses cleanly | ✓ VERIFIED | `alembic current` reports `0018 (head)`; migration file has correct `down_revision="0017"`, unique index, batch_alter_table for both columns, and symmetric downgrade |
| 6 | dry_run_advisory performs zero DB writes, returns field-level diff with rationale | ✓ VERIFIED | `advisory_service.dry_run_advisory` uses only `select()` calls, no `session.add`/`flush`/`commit`; `test_preview_no_writes` passes |
| 7 | apply_advisory is atomic (`async with session.begin()`) — mid-apply error leaves zero rows persisted | ✓ VERIFIED | Code wraps entire apply in single `session.begin()`; `test_atomic_rollback` monkeypatches `_upsert_task` to fail on 2nd call, asserts goal.target_date unchanged AND no AdvisoryLog row written |
| 8 | apply_advisory is idempotent on advisory_id (replay returns original result, no dupes) | ✓ VERIFIED | Idempotency SELECT at top of `apply_advisory`; `test_idempotent_replay` confirms twice, asserts `replayed=True` on 2nd call, identical counts, exactly 1 AdvisoryLog row |
| 9 | New tasks reuse ingest_service._upsert_task (no fork); estimated_minutes persists | ✓ VERIFIED | `apply_advisory` calls `ingest_service._upsert_task` directly; `_upsert_task` sets `estimated_minutes` on both create and update branches (`ingest_service.py:74,87`) |
| 10 | payload.notes never assigned to any entity field | ✓ VERIFIED | Manual code review: `.notes` only read into `AdvisoryPreviewResult` return value; no `.notes =` assignment onto Goal/Milestone/Task anywhere in `advisory_service.py` |
| 11 | HTTP routes: GET /schema, POST /preview (422 on bad rationale/unknown key), POST /confirm (422 on unknown key), GET /last-sync | ✓ VERIFIED | `routers/advisory.py` implements all four; `ValueError` mapped to `HTTPException(422)`; registered in `main.py` via `app.include_router(advisory.router)` |
| 12 | CI grep guard fails build on anthropic/openai/litellm import | ✓ VERIFIED | `.github/workflows/ci.yml` contains the exact grep-and-exit-1 step; locally `grep -rc "anthropic\|openai\|litellm" backend/app/` returns 0 everywhere |
| 13 | Sync page: paste-only textarea + Run preview posts to /preview, grouped diff (Goals/Milestones/New tasks) with entity·field·old→new and rationale always visible | ✓ VERIFIED | `Advisor.tsx` has `<textarea>` + "Run preview" button, `AdvisoryDiffGroup` renders three named groups with per-field lines and rationale as always-visible sub-text (not hover/tooltip) |
| 14 | Rows default accepted; Confirm posts only accepted subset | ✓ VERIFIED | `accepted[key] ?? true` default-checked logic; `handleConfirm` filters `goal_adjustments`/`milestone_adjustments`/`new_tasks` by the `accepted` map before posting |
| 15 | advisory_id computed client-side as hash of FULL pasted reply (pre-filter) | ✓ VERIFIED | `computeAdvisoryId(fullPayload)` called on the unfiltered `fullPayload` state (captured at parse time before any row rejection), not on `acceptedPayload` |
| 16 | Notes render as accent callout above diff; staleness banner non-blocking; Confirm stays enabled | ✓ VERIFIED | Notes callout section renders before diff review section; staleness banner computed from `generated_at` > 7 days, Confirm button `disabled` only on `confirming`/`acceptedCount===0`, not on staleness |
| 17 | After Confirm, page stays on /advisor, shows in-page summary + Link to /goals, no auto-navigate | ✓ VERIFIED | `handleConfirm` calls `setSummary(res)` only; no `navigate()` call anywhere in file; `<Link to="/goals">` present |
| 18 | Header shows "Last advisor sync: N days ago" from AppSettings.last_advisory_at | ✓ VERIFIED | `fetchLastSync()` on mount and after confirm; `daysAgo()` helper renders the header line |
| 19 | advisorPrompt.ts embeds the real AdvisoryPayload.model_json_schema() output, no [SCHEMA BLOCK] placeholder remains | ✓ VERIFIED | `grep -c "\[SCHEMA BLOCK\]"` = 0; file contains `"properties"` and `"goal_adjustments"` from the actual generated schema |
| 20 | Prompt instructs LLM to echo both session_id AND generated_at | ✓ VERIFIED | Line ~110: "Copy both `session_id` AND `generated_at` from the Advisor Brief header verbatim..." |

**Score:** 20/20 truths verified (superset covering all 5 plans' must_haves)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/schemas/advisory.py` | AdvisoryPayload + nested models | ✓ VERIFIED | 87 lines, all 9 classes present, `extra="forbid"` on all input models |
| `backend/app/models/__init__.py` | AdvisoryLog + AppSettings.last_advisory_at | ✓ VERIFIED | Confirmed via import + migration |
| `backend/app/models/goal.py` | Goal.priority_rank | ✓ VERIFIED | Confirmed via migration + service usage |
| `backend/migrations/versions/0018_*.py` | Migration 0018 | ✓ VERIFIED | `alembic current` = 0018 (head); clean up/down |
| `backend/tests/test_advisory_schema.py` | Schema tests | ✓ VERIFIED | 10/10 pass in isolation |
| `backend/app/services/advisory_service.py` | dry_run_advisory + apply_advisory | ✓ VERIFIED | 198 lines, both functions present, atomic + idempotent logic confirmed by code read |
| `backend/tests/test_advisory_service.py` | Atomic/idempotent/etc tests | ✓ VERIFIED | 10 tests; 9 pass cleanly in isolation, 1 (`test_milestone_rename`) passes its assertion but errors during session-scoped fixture teardown (pre-existing infra issue, see below) |
| `backend/app/routers/advisory.py` | 4 routes | ✓ VERIFIED | 45 lines, all 4 routes present and registered |
| `backend/app/main.py` | advisory.router registration | ✓ VERIFIED | `app.include_router(advisory.router)` present |
| `backend/tests/test_advisory_routes.py` | Route tests | ✓ VERIFIED | 7/7 pass in isolation |
| `.github/workflows/ci.yml` | LLM-import grep guard | ✓ VERIFIED | Step present with correct exit-1-on-match logic |
| `frontend/src/types/goal.ts` | Advisory diff types + priority_rank | ✓ VERIFIED | tsc --noEmit exits 0 |
| `frontend/src/lib/advisoryId.ts` | computeAdvisoryId | ✓ VERIFIED | Canonical-JSON + SHA-256 implementation, no shortcuts |
| `frontend/src/hooks/useAdvisory.ts` | preview/confirm hook | ✓ VERIFIED | Modeled on useIngest; parse422 reused; 4/4 unit tests pass |
| `frontend/src/pages/Advisor.tsx` | Full UI | ✓ VERIFIED | 435 lines; all D-01 through D-11 constraints present in code |
| `backend/scripts/regen_advisor_schema.py` | Schema regen script | ✓ VERIFIED | Runs, outputs valid JSON schema with `properties.goal_adjustments` |
| `frontend/src/lib/advisorPrompt.ts` | Embedded schema + dual echo | ✓ VERIFIED | Placeholder gone, schema embedded, echo instruction updated |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ingest.py` | `IngestPayload.payload_type` | Literal default | ✓ WIRED | `payload_type: Literal["standard"] = "standard"` present, backward-compat test green |
| `advisory_service.py` | `ingest_service._upsert_task` | direct call, no fork | ✓ WIRED | `await ingest_service._upsert_task(ti, goal_id, session)` at line 179 |
| `advisory_service.py` | `AdvisoryLog` | idempotency + result_json replay | ✓ WIRED | SELECT-then-insert pattern confirmed, `result.model_dump_json` stored and replayed |
| `routers/advisory.py` | `advisory_service` | preview/confirm calls | ✓ WIRED | Both routes call service functions and map ValueError→422 |
| `main.py` | `advisory.router` | include_router | ✓ WIRED | Confirmed present at main.py line 86 |
| `Advisor.tsx` | `useAdvisory.ts` | preview/confirm state | ✓ WIRED | `const advisory = useAdvisory()` used throughout |
| `Advisor.tsx` | `advisoryId.ts` | client-computed hash over full reply | ✓ WIRED | `computeAdvisoryId(fullPayload)` called on unfiltered payload before confirm |
| `Advisor.tsx` | `GET /api/v1/advisory/last-sync` | header data source | ✓ WIRED | `fetchLastSync()` called on mount and after confirm |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `Advisor.tsx` diff groups | `advisory.previewResult` | `POST /api/v1/advisory/preview` → `dry_run_advisory` → real SELECT queries against Goal/Milestone tables | Yes | ✓ FLOWING |
| `Advisor.tsx` header "Last advisor sync" | `lastAdvisoryAt` | `GET /api/v1/advisory/last-sync` → real `AppSettings` row read | Yes | ✓ FLOWING |
| `apply_advisory` result | `created`/`updated` counts | Real DB mutation counts from goal/milestone/task loops, not hardcoded | Yes | ✓ FLOWING |
| Task.estimated_minutes | `TaskCreation.estimated_minutes` → `TaskImport.estimated_minutes` → `_upsert_task` | Assignment confirmed on both create/update branches | Yes | ✓ FLOWING (guards against silent-drop) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend schema tests | `pytest tests/test_advisory_schema.py -q` (isolated) | 10 passed | ✓ PASS |
| Backend service tests | `pytest tests/test_advisory_service.py -q` (isolated) | 9 passed, 1 error in session-teardown only (assertion itself passed) | ✓ PASS (see anti-pattern note below) |
| Backend route tests | `pytest tests/test_advisory_routes.py -q` (isolated) | 7 passed | ✓ PASS |
| Full backend suite (natural order) | `pytest -q` | 194 passed, 4 failed, 1 error — all in the pre-existing conftest.py class (test_brief.py x2, test_calendar.py, test_plan.py, test_weekly_brief.py); zero advisory-authored test failures | ✓ PASS (pre-existing issue, not a Phase 16 regression) |
| Migration round-trip | `alembic current` | `0018 (head)` | ✓ PASS |
| CI grep guard | `grep -rc "anthropic\|openai\|litellm" backend/app/` | 0 everywhere | ✓ PASS |
| Frontend typecheck | `npx tsc --noEmit` | exits 0 | ✓ PASS |
| Frontend unit test | `npx vitest run src/hooks/useAdvisory.test.ts` | 4 passed | ✓ PASS |
| Frontend build | `npm run build` | succeeds, dist output produced | ✓ PASS |
| Schema regen script | `python scripts/regen_advisor_schema.py` | valid JSON with `properties.goal_adjustments` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ADVISE-01 | 16-01, 16-03 | Advisory payload discriminator + schema, extra="forbid" | ✓ SATISFIED | Schemas + GET /schema route |
| ADVISE-02 | 16-02, 16-03, 16-05 | Goal/milestone field adjustments with rationale, matched by external_key/(goal,title) | ✓ SATISFIED | Service diff logic + milestone rename test |
| ADVISE-03 | 16-01 | Forbidden ops schema-blocked | ✓ SATISFIED | GoalAdjustment field set + extra="forbid" |
| ADVISE-04 | 16-02, 16-04 | Per-item diff preview, no DB writes | ✓ SATISFIED | dry_run_advisory + Advisor.tsx diff UI |
| ADVISE-05 | 16-02, 16-03 | Atomic + idempotent confirm, last_advisory_at stamp | ✓ SATISFIED | session.begin() + AdvisoryLog idempotency + stamping |
| ADVISE-06 | 16-02, 16-04 | notes never persisted, surfaced prominently | ✓ SATISFIED | No entity assignment of notes; accent callout above diff |
| ADVISE-07 | 16-04 | Per-row accept/reject, confirm accepted subset only | ✓ SATISFIED | accepted map + filtered payload construction |
| ADVISE-08 | 16-02 | New task creation via shared _upsert_task, idempotent external_key | ✓ SATISFIED | Direct reuse, `advisory-{advisory_id}-{i}` key pattern |
| SYNC-01 | 16-04 | Single dedicated /advisor page, full loop, no navigation away | ✓ SATISFIED | Advisor.tsx extends existing page, all sections present |
| SYNC-02 | 16-04 | Last-sync line + non-blocking staleness warning | ✓ SATISFIED | Header line + staleness banner, Confirm stays enabled |
| PROMPT-01 | 16-05 | Auto-generated schema block, echo session_id + generated_at | ✓ SATISFIED (out of declared scope but delivered) | advisorPrompt.ts updated, script created |

No orphaned requirements found — REQUIREMENTS.md maps all 10 declared IDs (ADVISE-01 through 08, SYNC-01/02) to plans that claim them via frontmatter `requirements:` fields, and PROMPT-01 (declared complete at end of Phase 16 per REQUIREMENTS.md row) is covered by 16-05.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/tests/conftest.py` | 19, 37 | `asyncio.get_event_loop_policy().get_event_loop()` — deprecated/broken pattern on Python 3.13 + Windows ProactorEventLoopPolicy, causes RuntimeError in session-scoped fixture teardown when run alongside certain other test files | ℹ️ Info (pre-existing, documented) | Causes test-order-dependent failures across test_brief.py, test_calendar.py, test_plan.py, test_weekly_brief.py, and one advisory test (`test_milestone_rename`) errors during its own fixture teardown after its assertions pass. This is the exact class of issue already documented in `deferred-items.md` and confirmed present on pre-Phase-16 code. NOT a Phase 16 regression — no advisory-authored test logic is broken. |

No blocker anti-patterns found in Phase 16-authored code. No stub returns, no placeholder JSX, no orphaned wiring, no empty handlers.

### Human Verification Required

None required for automated-coverage items — golden path (paste → preview → diff review → accept/reject → confirm → stay on page → summary + Goals link) is exercised end-to-end by `test_advisory_routes.py::test_confirm_ok` / `test_confirm_idempotent` at the API layer and by direct code inspection of `Advisor.tsx` for the UI layer. Recommended but optional manual pass:

### 1. Visual golden path

**Test:** Paste a sample multi-entity advisory reply into the running app, run preview, uncheck one row, confirm, re-paste the same reply.
**Expected:** Grouped diff with rationale visible, unchecked row excluded from confirm, page stays on /advisor with summary, re-confirm shows "(already applied)".
**Why human:** Visual rendering and interactive click-through were verified via code review + automated route/hook tests but not via a live browser render.

### Gaps Summary

No gaps found. All 20 derived observable truths across the 5 plans (16-01 through 16-05) are verified against actual code: schemas correctly enforce validation constraints, the service layer is genuinely atomic and idempotent (verified via monkeypatched failure injection and double-confirm tests with real assertions), routes are registered and map errors correctly, the frontend implements every UI constraint (paste-only, default-accept, always-visible rationale, notes callout, non-blocking staleness, stay-on-page success, client-side full-payload hashing), and the prompt embed was completed in 16-05 with the real generated schema.

The only finding is the previously-documented, pre-existing `conftest.py` session-scoped test DB / event-loop-policy issue, which is a known test-infrastructure defect unrelated to Phase 16's implementation — confirmed via isolated per-file test runs (all advisory test files pass their own assertions) and via the full-suite natural-order run (194/199 pass, all 5 failures/errors belong to the documented pre-existing class, zero advisory-test-logic failures).

---

_Verified: 2026-07-05_
_Verifier: Claude (gsd-verifier)_
