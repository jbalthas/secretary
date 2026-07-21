---
phase: quick-260721-boy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/routers/events.py
  - backend/tests/test_calendar.py
  - frontend/src/hooks/useCalendarEvents.ts
  - frontend/src/pages/Today.tsx
autonomous: false
requirements: [QUICK-260721-BOY]

must_haves:
  truths:
    - "The 'Later this week' section on /today shows calendar events on days 1-6, not just tasks and blocks"
    - "The 'Your day' (today) section still shows exactly the same events it did before"
    - "The Organize page still only sees today's events (its busy-timeline is unchanged)"
    - "GET /api/v1/events/range returns non-cancelled all-day and timed events across the requested window"
  artifacts:
    - path: "backend/app/routers/events.py"
      provides: "GET /events/range?start=YYYY-MM-DD&days=N endpoint alongside the untouched /events/today"
      contains: "events_range"
    - path: "frontend/src/hooks/useCalendarEvents.ts"
      provides: "useCalendarEvents(days) — days=1 keeps /today, days>1 uses /range"
      contains: "events/range"
    - path: "backend/tests/test_calendar.py"
      provides: "Range endpoint regression tests (in-window future events returned, out-of-window and cancelled excluded)"
      contains: "events_range"
  key_links:
    - from: "frontend/src/pages/Today.tsx"
      to: "useCalendarEvents"
      via: "useCalendarEvents(7) call"
      pattern: "useCalendarEvents\\(7\\)"
    - from: "frontend/src/hooks/useCalendarEvents.ts"
      to: "/api/v1/events/range"
      via: "fetch with start + days query params"
      pattern: "events/range\\?start="
---

<objective>
Fix the "Later this week" section on /today showing no calendar events for days 1-6.

Root cause (already diagnosed, do not re-investigate): `useCalendarEvents` fetches only
`/api/v1/events/today`, which the backend filters strictly to today. `buildWeekAgenda`
builds 7 day-groups from that same array, so only offset 0 can ever match an event.

Purpose: the week view is useless for planning if it only ever shows tasks.
Output: a date-range events endpoint + a hook that opts into a 7-day window for Today.tsx only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@backend/app/routers/events.py
@backend/app/models/calendar.py
@backend/app/schemas/event.py
@backend/tests/conftest.py
@frontend/src/hooks/useCalendarEvents.ts
@frontend/src/lib/agenda.ts
@frontend/src/pages/Today.tsx
@frontend/src/pages/Organize.tsx
</context>

<interfaces>
<!-- Contracts the executor needs. Do not go hunting in the codebase for these. -->

backend/app/models/calendar.py — CalendarEvent (primary key is google_id, no integer id):
```python
class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    google_id: Mapped[str]                  # PK
    title: Mapped[str]
    start_dt: Mapped[datetime | None]       # UtcDateTime, timed events, tz-aware UTC on read
    end_dt: Mapped[datetime | None]
    all_day: Mapped[bool]
    start_date: Mapped[str | None]          # "YYYY-MM-DD", all-day events only
    cancelled: Mapped[bool]
    done: Mapped[bool]
```

backend/app/schemas/event.py — reuse as-is, no changes:
```python
class CalendarEventOut(BaseModel):
    google_id: str; title: str
    start_dt: datetime | None; end_dt: datetime | None
    all_day: bool; start_date: str | None; done: bool
```

frontend/src/lib/agenda.ts — grouping is by LOCAL date key:
```ts
function toDateKey(d: Date): string  // local getFullYear/getMonth/getDate
// dayEvents filter: all_day -> e.start_date === dateKey ; timed -> toDateKey(new Date(e.start_dt)) === dateKey
```
Because grouping is local but `start_dt` is stored UTC, the server window must be padded
by one day on each side. Extra events are harmless — buildDayItems drops anything whose
local date key does not match one of the 7 groups.

Consumers of useCalendarEvents (both must keep working):
- `frontend/src/pages/Today.tsx:81` — `const { events, patchEvent } = useCalendarEvents();`
- `frontend/src/pages/Organize.tsx:94` — `const { events } = useCalendarEvents();`
  Organize builds a today-only busy timeline from `events` (filters `!all_day && start_dt && end_dt`).
  It MUST continue to receive today's events only. Do not modify Organize.tsx.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add GET /events/range endpoint + tests</name>
  <files>backend/app/routers/events.py, backend/tests/test_calendar.py</files>
  <behavior>
    - An all-day event with start_date = today+3 IS returned by `/events/range?start=<today>&days=7`
    - A timed event with start_dt = today+5 at 14:00 UTC IS returned by the same call
    - An event 30 days out is NOT returned
    - A cancelled event inside the window is NOT returned
    - Existing `test_events_today` still passes unchanged
  </behavior>
  <action>
    Add a new endpoint to `backend/app/routers/events.py`. Leave `events_today` and
    `update_event_done` untouched — other consumers depend on `/today`.

    ```python
    @router.get("/range", response_model=list[CalendarEventOut])
    async def events_range(
        start: str | None = None,
        days: int = 7,
        session: AsyncSession = Depends(get_session),
    ):
    ```

    Behaviour:
    - `start` defaults to `datetime.now(timezone.utc).date()`. Parse with
      `date.fromisoformat(start)`; on ValueError raise `HTTPException(422, "start must be YYYY-MM-DD")`.
    - Clamp `days` to 1..31 (`days = max(1, min(days, 31))`).
    - Pad the window by one day on each side so local-timezone grouping on the client
      does not drop edge events (the client re-filters by local date key, so extras are
      harmless):
      `win_start = start_date - timedelta(days=1)`, `win_end = start_date + timedelta(days=days + 1)`
      (win_end exclusive).
    - Timed bounds: `datetime.combine(win_start, time.min, tzinfo=timezone.utc)` and same for win_end.
    - All-day bounds: ISO string comparison — `CalendarEvent.start_date >= win_start.isoformat()`
      and `< win_end.isoformat()` (the column is a zero-padded YYYY-MM-DD string, so
      lexicographic compare is correct).
    - Query mirrors the existing `events_today` shape:
      `cancelled == False` AND `or_(all-day range predicate, and_(start_dt >= lo, start_dt < hi))`.
    - Order by `CalendarEvent.start_dt` is not required — the client sorts.

    Scope guard (per diagnosis item 4): filter on the event START only, matching existing
    `/today` behaviour. A multi-day event that begins before the window is NOT included.
    Do not add end_dt spanning logic.

    Then add two tests to `backend/tests/test_calendar.py` near `test_events_today`.
    Seed rows through the async session the conftest already patched in, and clean them up:

    ```python
    def _seed_events(rows):
        from app import db as app_db
        from tests.conftest import run_async

        async def _go():
            async with app_db.SessionLocal() as s:
                for r in rows:
                    await s.merge(r)
                await s.commit()
        run_async(_go())
    ```
    Use a unique google_id prefix per test (e.g. `"range-test-allday"`) and delete those
    rows in a try/finally so other tests in the shared session DB are unaffected.

    - `test_events_range_includes_future_events`: seed an all-day event at today+3 and a
      timed event at today+5 14:00 UTC; GET `/api/v1/events/range?start={today}&days=7`;
      assert both google_ids are present in the response.
    - `test_events_range_excludes_out_of_window_and_cancelled`: seed an event at today+30
      and a cancelled event at today+2; assert neither google_id appears.
  </action>
  <verify>
    <automated>cd backend && uv run python -m pytest tests/test_calendar.py -q</automated>
  </verify>
  <done>Both new tests pass; test_events_today still passes; /today endpoint code is byte-identical to before.</done>
</task>

<task type="auto">
  <name>Task 2: Widen useCalendarEvents to an opt-in multi-day window</name>
  <files>frontend/src/hooks/useCalendarEvents.ts, frontend/src/pages/Today.tsx</files>
  <action>
    In `frontend/src/hooks/useCalendarEvents.ts`, add a `days` parameter defaulting to 1:

    ```ts
    export function useCalendarEvents(days: number = 1)
    ```

    - When `days <= 1`, keep fetching `/api/v1/events/today` exactly as today. This keeps
      `Organize.tsx` (which calls `useCalendarEvents()` and assumes today-only events for
      its busy timeline) behaviourally unchanged — do NOT touch Organize.tsx.
    - When `days > 1`, fetch `/api/v1/events/range?start=${localTodayKey}&days=${days}`
      where `localTodayKey` is built from LOCAL date parts of `new Date()`
      (`${y}-${MM}-${dd}`, zero-padded) so it matches the keys `buildWeekAgenda` generates
      via agenda.ts's `toDateKey`. Do not use `toISOString().slice(0,10)` — that is UTC and
      will be the wrong day in negative-offset timezones near midnight.
    - Keep `refresh` and `patchEvent` behaviour identical (patchEvent still PATCHes
      `/api/v1/events/{google_id}` then calls `refresh`).
    - Include `days` in the `useEffect` dependency array.

    In `frontend/src/pages/Today.tsx:81`, change the call to `useCalendarEvents(7)`.
    No other Today.tsx change — `buildWeekAgenda` already builds the 7 day-groups and will
    now find events for offsets 1-6.
  </action>
  <verify>
    <automated>cd frontend && npm run build</automated>
  </verify>
  <done>tsc -b and vite build pass; Today.tsx calls useCalendarEvents(7); Organize.tsx is unmodified and still resolves to the /today fetch path.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Backend `/api/v1/events/range` endpoint + `useCalendarEvents(days)` so the Today page's
    "Later this week" section receives the full 7-day event window.
  </what-built>
  <how-to-verify>
    1. Start backend and frontend dev servers.
    2. Ensure at least one calendar event exists 2-4 days in the future (sync, or insert
       a row directly into calendar_events).
    3. Open /today. The "Later this week" column should now list that event under the
       correct weekday heading, with its time (or under "All day").
    4. Confirm the "Your day" column is unchanged — no duplicated or future events leaked in.
    5. Open /organize. The busy timeline must still show only today's timed events.
    6. Check the browser console for errors and the network tab for a single
       `/api/v1/events/range?start=...&days=7` request from /today.
  </how-to-verify>
  <resume-signal>Type "approved" or describe what looked wrong</resume-signal>
</task>

</tasks>

<verification>
- `cd backend && uv run python -m pytest -q` — full backend suite; the only pre-existing
  failure permitted is `test_calendar.py::test_callback_stores_credentials` (known, logged
  in deferred-items.md).
- `cd frontend && npm run build` passes.
- `cd frontend && npm test` passes (agenda.test.ts unaffected — agenda.ts is not modified).
</verification>

<success_criteria>
- "Later this week" renders calendar events on days 1-6 of the week view.
- "Your day" and the /organize busy timeline are behaviourally unchanged.
- `/api/v1/events/today` is untouched; `/api/v1/events/range` is additive.
- Two new range tests pass in backend/tests/test_calendar.py.
</success_criteria>

<output>
After completion, create `.planning/quick/260721-boy-fix-later-this-week-section-missing-futu/260721-boy-SUMMARY.md`
</output>
