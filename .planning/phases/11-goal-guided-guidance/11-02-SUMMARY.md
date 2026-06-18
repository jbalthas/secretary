---
phase: 11-goal-guided-guidance
plan: 02
subsystem: api
tags: [guidance, goals, stall-detection, brief, pushover, apscheduler, sqlalchemy-sync]

requires:
  - phase: 11-01
    provides: completed_at on Task, stall_threshold_days + last_guidance_sent_date on AppSettings
  - phase: 08-goals-ingest-backend
    provides: Goal model with status/tasks relationship, GoalStatus enum
  - phase: 06-google-home-tts
    provides: brief.py SYNC engine pattern, PushoverClient

provides:
  - guidance_service.py — SYNC stall detection, rate-limited send_stall_nudge
  - brief.py goal snapshot section (body: per-goal pct + next task; speech: count + top 3)
  - schedule_stall_check daily 08:05 APScheduler job wired into lifespan

affects: [11-03, 11-04]

tech-stack:
  added: []
  patterns:
    - "SYNC service with create_engine/_Session mirrors brief.py pattern (not async)"
    - "get_stalled_goals() public wrapper around _find_stalled_goals() for test injection"
    - "Goal queries inside existing _Session block (Pitfall 3: no second session)"

key-files:
  created:
    - backend/app/services/guidance_service.py
  modified:
    - backend/app/services/brief.py
    - backend/app/scheduler.py
    - backend/app/main.py

key-decisions:
  - "[11-02] get_stalled_goals() is the public API for tests; _find_stalled_goals() takes an open session for in-transaction use"
  - "[11-02] build_brief_body() and build_brief_speech() query goals inside existing _Session block — no second session opened"
  - "[11-02] send_stall_nudge() returns False (not None) on rate-limit so tests can assert skip behavior"
  - "[11-02] Nothing scheduled today. fallback preserved in build_brief_speech() only when both titles AND goals are empty"

patterns-established:
  - "Stall detection: exclude zero-non-habit-task goals; recently = any task with completed_at >= cutoff"
  - "Rate gate pattern: check AppSettings.last_guidance_sent_date == today, update on fire"

requirements-completed: [GUIDE-01, GUIDE-03]

duration: 6min
completed: 2026-06-18
---

# Phase 11 Plan 02: Goal-Guided Guidance (Brief + Stall Detection) Summary

**SYNC guidance_service.py with stall detection + rate-limited Pushover nudge; brief.py extended with per-goal progress snapshot in body and active-goals summary in speech**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-18T14:41:50Z
- **Completed:** 2026-06-18T14:47:25Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- guidance_service.py: `get_stalled_goals()` / `_find_stalled_goals()` / `send_stall_nudge()` all SYNC; zero-task goals excluded (D-10); once-per-day rate gate (D-14)
- brief.py: `_compute_progress_sync()` added; `build_brief_body()` appends `Goals:` section with pct + next task per active goal; `build_brief_speech()` appends count + top 3 by target_date
- scheduler.py: `schedule_stall_check()` daily 08:05 CronTrigger, `id="stall_check"`, replace_existing=True
- main.py: `schedule_stall_check()` called in lifespan after `schedule_daily_brief()`

## Task Commits

1. **Task 1: guidance_service.py** - `7635df9` (feat)
2. **Task 2: brief.py goal snapshot** - `bb391ad` (feat)
3. **Task 3: schedule_stall_check + lifespan** - `eba0e6c` (feat)

## Files Created/Modified
- `backend/app/services/guidance_service.py` - SYNC stall detection + rate-limited nudge job target
- `backend/app/services/brief.py` - Goal snapshot in body/speech + _compute_progress_sync helper
- `backend/app/scheduler.py` - schedule_stall_check() registration function
- `backend/app/main.py` - Import + call schedule_stall_check() in lifespan

## Decisions Made
- `get_stalled_goals()` public wrapper exposes stall list for test injection without requiring a session argument; internal `_find_stalled_goals(session, days)` reused in `send_stall_nudge()` in-transaction
- `send_stall_nudge()` returns `False` explicitly on rate-limit (test-assertable), `None` otherwise
- `build_brief_speech()` "Nothing scheduled today." fallback preserved only when both agenda AND goals are empty — consistent with original contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] build_brief_speech empty-schedule fallback broken**
- **Found during:** Task 2 (brief.py goal snapshot)
- **Issue:** Removing the `if not titles: return "Good morning. Nothing scheduled today."` guard broke test_brief.py::test_build_brief_speech_empty
- **Fix:** Added explicit early return when both `titles` and `goals` are empty
- **Files modified:** backend/app/services/brief.py
- **Verification:** `pytest tests/test_brief.py` all passing
- **Committed in:** bb391ad (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor correctness fix; no scope change.

## Issues Encountered
- Worktree was behind main repo (missing 11-01 commits). Resolved via `git fetch /c/Projects/My\ Secretary master && git merge FETCH_HEAD`. Pre-existing test_calendar.py failure (`test_callback_stores_credentials`) confirmed present in main repo — out of scope.

## Next Phase Readiness
- guidance_service.py is importable and SYNC — Plan 11-03 (next-best-task endpoint) can import directly
- All GUIDE-01/GUIDE-03 service tests pass; GUIDE-02 stubs (next-best-task) fail as expected for Plan 11-03

---
*Phase: 11-goal-guided-guidance*
*Completed: 2026-06-18*
