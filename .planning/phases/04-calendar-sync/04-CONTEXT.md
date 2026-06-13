# Phase 4: Calendar Sync - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Google Calendar OAuth2, 5-minute incremental event sync (syncToken strategy), and surface synced events in the Today agenda view by replacing the PLACEHOLDER_EVENTS stub. The user receives a Pushover alert if the OAuth token is revoked.

Read-only sync only — writing events back to Google Calendar is out of scope (deferred to v2).

</domain>

<decisions>
## Implementation Decisions

### OAuth Connect UX
- **D-01:** OAuth connect UI lives exclusively in `/settings` — no auto-prompts in Today or Tasks views
- **D-02:** User navigates to Settings and clicks "Connect Google Calendar" when ready; no banner or modal
- **D-03:** After connecting, Settings page shows: connected status (email) + "Disconnect" button only — no last-sync timestamp or extra chrome

### Navigation
- **D-04:** Add a third tab to the bottom nav: "Settings" (gear icon) — navigates to `/settings`
- **D-05:** Bottom nav is now: Today | Tasks | Settings (three tabs, consistent with Phase 2 mobile-native pattern)

### Event Time Window
- **D-06:** Full sync fetches events from today forward only — no historical events
- **D-07:** Store only future/today events in `calendar_events` table; prune past events on each sync run
- **D-08:** `timeMin` in full sync = today at 00:00:00 UTC

### Startup Sync
- **D-09:** Run a calendar sync during FastAPI lifespan startup (after scheduler starts) — events are fresh immediately after Pi reboot; no 5-minute wait
- **D-10:** Startup sync uses the same `sync_calendar()` function as the scheduled job

### Claude's Discretion
- Error state in Settings if sync is failing (e.g. a subtle status indicator)
- Exact label/icon for the Settings nav tab
- How "Disconnect" clears credentials (wipe credentials_json + sync_token in DB)
- SessionMiddleware secret key env var name
- Whether to show a loading state in Today while first sync runs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — CAL-01, CAL-02, CAL-03, CAL-04 are Phase 4 scope; see traceability table

### Phase 2 outputs (agenda and frontend patterns)
- `frontend/src/lib/agenda.ts` — `buildAgenda()` and `PLACEHOLDER_EVENTS` stub; Phase 4 replaces the stub with real events from the API
- `frontend/src/hooks/useTasks.ts` — Pattern for `useCalendarEvents()` hook (same fetch + state shape)
- `frontend/src/components/BottomNav.tsx` — Add third Settings tab here
- `frontend/src/pages/Today.tsx` — Integrate `useCalendarEvents()` and pass events into `buildAgenda()`
- `frontend/src/types/task.ts` — `AgendaItem` type; may need `CalendarEvent` type added or new `event.ts`

### Phase 3 outputs (scheduler + Pushover patterns)
- `backend/app/scheduler.py` — Add 5-min calendar sync job here; startup sync also wires into lifespan
- `backend/app/services/pushover.py` — Reuse for CAL-04 revocation alert
- `backend/app/main.py` — Lifespan where startup sync fires; new routers mount here

### Existing backend patterns
- `backend/app/config.py` — `Settings` class; add `google_client_secrets_path: str` (or JSON env var) and `google_token_path: str`
- `backend/app/db.py` — Async session factory; sync DB access for APScheduler thread-pool job uses sync URL (same pattern as Phase 3 SQLAlchemyJobStore)
- `backend/app/models/__init__.py` — Add `CalendarEvent` and `CalendarSync` models here

### Tech Stack Reference
- `.planning/CLAUDE.md` — Google library stack: `google-api-python-client`, `google-auth-oauthlib`, `google-auth-httplib2`; APScheduler 3.x guidance

### No external specs
- Google Calendar API patterns fully documented in RESEARCH.md (syncToken strategy, HTTP 410 fallback, `invalid_grant` detection, OAuth web server flow)
- `.planning/phases/04-calendar-sync/04-RESEARCH.md` — Canonical technical reference for this phase; all patterns, anti-patterns, and code examples

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/hooks/useTasks.ts` — Model for `useCalendarEvents()` hook; same SWR/fetch-then-set-state pattern
- `backend/app/services/pushover.py` — `PushoverClient.send()` is the CAL-04 alert call; already sync-safe for APScheduler thread pool
- `backend/app/scheduler.py` — `scheduler` singleton; add calendar sync job with `IntervalTrigger(minutes=5)` here
- `frontend/src/lib/agenda.ts` — `PLACEHOLDER_EVENTS` named export was explicitly designed for Phase 4 swap (STATE.md: "[02-05]: PLACEHOLDER_EVENTS named export for Phase 4 swap")

### Established Patterns
- APScheduler jobs are sync functions running in thread pool (not async) — same as Phase 3 PushoverClient pattern
- Settings loaded via `from app.config import settings` singleton — extend with Google OAuth config vars
- New models added to `backend/app/models/__init__.py`; new routers mounted in `main.py`
- `insert().on_conflict_do_update()` for upsert is the SQLite pattern (no MERGE support)
- Session handling in tests: `Sync TestClient` (mirrors existing test_health.py pattern)

### Integration Points
- `main.py` lifespan: trigger startup sync after `scheduler.start()` (skip if no credentials stored)
- `routers/auth.py` (new): `GET /auth/google` → redirect; `GET /auth/google/callback` → exchange + store
- `routers/events.py` (new): `GET /api/v1/events/today` → return today's `CalendarEvent` rows
- `frontend/src/App.tsx`: add `/settings` route + update `BottomNav` to three tabs
- `frontend/src/pages/Today.tsx`: pass real calendar events into `buildAgenda()` instead of PLACEHOLDER_EVENTS

</code_context>

<specifics>
## Specific Ideas

- The `PLACEHOLDER_EVENTS` stub was intentionally left in Phase 2 as a named export to make Phase 4 swap clean — see STATE.md note
- Keep Settings page minimal: just the OAuth connect/disconnect action and status. No extra config for v1.
- `prompt="consent"` is mandatory in the OAuth flow to force refresh_token on every auth — without it, token loss requires manual Google Cloud Console revocation

</specifics>

<deferred>
## Deferred Ideas

- Writing events back to Google Calendar — v2 (adds conflict resolution complexity)
- Multi-calendar support — v1 syncs primary calendar only
- Showing sync status / last-sync time in Settings — keep it clean for now
- Pushover action button "Re-connect" from revocation alert — v2 backlog

</deferred>

---

*Phase: 04-calendar-sync*
*Context gathered: 2026-06-12*
