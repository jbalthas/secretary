# Phase 7: Outlook Calendar ICS feed integration - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning
**Source:** Conversation with user (decisions locked before planning)

<domain>
## Phase Boundary

Subscribe to a single read-only published Outlook/Office365 ICS calendar feed and
merge its events into the existing `calendar_events` table so they appear seamlessly
in the Today view, the daily brief (Pushover), and the TTS speech — alongside Google
Calendar events, with no visual distinction.

This is the user's University of Alabama class schedule
(`https://outlook.office365.com/owa/calendar/<id>/<id>/calendar.ics`).

**In scope:** fetch + parse + recurrence-expand the ICS feed on the existing 5-minute
sync tick; upsert occurrences into `calendar_events`; propagate Outlook-side deletions.

**Out of scope:** writing events back to Outlook (feed is read-only by nature);
OAuth (ICS is an unauthenticated published URL); per-source UI styling/labels;
multiple ICS feeds (single feed only for this phase).

</domain>

<decisions>
## Implementation Decisions

### Storage
- **D-01:** Reuse the existing `calendar_events` table — do NOT create a new table.
  The whole app reads from this single table, so writing here makes events appear
  everywhere automatically (Today view, brief body, brief speech).
- **D-02:** Store each ICS occurrence in the existing `google_id` primary-key column
  using a source-prefixed id of the form `outlook:<UID>` (and, for recurring events,
  incorporate the occurrence start so each expanded instance gets a unique id, e.g.
  `outlook:<UID>:<YYYYMMDDTHHMMSS>`). No schema rename — the column stays `google_id`.
- **D-03:** No `source` / color / tag column. Display is fully merged with Google
  events (user explicitly chose "merged, no distinction").
- **D-04:** Match the existing Google storage conventions for each field: timed events
  set `start_dt`/`end_dt` (tz-aware, matching how `sync.py` stores them) with
  `all_day=False`; all-day events set `start_date` (YYYY-MM-DD string) with
  `all_day=True` and null `start_dt`/`end_dt`. `cancelled` stays `False` for stored rows.

### Sync behavior
- **D-05:** Fetch the feed over HTTP with the already-present `httpx` dependency.
- **D-06:** Run the Outlook sync on the SAME 5-minute APScheduler tick as Google
  (`schedule_calendar_sync` / `IntervalTrigger(minutes=5)` in `scheduler.py`).
  Whether it's a separate job id or folded into the existing job is Claude's
  discretion, but it must reuse the existing 5-minute cadence, not add a new cadence.
- **D-07:** Replace-on-sync for deletion propagation: on each sync, delete all existing
  `outlook:%` rows (LIKE match on `google_id`) and re-insert the current feed's
  occurrences. This makes Outlook-side deletions/edits propagate without sync-token
  bookkeeping (ICS has no incremental sync). Must not touch Google rows.
- **D-08:** Expand only a forward window of occurrences (today onward through a bounded
  horizon, e.g. ~90 days) — mirror the existing Google path which prunes past events.
  Do not store unbounded past/future occurrences.

### Recurrence
- **D-09:** ICS feeds ship recurring events as unexpanded `RRULE`. Expand them locally
  using `icalendar` (parse) + `recurring-ical-events` (expand) over the forward window.
  These are new backend dependencies to add to `backend/pyproject.toml`.

### Configuration
- **D-10:** The feed URL is configurable via `OUTLOOK_ICS_URL` in `config.py` Settings
  (env-driven, default empty string). Never hardcode the URL in source. When unset/empty,
  the Outlook sync is a no-op (mirrors how Google sync no-ops without credentials).
- **D-11:** Document the new var in `.env.example` if that file exists.

### Testing
- **D-12:** Include backend tests consistent with `backend/tests/test_calendar.py` style
  (sync TestClient pattern, monkeypatch at router/service module level). Cover at minimum:
  a timed event, an all-day event, a recurring event expanded to multiple occurrences,
  deletion propagation (event removed from feed disappears from table), and the
  no-op-when-unset case. Use a fixture ICS string rather than hitting the live URL.

### Claude's Discretion
- Exact unique-id scheme for recurring occurrences (as long as it's stable per
  occurrence and prefixed `outlook:`).
- Whether the Outlook sync is a new function in `sync.py` or a new module.
- Separate APScheduler job vs. calling Outlook sync inside the existing calendar-sync job.
- Forward-window horizon length (default ~90 days is reasonable).
- httpx timeout / error handling specifics (must be best-effort: a feed fetch failure
  must not crash the scheduler tick or affect Google sync).
- Timezone normalization details for floating vs. tz-aware ICS datetimes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The integration seam (read these — they define how events flow through the app)
- `backend/app/models/calendar.py` — `CalendarEvent` model (PK `google_id`, fields
  `title`, `start_dt`, `end_dt`, `all_day`, `start_date`, `cancelled`). Reuse as-is.
- `backend/app/services/sync.py` — existing Google sync; mirror its `_parse_event`
  field conventions, its sqlite `on_conflict_do_update` upsert, its past-event pruning,
  and its sync-engine setup (`create_engine` on the `+aiosqlite`-stripped URL).
- `backend/app/routers/events.py` — `events/today` reads the table; no change needed,
  it should just pick up Outlook rows.
- `backend/app/services/brief.py` — `build_brief_body` / `build_brief_speech` read the
  table; no change needed.
- `backend/app/scheduler.py` — `schedule_calendar_sync` (the 5-min IntervalTrigger);
  this is where the Outlook sync hooks in.
- `backend/app/config.py` — `Settings` (pydantic-settings, `.env`); add `OUTLOOK_ICS_URL`.

### Migrations (MANDATORY — this project never uses create_all)
- `backend/alembic/` — all schema changes go through Alembic migrations. NOTE: if the
  decision to reuse `calendar_events` with no new columns holds (D-01/D-02/D-03), NO
  migration is needed. Only author a migration if a schema change becomes necessary.

### Tests
- `backend/tests/test_calendar.py` — pattern to mirror for new Outlook sync tests.

### Project Requirements & Stack
- `.planning/REQUIREMENTS.md` — Phase 7 has no pre-assigned REQ-IDs (TBD); calendar
  requirements CAL-* from Phase 4 are the closest analog.
- `CLAUDE.md` (project root) — stack: FastAPI, SQLAlchemy 2.0 async, Alembic,
  APScheduler 3.x, httpx; PowerShell/Windows dev environment.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `httpx>=0.27` already in `backend/pyproject.toml` — use for the feed fetch.
- `sync.py` already builds a sync (non-async) engine by stripping `+aiosqlite` from
  `settings.database_url` and uses a sqlite `insert(...).on_conflict_do_update(...)`
  upsert keyed on `google_id` — reuse this exact pattern.
- APScheduler runs jobs in a thread pool (3.x), so the Outlook sync should be a plain
  sync function like `sync_calendar`, not async.

### Established Patterns
- Tables exist ONLY via Alembic migrations (no `create_all`).
- Google sync no-ops gracefully when credentials are absent — Outlook sync should
  no-op the same way when `OUTLOOK_ICS_URL` is empty.
- Best-effort background work: cast/notification failures are swallowed and never block;
  apply the same resilience to feed-fetch failures.

### Known wart to respect (not fix in this phase)
- `brief.py` filters with naive `datetime.now()` while `events.py` uses tz-aware
  `datetime.now(timezone.utc)`, and `sync.py` stores tz-aware datetimes. This is a
  pre-existing inconsistency. Outlook events MUST be stored the same way Google events
  are (per D-04) so they behave identically under both query paths — do not "fix" the
  inconsistency here.

</code_context>

---

*Phase: 07-outlook-calendar-ics-feed-integration*
*Context gathered: 2026-06-15 via conversation (decisions locked by user)*
