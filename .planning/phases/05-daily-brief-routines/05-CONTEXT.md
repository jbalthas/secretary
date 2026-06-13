# Phase 5: Daily Brief & Routines - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Two capabilities delivered in Phase 5:

1. **Daily brief** — APScheduler CronTrigger fires at a user-configurable time (default 8am); sends a Pushover notification with today's tasks and calendar events. The brief time is editable from `/settings` without touching config files.

2. **Custom routines** — User can create, edit, and delete named recurring routines (cron schedule + action). Routines are persisted via APScheduler `SQLAlchemyJobStore` and survive Pi reboots.

Phase 6 will add Google Home TTS as a second routine action type.

</domain>

<decisions>
## Implementation Decisions

### Daily Brief Content
- **D-01:** Brief Pushover title = "Good morning"
- **D-02:** Brief body = bullet list of today's tasks (due today) + today's calendar events, merged and sorted by time — reuses `buildAgenda()` output
- **D-03:** Format: one bullet per item — timed items as `HH:MM Title`, all-day/tasks as `• Title`
- **D-04:** Brief Pushover priority = 0 (normal) — does not bypass quiet hours

### Brief Time Storage
- **D-05:** Brief time is stored in the database (a `settings` table or equivalent single-row config model), not in `.env` or APScheduler job args. This allows the web UI to update it without a service restart.
- **D-06:** APScheduler job ID = `daily_brief`; rescheduled with `replace_existing=True` whenever the user saves a new time from the UI.
- **D-07:** Timezone — store brief time as a local-time `HH:MM` string in the DB; convert to `CronTrigger(hour=H, minute=M, timezone=settings.timezone)`. Add `TIMEZONE` setting (default `"Europe/London"` or user-configured). APScheduler handles DST automatically when a named timezone is passed.

### Missed Brief Behaviour
- **D-08:** Use `misfire_grace_time=None` (or 0) on the daily brief job — APScheduler skips a fire that was missed. If Pi reboots after 8am, brief waits until tomorrow. No surprise mid-morning notifications.

### Routine Actions
- **D-09:** Phase 5 exposes one action type: `"send_daily_brief"` — fires the same brief builder (tasks + events at the time of fire, not cached from 8am). This means a user could define a second "evening review" routine at 6pm that also sends a brief.
- **D-10:** Action select in the form shows one option: "Send daily brief". The `action` column is a string enum in the DB, extensible for Phase 6 (`"tts_announcement"` etc.).
- **D-11:** Routine job ID convention: `routine_{routine_id}` — stable, deduplication-safe (same pattern as `reminder_task_{task_id}`).

### Claude's Discretion
- DB model name for settings row (e.g., `AppSettings` or `SystemConfig`)
- Whether brief time is stored as `HH:MM` string or as two int columns (hour, minute)
- Error handling when brief builder fails (log and skip vs send "No agenda data" message)
- Whether to validate cron expressions server-side before saving a routine
- API endpoint structure for routines (`/api/v1/routines`) and brief settings (`/api/v1/settings/brief-time`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — CAL-06, CAL-07, NOTIF-02 are Phase 5 scope

### Phase 3 outputs (Pushover + scheduler patterns)
- `backend/app/scheduler.py` — `scheduler` singleton, `SQLAlchemyJobStore` setup, job ID convention, `upsert_reminder`/`remove_reminder` patterns. Daily brief and routine jobs follow the same patterns.
- `backend/app/services/pushover.py` — `PushoverClient().send()` is the reusable send call for the brief

### Phase 2 outputs (agenda builder)
- `frontend/src/lib/agenda.ts` — `buildAgenda()` produces merged task+event list sorted by time; brief builder reuses this logic (or an equivalent backend port of it)
- `frontend/src/hooks/useTasks.ts` / `frontend/src/hooks/useCalendarEvents.ts` — fetch hook patterns for new `useBriefSettings` and `useRoutines` hooks

### Phase 4 outputs (Settings page patterns)
- `frontend/src/pages/Settings.tsx` — existing card pattern; new Brief and Routines sections added below Google Calendar section
- `.planning/phases/05-daily-brief-routines/05-UI-SPEC.md` — UI design contract (spacing, colors, copy, component patterns)

### Existing backend patterns
- `backend/app/config.py` — `Settings` class; add `TIMEZONE: str = "Europe/London"` (or appropriate default)
- `backend/app/models/__init__.py` — add `AppSettings` (or equivalent) and `Routine` models
- `backend/app/routers/tasks.py` — task router pattern; new `routines.py` and `settings.py` routers follow same structure
- `backend/app/main.py` — lifespan where brief job is scheduled on startup (after scheduler starts, load brief time from DB and add job)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/scheduler.py` — `scheduler.add_job()` with `replace_existing=True` is the upsert pattern. Brief uses `CronTrigger`; routines use `CronTrigger` from user-provided cron string.
- `backend/app/services/pushover.py` — `PushoverClient().send(title, message, priority)` — call directly from brief sender function
- `frontend/src/lib/agenda.ts` — `buildAgenda(tasks, events, now)` — backend needs equivalent logic to build the brief body (either call the Python equivalent or fetch from a new `/api/v1/agenda/today` endpoint)
- `frontend/src/pages/Settings.tsx` — card sections using `var(--surface)` + `var(--border)` + `borderRadius: 12` pattern; new sections added below the Google Calendar section

### Established Patterns
- APScheduler jobs are sync functions (not async) — `PushoverClient().send()` is already sync-safe
- Job ID convention: `{prefix}_{id}` — for brief use `daily_brief`, for routines use `routine_{id}`
- `id=` + `replace_existing=True` on every `scheduler.add_job()` call — mandatory
- Settings loaded via `from app.config import settings` singleton
- New routers mounted in `main.py`; new models in `models/__init__.py`

### Integration Points
- `main.py` lifespan: after `scheduler.start()`, load brief time from DB and call `schedule_daily_brief(hour, minute)`. Skip if no brief time set (use default 8:00).
- `routers/settings.py` (new): `GET /api/v1/settings/brief-time` + `PUT /api/v1/settings/brief-time` → read/write DB, reschedule APScheduler job
- `routers/routines.py` (new): full CRUD for routines; create/update add APScheduler job, delete removes it
- `frontend/src/pages/Settings.tsx`: add Daily Brief section (time input + save) and Routines section (list + drawer form) below existing Google Calendar section

</code_context>

<specifics>
## Specific Ideas

- Brief body example: "08:30 Team standup\n• Fix bug #42\n• Call dentist" — timed events first (sorted), then untimed tasks as bullets
- If `buildAgenda()` returns empty: send brief with body "Nothing scheduled today." rather than skipping
- `CronTrigger(hour=8, minute=0, timezone="Europe/London")` — named timezone handles DST automatically in APScheduler

</specifics>

<deferred>
## Deferred Ideas

- Brief time timezone configurability from UI — Phase 5 uses a single `TIMEZONE` config setting; UI timezone picker is v2
- Routine action type "Send custom Pushover message" (arbitrary text) — discussed but deferred; only `send_daily_brief` in Phase 5
- Google Home TTS as routine action — Phase 6
- "Routine action: send custom Pushover message" — deferred to after Phase 6 TTS is established
- Pushover action buttons on brief ("View tasks", etc.) — v2 backlog

</deferred>

---

*Phase: 05-daily-brief-routines*
*Context gathered: 2026-06-13*
