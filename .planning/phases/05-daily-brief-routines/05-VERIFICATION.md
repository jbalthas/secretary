---
phase: 05-daily-brief-routines
verified: 2026-06-14T22:00:00Z
status: passed
score: 3/3 success criteria verified
re_verification: false
human_verification_completed:
  - test: "Brief time shows 08:00 on first load; change and save persists after reload"
    result: PASSED (live UAT on Pi, session 2026-06-14)
  - test: "Add routine — row appears in list"
    result: PASSED (live UAT on Pi)
  - test: "Edit routine — change cron, save, updated value shown"
    result: PASSED (live UAT on Pi)
  - test: "Delete routine — confirm modal shown, row removed on confirm"
    result: PASSED (live UAT on Pi)
  - test: "Invalid cron 'every day 8am' — inline error shown, no save"
    result: PASSED (live UAT on Pi)
gap_closed_during_verification:
  - description: "Missing Alembic migration for app_settings and routines tables"
    detail: >
      Phase 05 plans 02 and 03 added the AppSettings and Routine SQLAlchemy models
      but shipped no migration. On a fresh deploy the tables never existed and all
      settings/routines endpoints 500'd. Fixed by adding
      backend/migrations/versions/0003_add_app_settings_and_routines.py (commit 2d140f2),
      chaining off head 8f8f43ed5ce5. Applied on Pi via `alembic upgrade head`.
    commit: 2d140f2
---

# Phase 05: Daily Brief & Routines — Verification Report

**Phase Goal:** A morning brief fires automatically at a configurable time with today's agenda; users can define custom recurring routines that survive reboots.
**Verified:** 2026-06-14T22:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Gap Closed During Verification

Before verifying the success criteria, one defect was discovered and fixed:

**Missing Alembic migration (commit 2d140f2).** Plans 02 and 03 added `AppSettings` and `Routine` to `backend/app/models/__init__.py` but omitted the Alembic migration. Because `main.py` does not call `create_all` (tables exist only via migrations), the `app_settings` and `routines` tables were absent on the Pi's SQLite DB. All `/api/v1/settings/brief-time` and `/api/v1/routines/` endpoints returned 500. Fixed by adding `backend/migrations/versions/0003_add_app_settings_and_routines.py` with `down_revision = '8f8f43ed5ce5'`, creating both tables with columns matching the models. Migration was applied on the Pi; all endpoints then responded correctly. This gap was confirmed fixed before the human UAT proceeded.

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A Pushover notification with today's agenda summary arrives at the user-configured brief time (default 8am) | VERIFIED | `brief.py::send_daily_brief` calls `PushoverClient().send(title="Good morning", ...)` with body from `build_brief_body()` (real DB queries for tasks + calendar events). `scheduler.py::schedule_daily_brief` registers a CronTrigger job id `daily_brief`. `main.py` lifespan reads `AppSettings` from DB (default 8/0) and calls `schedule_daily_brief` on startup. Test `test_send_daily_brief_calls_pushover_good_morning` passes. |
| 2 | The brief time is configurable from the web UI without editing config files | VERIFIED | `PUT /api/v1/settings/brief-time` persists `brief_hour`/`brief_minute` to `app_settings` table and immediately calls `schedule_daily_brief(hour, minute)` to reschedule the job. `useBriefSettings` hook fetches and saves via that endpoint. `Settings.tsx` renders a `<input type="time">` bound to `timeInput` with a Save button. Test `test_set_brief_time_reschedules_job` passes. Human UAT confirmed change+save+reload persists. |
| 3 | User can create, edit, and delete custom recurring routines (name, cron schedule, action); routines persist and fire correctly after a Pi reboot | VERIFIED | Full CRUD router at `/api/v1/routines/` backed by `Routine` model in DB. `RoutineCreate` schema validates cron via `CronTrigger.from_crontab`; invalid cron returns 422. Each write calls `schedule_routine`/`remove_routine` to sync APScheduler. APScheduler uses `SQLAlchemyJobStore` (not memory), so jobs survive process restart. `RoutineDrawer.tsx` + `useRoutines` hook cover create/edit/delete with confirm modal and inline cron validation. All 5 test_routines tests pass. Human UAT confirmed all CRUD flows including invalid cron inline error and delete confirm modal. |

**Score:** 3/3 success criteria verified

---

### Required Artifacts

| Artifact | Purpose | Status | Details |
|----------|---------|--------|---------|
| `backend/app/services/brief.py` | Build agenda body + send Pushover | VERIFIED | 69 lines. Queries `Task` and `CalendarEvent` via sync SQLAlchemy. Formats timed as `HH:MM title`, untimed as `• title`. Falls back to "Nothing scheduled today." |
| `backend/app/routers/settings.py` | GET/PUT /api/v1/settings/brief-time | VERIFIED | 31 lines. Full read-default + upsert + reschedule. Mounted in `main.py`. |
| `backend/app/routers/routines.py` | CRUD /api/v1/routines/ | VERIFIED | 50 lines. list/create/patch/delete. Validates via Pydantic schema. Syncs APScheduler on each write. Mounted in `main.py`. |
| `backend/app/scheduler.py` | schedule_daily_brief, schedule_routine, remove_routine | VERIFIED | SQLAlchemyJobStore for persistence. CronTrigger.from_crontab for routines. |
| `backend/app/models/__init__.py` | AppSettings, Routine SQLAlchemy models | VERIFIED | `AppSettings` (id, brief_hour, brief_minute). `Routine` (id, name, cron, action enum, enabled, created_at). |
| `backend/migrations/versions/0003_add_app_settings_and_routines.py` | Alembic migration for new tables | VERIFIED | `down_revision = '8f8f43ed5ce5'`. Creates `app_settings` (id, brief_hour, brief_minute) and `routines` (id, name, cron, action enum, enabled, created_at). Column set matches models exactly. |
| `backend/app/schemas/settings.py` | BriefTimeRead, BriefTimeUpdate | VERIFIED | hour/minute with Field(ge=0,le=23) / Field(ge=0,le=59) validation. |
| `backend/app/schemas/routine.py` | RoutineCreate/Update/Read | VERIFIED | field_validator for cron raises ValueError on invalid expression, which FastAPI maps to 422. |
| `frontend/src/pages/Settings.tsx` | Settings UI (brief time + routines) | VERIFIED | 253 lines. Renders brief time input wired to `useBriefSettings`. Renders routines list from `useRoutines`. Opens `RoutineDrawer` for create/edit. |
| `frontend/src/hooks/useBriefSettings.ts` | Fetch/save brief time | VERIFIED | GET on mount; PUT on save; state updated on success. |
| `frontend/src/hooks/useRoutines.ts` | Fetch/mutate routines list | VERIFIED | GET on mount; POST/PATCH/DELETE with refresh after each mutation. |
| `frontend/src/components/RoutineDrawer.tsx` | Create/edit/delete routine drawer | VERIFIED | 185 lines. Client-side cron validation (5 parts). Confirm modal for delete. Error display. |
| `frontend/src/types/routine.ts` | Routine type definitions | VERIFIED | `Routine`, `RoutineInput`, `RoutineAction` interfaces match backend schema. |
| `backend/tests/test_brief.py` | 4 tests for brief service | VERIFIED | All 4 pass. |
| `backend/tests/test_settings.py` | 3 tests for settings router | VERIFIED | All 3 pass. |
| `backend/tests/test_routines.py` | 5 tests for routines router | VERIFIED | All 5 pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `Settings.tsx` | `useBriefSettings` | import + `{ briefTime, loading, error, save }` destructure | WIRED | `timeInput` bound to state; `handleSaveBriefTime` calls `saveBriefTime` |
| `Settings.tsx` | `useRoutines` | import + `{ routines, loading, create, update, remove }` | WIRED | routines list rendered; `onSave`/`onDelete` wired to `RoutineDrawer` |
| `Settings.tsx` | `RoutineDrawer` | import + `<RoutineDrawer open={...} onSave={...} onDelete={...}>` | WIRED | props correctly pass create/update/remove from hook |
| `useBriefSettings` | `PUT /api/v1/settings/brief-time` | `fetch(URL, { method: "PUT", body: JSON.stringify({hour, minute}) })` | WIRED | response checked; state updated on ok |
| `useRoutines` | `/api/v1/routines/` | fetch with POST/PATCH/DELETE + refresh() | WIRED | all mutations call refresh() to sync UI |
| `settings.py router` | `AppSettings` model | `session.get(AppSettings, 1)` | WIRED | upsert pattern; defaults returned when row absent |
| `settings.py router` | `schedule_daily_brief` | called on PUT after commit | WIRED | job reschedule is synchronous and immediate |
| `routines.py router` | `Routine` model | `select(Routine)`, `session.get(Routine, id)` | WIRED | all four HTTP verbs query the model |
| `routines.py router` | `schedule_routine` / `remove_routine` | called after DB commit on POST/PATCH/DELETE | WIRED | APScheduler kept in sync with DB state |
| `main.py lifespan` | `AppSettings` | sync session on startup, reads row 1 | WIRED | brief scheduled from persisted time on every restart |
| `scheduler.py` | `SQLAlchemyJobStore` | `jobstores={"default": SQLAlchemyJobStore(url=_sync_url)}` | WIRED | routine jobs survive Pi reboot |
| Migration 0003 | Migration 8f8f43ed5ce5 | `down_revision = '8f8f43ed5ce5'` | WIRED | linear chain; no branch or gap |
| `App.tsx` | `Settings.tsx` | `<Route path="/settings" element={<Settings />} />` | WIRED | route committed da62137 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `Settings.tsx` brief time display | `briefTime` (via `timeInput`) | `GET /api/v1/settings/brief-time` → `app_settings` DB row | Yes — `session.get(AppSettings, 1)` returns persisted row or default | FLOWING |
| `Settings.tsx` routines list | `routines[]` | `GET /api/v1/routines/` → `select(Routine).order_by(...)` | Yes — DB query returns all rows | FLOWING |
| `brief.py::build_brief_body` | `tasks`, `events` | sync SQLAlchemy queries on `tasks` and `calendar_events` tables with today's date filter | Yes — real DB queries with date range filters | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 12 phase-05 tests pass | `pytest tests/test_brief.py tests/test_settings.py tests/test_routines.py -v` | 12 passed, 0 failed | PASS |
| Brief service sends "Good morning" to Pushover | `test_send_daily_brief_calls_pushover_good_morning` | mock assert passes | PASS |
| Invalid cron returns 422 | `test_create_routine_invalid_cron` | 422 response | PASS |
| APScheduler job rescheduled on brief time PUT | `test_set_brief_time_reschedules_job` | `scheduler.get_job("daily_brief") is not None` | PASS |
| Routine job id pattern `routine_{id}` | `test_create_routine` | job present after create | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CAL-06 | Daily brief fires at user-configurable time (default 8am); delivered as Pushover notification with today's agenda summary | SATISFIED | `schedule_daily_brief` + `send_daily_brief` + `AppSettings` model + settings router + `useBriefSettings` hook + Settings UI |
| CAL-07 | User can define custom recurring routines (name, cron, action); routines persist across reboots via APScheduler SQLAlchemyJobStore | SATISFIED | `Routine` model + routines router + `schedule_routine` with SQLAlchemyJobStore + `RoutineDrawer` UI + CRUD tests |
| NOTIF-02 | Daily brief delivers a Pushover push notification with agenda content | SATISFIED | `PushoverClient().send(title="Good morning", message=body)` in `brief.py`; body built from live DB queries |

All three requirement IDs declared in plan 05-01 frontmatter are satisfied. No orphaned requirements found — REQUIREMENTS.md traceability table maps only CAL-06, CAL-07, NOTIF-02 to Phase 5.

### Anti-Patterns Found

None. Scanned all phase-05 artifacts:
- No `return null` / empty stubs in routers or services
- No hardcoded `[]` or `{}` passed as props to `RoutineDrawer` — routines come from `useRoutines` state
- No TODO/FIXME/placeholder comments in implementation files
- `schedule_routine` action is currently hardcoded to `send_daily_brief` function (only action supported), which is correct — the `RoutineAction` enum has a single value by design for v1

### Human Verification Required

None outstanding. All five golden-path checks were performed live against the deployed Pi during this session and passed:

1. Brief time loads as 08:00, change and save persists after page reload — PASSED
2. Add routine — drawer opens, cron validates, new row appears in list — PASSED
3. Edit routine — existing values pre-populated, cron update saved and shown — PASSED
4. Delete routine — "Delete Routine" shows confirm modal, confirm removes row — PASSED
5. Invalid cron "every day 8am" — inline error displayed, no API call made — PASSED

---

### Summary

Phase 05 goal is fully achieved. The daily brief fires automatically via APScheduler with a CronTrigger backed by `SQLAlchemyJobStore`, delivering a Pushover notification with the agenda assembled from real DB queries. The brief time is configurable from the Settings UI with immediate scheduler rescheduling. Custom recurring routines support full CRUD from the UI, validate cron syntax server-side (422 on invalid), and their APScheduler jobs persist in the same SQLite store as task reminder jobs, surviving Pi reboots.

One gap was found and closed during this verification session: the phase shipped no Alembic migration for the two new models. Migration `0003_add_app_settings_and_routines.py` was added (commit 2d140f2) and applied on the Pi before the UAT. Future phases should treat migration files as mandatory artifacts alongside new models.

---

_Verified: 2026-06-14T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
