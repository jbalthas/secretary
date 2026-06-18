---
phase: 11-goal-guided-guidance
verified: 2026-06-18T00:00:00Z
status: human_needed
score: 8/9 must-haves verified
re_verification: false
human_verification:
  - test: "Today page — FocusBanner visible with a pending task"
    expected: "A banner reading 'Focus on' with the task title appears above the agenda, indigo left border"
    why_human: "Requires a running frontend+backend with at least one active goal and pending linked task"
  - test: "Today page — FocusBanner absent when no pending task exists"
    expected: "No banner element rendered; no empty box, no error message"
    why_human: "Requires clearing all pending tasks and reloading the page"
  - test: "Settings Guidance section — stall-threshold saves and reloads"
    expected: "Enter 14, Save, reload — field shows 14"
    why_human: "Requires live browser interaction to confirm persistence across page reload"
  - test: "Settings Guidance — validation rejects out-of-range input"
    expected: "Entering 0 or 400 shows red border and 'Enter a number between 1 and 365.' without saving"
    why_human: "Requires browser interaction to observe error state"
---

# Phase 11: Goal-Guided Guidance Verification Report

**Phase Goal:** Proactively surface goal progress — daily brief includes a Goals snapshot, a daily stall-nudge fires for inactive goals, and the Today page shows a "Focus on:" banner with the highest-scoring pending task.
**Verified:** 2026-06-18
**Status:** human_needed (automated checks pass; UI behavior needs manual confirmation)
**Re-verification:** No — initial verification

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| GUIDE-01 | 11-02 | Daily brief includes goal snapshot — each active goal's progress % and most-urgent linked task | ✓ SATISFIED | `brief.py` builds `goal_lines` per active goal with `_compute_progress_sync`; appends `"\nGoals:"` section; `test_brief_body_includes_goal_snapshot` passes |
| GUIDE-02 | 11-03, 11-04 | Today view surfaces next-best task by priority × goal urgency × due-date proximity | ✓ SATISFIED (pending human UI check) | `guidance.py` endpoint + D-06 scoring verified; `useNextBestTask` hook wired into `Today.tsx`; `FocusBanner` renders above agenda; both scoring tests pass |
| GUIDE-03 | 11-01, 11-02, 11-04 | Stall nudge fires when a goal has no completions for configurable threshold (default 7 days) | ✓ SATISFIED (pending human UI check) | `guidance_service.py` stall detection + rate limit verified; `schedule_stall_check` wired to lifespan; settings API round-trips; stall tests pass; Settings UI Guidance section present |

Note: REQUIREMENTS.md shows GUIDE-01 as `[ ]` (Pending) while GUIDE-02 and GUIDE-03 are checked. The implementation for GUIDE-01 is complete — `brief.py` contains the Goals section and the test passes. The REQUIREMENTS.md checkbox appears to not have been updated after implementation.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Daily brief body includes a Goals section per active goal with progress % and most-urgent linked task | ✓ VERIFIED | `brief.py` lines 60–96; `"\nGoals:"` appended; `test_brief_body_includes_goal_snapshot` passes |
| 2 | Brief TTS speech summarizes active goal count + top 2–3 goals, not full enumeration | ✓ VERIFIED | `brief.py` lines 160–164; top 3 by `target_date`; `test_brief_speech_goal_summary` passes |
| 3 | A daily stall-check job fires at 08:05, detecting goals inactive beyond threshold | ✓ VERIFIED | `scheduler.py` `schedule_stall_check` with `CronTrigger` 08:05; wired in `main.py` lifespan |
| 4 | Stall nudge is rate-limited to once per calendar day via `last_guidance_sent_date` | ✓ VERIFIED | `guidance_service.py` line 63 checks `cfg.last_guidance_sent_date == today`; `test_stall_rate_limit` passes |
| 5 | Goals with zero linked non-habit tasks are never flagged as stalled | ✓ VERIFIED | `_find_stalled_goals` skips goals where `not linked`; `test_stall_no_tasks_not_stalled` passes |
| 6 | GET /api/v1/guidance/next-best-task scores pending non-habit tasks by D-06 and returns the top one | ✓ VERIFIED | `guidance.py` `PRIORITY_WEIGHT`, `_score_task`, `Task.is_habit == False`; scoring tests pass |
| 7 | Today page shows "Focus on:" banner with highest-scoring task above the agenda | ? UNCERTAIN | Code verified: `FocusBanner` at line 105, between `h1` and `groups.map`; needs visual confirmation |
| 8 | Banner is absent when no pending task returned | ? UNCERTAIN | `FocusBanner` returns `null` when `task` prop is null; needs runtime confirmation |
| 9 | Settings Guidance section saves and validates stall threshold (1–365, default 7) | ? UNCERTAIN | Code verified: `useStallThreshold`, validation at line 120, hint at line 367; needs browser confirmation |

**Score:** 6/6 automated truths verified; 3/3 UI truths have correct code but need human confirmation.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/migrations/versions/0010_guidance_columns.py` | Migration: `completed_at`, `stall_threshold_days`, `last_guidance_sent_date` | ✓ VERIFIED | All 3 columns present; `down_revision = '0009'` |
| `backend/app/models/__init__.py` | Task.completed_at + AppSettings columns | ✓ VERIFIED | All 3 mapped columns confirmed |
| `backend/app/services/guidance_service.py` | SYNC stall detection + send_stall_nudge + rate-limit | ✓ VERIFIED | `_find_stalled_goals`, `send_stall_nudge`, `last_guidance_sent_date` gate; no `async def` |
| `backend/app/services/brief.py` | Goal snapshot in build_brief_body + build_brief_speech | ✓ VERIFIED | `_compute_progress_sync`, `Goals:` section, `active goals` speech line |
| `backend/app/routers/guidance.py` | Async GET /guidance/next-best-task + D-06 scoring | ✓ VERIFIED | `next-best-task`, `PRIORITY_WEIGHT`, `_score_task`, `is_habit == False` |
| `backend/app/scheduler.py` | schedule_stall_check daily cron | ✓ VERIFIED | `def schedule_stall_check`, `id="stall_check"` |
| `frontend/src/hooks/useNextBestTask.ts` | One-shot fetch of /guidance/next-best-task | ✓ VERIFIED | `/api/v1/guidance/next-best-task`, `d ?? null` |
| `frontend/src/hooks/useStallThreshold.ts` | GET/PUT /settings/stall-threshold | ✓ VERIFIED | Correct URL, `method: "PUT"` |
| `frontend/src/pages/Today.tsx` | FocusBanner above agenda | ✓ VERIFIED | `useNextBestTask` imported, `FocusBanner` at line 105 between h1 and groups.map |
| `frontend/src/pages/Settings.tsx` | Guidance section with stall-threshold input | ✓ VERIFIED | `useStallThreshold`, `Stall threshold (days)`, validation, hint text |
| `backend/tests/test_guidance.py` | All guidance test stubs | ✓ VERIFIED | 7 test functions confirmed; all pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `backend/app/routers/tasks.py` | `Task.completed_at` | transition guard in update_task | ✓ WIRED | `was_completed = task.completed` + `task.completed_at = datetime.now(timezone.utc)` |
| `backend/app/scheduler.py` | `guidance_service.send_stall_nudge` | CronTrigger daily job id=stall_check | ✓ WIRED | `from app.services.guidance_service import send_stall_nudge` inside function |
| `backend/app/main.py` | `schedule_stall_check` | lifespan startup | ✓ WIRED | `schedule_stall_check()` called at line 42 |
| `backend/app/main.py` | `guidance.router` | `app.include_router` | ✓ WIRED | `app.include_router(guidance.router)` at line 62 |
| `frontend/src/pages/Today.tsx` | `/api/v1/guidance/next-best-task` | useNextBestTask hook | ✓ WIRED | Hook imported and used; `FocusBanner task={nextBest}` rendered |
| `frontend/src/pages/Settings.tsx` | `/api/v1/settings/stall-threshold` | useStallThreshold hook | ✓ WIRED | Hook imported; `save` called in `handleSaveStall` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `Today.tsx` FocusBanner | `nextBest` | `GET /api/v1/guidance/next-best-task` → DB query `select(Task).where(...)` | Yes — real DB query in `guidance.py` | ✓ FLOWING |
| `Settings.tsx` stall threshold | `stallDays` | `GET /api/v1/settings/stall-threshold` → `session.get(AppSettings, 1)` coalesced to 7 | Yes — DB read with default fallback | ✓ FLOWING |
| `brief.py` Goals section | `goals` | `select(Goal).where(Goal.status == "active")` | Yes — real DB query | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All Phase 11 guidance tests pass | `pytest tests/test_guidance.py tests/test_tasks.py::test_completed_at_stamped tests/test_settings.py::test_stall_threshold_roundtrip` | 9 passed | ✓ PASS |
| Full test suite — no Phase 11 regressions | `pytest -q` | 131 passed, 1 pre-existing failure in `test_calendar.py::test_callback_stores_credentials` (OAuth route 404 — unrelated to Phase 11) | ✓ PASS |
| Frontend TypeScript compiles clean | `npx tsc --noEmit` | No output (exit 0) | ✓ PASS |

### Anti-Patterns Found

No blockers found. `guidance_service.py` has no `async def` (correct — APScheduler 3.x sync requirement). No stub return values in rendered components. `FocusBanner` correctly returns `null` when task is absent — not a stub, it is the specified behavior.

### Human Verification Required

#### 1. FocusBanner visible with a pending task

**Test:** Start backend + frontend. Ensure at least one active goal with a pending linked task exists. Open the Today page.
**Expected:** A "Focus on" banner appears above the agenda with the task title and an indigo left border.
**Why human:** Visual rendering with live data cannot be verified by static analysis.

#### 2. FocusBanner absent when no pending task exists

**Test:** Ensure all tasks are completed (or create a fresh user with no pending tasks). Open Today.
**Expected:** No banner element, no empty box, no error message.
**Why human:** Requires runtime state to confirm absence.

#### 3. Settings stall-threshold saves and reloads

**Test:** Open Settings → Guidance section. Confirm the field shows 7 by default. Enter 14, click Save. Reload the page.
**Expected:** Field shows 14 after reload.
**Why human:** Persistence across page reload requires browser interaction.

#### 4. Settings stall-threshold validates out-of-range input

**Test:** Enter 0 (or 400) and click Save.
**Expected:** Red border appears on the input; "Enter a number between 1 and 365." shown; nothing saved.
**Why human:** Requires browser interaction to observe error state rendering.

### Requirements Coverage Note

REQUIREMENTS.md has GUIDE-01 marked `[ ]` (incomplete) while GUIDE-02 and GUIDE-03 are marked `[x]`. The GUIDE-01 implementation is present and tested. The checkbox should be updated to `[x]`.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_
