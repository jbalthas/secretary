# Phase 7: Outlook Calendar ICS Feed Integration — Research

**Researched:** 2026-06-15
**Domain:** ICS/iCalendar parsing, recurring-event expansion, Office365 quirks, sync integration
**Confidence:** HIGH (library APIs verified on PyPI + readthedocs; O365 quirks confirmed via Nextcloud/Mozilla bug trackers)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Reuse the existing `calendar_events` table — no new table.
- **D-02:** Store each ICS occurrence in the `google_id` column with source-prefixed ids of the form `outlook:<UID>` (non-recurring) or `outlook:<UID>:<YYYYMMDDTHHMMSS>` (recurring). No schema rename.
- **D-03:** No `source` / color / tag column. Display is fully merged with Google events.
- **D-04:** Match Google storage conventions: timed events set `start_dt`/`end_dt` (tz-aware) with `all_day=False`; all-day events set `start_date` (YYYY-MM-DD string) with `all_day=True` and null `start_dt`/`end_dt`.
- **D-05:** Fetch the feed with `httpx` (already present).
- **D-06:** Run Outlook sync on the SAME 5-minute APScheduler tick as Google (`IntervalTrigger(minutes=5)`).
- **D-07:** Replace-on-sync deletion propagation: delete all `outlook:%` rows (LIKE on `google_id`), re-insert current feed's occurrences. Must not touch Google rows.
- **D-08:** Expand only a forward window: today onward through a bounded horizon (~90 days). Do not store unbounded past/future occurrences.
- **D-09:** Parse with `icalendar`; expand recurrences with `recurring-ical-events`. Both are new backend dependencies.
- **D-10:** Feed URL is `OUTLOOK_ICS_URL` in `config.py` Settings. No-op when unset/empty.
- **D-11:** Document the new var in `backend/.env.example`.
- **D-12:** Backend tests consistent with `test_calendar.py` style: timed event, all-day event, recurring expanded to multiple occurrences, deletion propagation, no-op-when-unset.

### Claude's Discretion

- Exact unique-id scheme for recurring occurrences (stable per occurrence, prefixed `outlook:`).
- Whether Outlook sync is a new function in `sync.py` or a new module.
- Separate APScheduler job vs. calling Outlook sync inside the existing calendar-sync job.
- Forward-window horizon length (default ~90 days is reasonable).
- httpx timeout / error handling specifics (must be best-effort: failure must not crash the tick or affect Google sync).
- Timezone normalization details for floating vs. tz-aware ICS datetimes.

### Deferred Ideas (OUT OF SCOPE)

- Writing events back to Outlook (feed is read-only by nature).
- OAuth (ICS is an unauthenticated published URL).
- Per-source UI styling/labels.
- Multiple ICS feeds (single feed only for this phase).
</user_constraints>

---

## Summary

Phase 7 is a backend-only integration with three moving parts: (1) fetch an unauthenticated Outlook ICS URL over httpx, (2) parse and expand the feed using `icalendar` + `recurring-ical-events`, and (3) replace-sync the resulting occurrences into the existing `calendar_events` table. No schema change is needed. The implementation closely mirrors `sync.py`'s engine setup, `_upsert` pattern, and prune-past-events approach.

The two primary non-obvious risks are: **Office365 User-Agent enforcement** (Microsoft blocks requests from non-browser User-Agents, returning a 302 to an error page rather than the ICS file) and **Windows TZID names** (Outlook ICS uses Windows timezone identifiers like "Central Standard Time" that `icalendar` 7.x maps to IANA names via a built-in `WINDOWS_TO_OLSON` table). Both have well-understood workarounds.

The `recurring-ical-events` library handles EXDATE exclusions automatically and returns fully expanded occurrence components with copied `UID`, `SUMMARY`, and updated `DTSTART`/`DTEND` per instance — making the parsing loop simple.

**Primary recommendation:** Implement as a new `sync_outlook_ics()` function in `backend/app/services/sync.py` (keeping the module boundary consistent), called as a second APScheduler job under the same 5-minute `IntervalTrigger`. Wrap the entire function in a broad `except Exception` so fetch/parse failures are logged and swallowed, mirroring the best-effort pattern already used for TTS and cast operations.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `icalendar` | 7.1.2 | Parse `.ics` bytes → `Calendar` object, access `VEVENT` components, property access | The canonical Python iCal parser; used as the parse input for `recurring-ical-events`; v7.x requires Python ≥3.10 (Pi has 3.12). |
| `recurring-ical-events` | 3.8.2 | Expand RRULE/RDATE/EXDATE occurrences over a date window | Purpose-built for exactly this; handles EXDATE automatically, returns fully-formed component per instance. Requires `icalendar>=6.1.0,<8.0.0`. |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `httpx` | ≥0.27 (present) | Fetch ICS URL | Already in `pyproject.toml`; use sync `httpx.Client` (APScheduler 3.x runs jobs in thread pool, not async — same as `PushoverClient`). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `icalendar` + `recurring-ical-events` | `ics` 0.7.3 | `ics` has no usable RRULE expansion; it parses a "flattened" timeline that collapses recurring events and loses individual occurrence identity. Not suitable. |
| `icalendar` + `recurring-ical-events` | `vobject` | Unmaintained since ~2020; no RRULE expansion. |
| `icalendar` + `recurring-ical-events` | hand-rolled `dateutil.rrule` | Would require re-implementing EXDATE, RDATE, timezone handling. Don't hand-roll. |

**Installation (add to `backend/pyproject.toml` dependencies):**

```
"icalendar>=7.1,<8.0",
"recurring-ical-events>=3.8,<4.0",
```

**Version verification (confirmed 2026-06-15):**
- `icalendar` 7.1.2 on PyPI; published 2026
- `recurring-ical-events` 3.8.2 on PyPI; published 2026-04-30
- `recurring-ical-events` 3.8.2 declares `icalendar>=6.1.0,<8.0.0` — 7.1.2 satisfies this constraint.

---

## Architecture Patterns

### Recommended File Layout

```
backend/app/services/
├── sync.py           # ADD sync_outlook_ics() here — keeps all calendar sync in one module
├── brief.py          # unchanged
└── ...

backend/tests/
├── test_calendar.py          # existing Google Calendar tests
└── test_outlook_ics_sync.py  # new file — mirrors test_calendar.py structure
```

### Pattern 1: Fetch with Browser User-Agent (CRITICAL)

**What:** Office365 published ICS endpoints enforce a User-Agent whitelist. Without a browser-like UA, the server returns HTTP 302 to an `OwaBasicUnsupportedException` error page rather than the ICS content.

**Evidence:** Confirmed via Nextcloud GitHub issue #54799 and Mozilla Bugzilla #1984590. Affects all non-browser HTTP clients (curl, Python requests, Nextcloud, Thunderbird 140). Workaround: send `Mozilla/5.0 (Linux) Chrome/139` as User-Agent.

**When to use:** Always, for any fetch from `outlook.office365.com`.

```python
# Source: Nextcloud issue #54799 + Mozilla Bugzilla #1984590
OUTLOOK_USER_AGENT = "Mozilla/5.0 (Linux) Chrome/139"

def _fetch_ics(url: str, timeout: int = 15) -> bytes:
    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        resp = client.get(url, headers={"User-Agent": OUTLOOK_USER_AGENT})
        resp.raise_for_status()
        return resp.content
```

**Note:** `follow_redirects=True` is needed because even with a correct UA, Office365 may use a redirect chain before delivering the ICS. Use `raise_for_status()` so a non-200 after redirects propagates as an exception (swallowed at the outer `except` boundary).

### Pattern 2: Parse and Expand Recurrences

**What:** `icalendar.Calendar.from_ical()` parses the raw bytes into a `Calendar` object. `recurring_ical_events.of(cal).between(start, end)` returns a flat list of `icalendar.cal.Component` objects — one per occurrence — with `DTSTART`/`DTEND` set to the instance's actual times and `UID`/`SUMMARY` copied from the parent VEVENT. EXDATE-excluded occurrences are automatically absent.

```python
# Source: recurring-ical-events PyPI + API reference
import icalendar
import recurring_ical_events
from datetime import date, datetime, timezone, timedelta

def _expand_ics(raw: bytes, window_days: int = 90):
    cal = icalendar.Calendar.from_ical(raw)
    today = date.today()
    end = today + timedelta(days=window_days)
    return recurring_ical_events.of(cal).between(today, end)
```

**Note on date types:** `between(date, date)` works correctly for both all-day (DATE) and timed (DATETIME) events. The library accepts `datetime.date` objects directly for the window bounds.

### Pattern 3: Event Field Extraction — Mirror _parse_event()

**What:** Each expanded component exposes `.dt` on its `DTSTART`/`DTEND` properties. Use `isinstance(dt, datetime)` to distinguish timed from all-day events (DATE returns `datetime.date`; DATETIME returns `datetime.datetime`).

```python
# Source: icalendar readthedocs usage + API reference
import datetime

def _parse_ics_component(component, google_id: str) -> dict | None:
    dtstart = component.get("DTSTART")
    if dtstart is None:
        return None
    dt = dtstart.dt

    title = str(component.get("SUMMARY", "(No title)"))
    if not title.strip():
        title = "(No title)"

    if isinstance(dt, datetime.datetime):
        # Timed event — normalise to UTC-aware datetime
        if dt.tzinfo is None:
            # Floating time (no TZID) — treat as UTC
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        start_dt = dt.astimezone(datetime.timezone.utc)
        dtend = component.get("DTEND")
        end_dt = None
        if dtend is not None:
            et = dtend.dt
            if isinstance(et, datetime.datetime):
                if et.tzinfo is None:
                    et = et.replace(tzinfo=datetime.timezone.utc)
                end_dt = et.astimezone(datetime.timezone.utc)
        return {
            "google_id": google_id,
            "title": title,
            "all_day": False,
            "start_date": None,
            "start_dt": start_dt,
            "end_dt": end_dt,
            "cancelled": False,
        }
    else:
        # All-day event (datetime.date)
        return {
            "google_id": google_id,
            "title": title,
            "all_day": True,
            "start_date": dt.isoformat(),  # YYYY-MM-DD
            "start_dt": None,
            "end_dt": None,
            "cancelled": False,
        }
```

### Pattern 4: Stable Occurrence ID Scheme

**What:** For non-recurring events: `outlook:<UID>`. For recurring instances: `outlook:<UID>:<DTSTART-compact>` where the compact form is `YYYYMMDDTHHMMSS` (local to UTC-normalised start). This is stable across re-syncs because the same occurrence always generates the same `DTSTART` value.

**Fits in String(255):** Verified. Longest realistic Office365 UID (~120 chars base64) + prefix + separator + 15-char timestamp = ~145 chars. String(255) accommodates even pathological UIDs up to 200 chars (tested: 224 chars total, within 255).

```python
def _make_google_id(uid: str, dtstart_dt) -> str:
    """Stable, collision-free id for this occurrence."""
    import datetime
    if isinstance(dtstart_dt, datetime.datetime):
        if dtstart_dt.tzinfo is not None:
            dtstart_dt = dtstart_dt.astimezone(datetime.timezone.utc)
        compact = dtstart_dt.strftime("%Y%m%dT%H%M%S")
        return f"outlook:{uid}:{compact}"
    else:
        # All-day event — date-only
        return f"outlook:{uid}:{dtstart_dt.strftime('%Y%m%d')}"
```

**Non-recurring events** (no RRULE, no RDATE): `of(cal).between(...)` returns one component; use `outlook:<UID>` as the id (no date suffix). This keeps the key stable even if the event is edited in Outlook (UID stays constant per RFC 5545).

### Pattern 5: Replace-On-Sync Delete

**What:** Delete all rows where `google_id LIKE 'outlook:%'` before inserting the current expansion. SQLite supports `LIKE` in SQLAlchemy `where()`.

```python
from sqlalchemy import delete
from app.models.calendar import CalendarEvent

# Inside session:
session.execute(
    delete(CalendarEvent).where(
        CalendarEvent.google_id.like("outlook:%")
    )
)
# then upsert each parsed occurrence using the existing _upsert() helper
```

**Safety:** The LIKE pattern `outlook:%` is disjoint from all Google IDs (which use Google's own opaque ID format and are never prefixed with `outlook:`).

### Pattern 6: Scheduler Hook

**What:** Add a second APScheduler job with `id="outlook_ics_sync"`, same `IntervalTrigger(minutes=5)`, separate job ID. This is simpler than folding into the existing `calendar_sync` job and avoids any dependency between Google and Outlook paths.

```python
# In scheduler.py — schedule_calendar_sync() already exists; add:
def schedule_outlook_ics_sync() -> None:
    from apscheduler.triggers.interval import IntervalTrigger
    from app.services.sync import sync_outlook_ics
    scheduler.add_job(
        sync_outlook_ics,
        IntervalTrigger(minutes=5),
        id="outlook_ics_sync",
        replace_existing=True,
        misfire_grace_time=300,
    )
```

Call `schedule_outlook_ics_sync()` from `lifespan` in `main.py` alongside `schedule_calendar_sync()`.

### Anti-Patterns to Avoid

- **Don't set `follow_redirects=False`:** Office365 uses redirect chains; without following, you get a 302 with no ICS content.
- **Don't omit the browser User-Agent:** Requests without it receive `OwaBasicUnsupportedException` — content-type will NOT be `text/calendar`, `from_ical()` will fail or produce garbage.
- **Don't pass a naïve datetime to `from_ical()` for timed events:** Always check `dt.tzinfo` and substitute UTC if `None` (floating time). Storing naïve datetimes in the `DateTime(timezone=True)` column would violate the existing pattern.
- **Don't use `between(datetime.now(utc), ...)` for the window start:** Use `date.today()` to include all-day events that start today (an all-day `datetime.date` value is always "before" any `datetime.datetime`).
- **Don't hand-roll RRULE expansion:** `dateutil.rrule` exists but `recurring-ical-events` integrates EXDATE, RDATE, and timezone-aware expansion correctly; custom code will miss edge cases.
- **Don't raise on feed fetch failure:** Swallow all exceptions from `sync_outlook_ics()` at the function boundary (log at WARNING level). A transient network error should never block the scheduler tick or affect Google sync.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recurrence expansion (RRULE + RDATE + EXDATE) | Custom dateutil.rrule loop | `recurring-ical-events 3.8.2` | EXDATE timezone edge cases, RDATE support, RECURRENCE-ID modifications — all require ~600 lines of correct RFC 5545 logic |
| Windows TZID → IANA mapping | Dict lookup table | `icalendar 7.x` built-in `WINDOWS_TO_OLSON` | Microsoft uses non-IANA names ("Central Standard Time"); icalendar has the full CLDR-derived mapping baked in |
| ICS line-folding / CRLF / charset normalisation | String preprocessing | `icalendar.Calendar.from_ical()` | The parser handles RFC 5545 line folding, UTF-8, and CRLF automatically |

**Key insight:** The `recurring-ical-events` + `icalendar` combo is the de facto standard for this exact problem. The "simple" alternative of parsing events yourself degenerates into re-implementing a large portion of RFC 5545.

---

## Common Pitfalls

### Pitfall 1: Office365 User-Agent Enforcement

**What goes wrong:** `httpx.get(url)` returns HTTP 200 with HTML content (`OwaBasicUnsupportedException` error page) instead of the ICS file; `Calendar.from_ical()` raises `ValueError` or produces an empty calendar.

**Why it happens:** Microsoft began enforcing a User-Agent whitelist on `outlook.office365.com` calendar endpoints in late 2025. Non-browser User-Agents receive a 302 to an error page.

**How to avoid:** Always pass `headers={"User-Agent": "Mozilla/5.0 (Linux) Chrome/139"}` in the httpx request.

**Warning signs:** Response `Content-Type` is `text/html` rather than `text/calendar`; response body contains "Object moved" or "OwaBasicUnsupportedException".

### Pitfall 2: Windows TZID Names in Office365 ICS

**What goes wrong:** Datetimes in Outlook ICS use `TZID=Central Standard Time` (Windows name). Standard `zoneinfo` cannot open this key; datetimes appear as naïve or with garbage offset.

**Why it happens:** Outlook uses Windows timezone identifiers, not IANA identifiers. The VTIMEZONE blocks may be present but use different names than the DTSTART TZID reference, or may be absent entirely.

**How to avoid:** `icalendar` 7.x includes a built-in `WINDOWS_TO_OLSON` dictionary that maps Windows timezone names to IANA equivalents during parsing. This is handled transparently when you call `Calendar.from_ical()` — no additional action required. The `tzdata` PyPI package is NOT needed on Raspberry Pi OS Bookworm (Debian system zoneinfo at `/usr/share/zoneinfo` covers all IANA names).

**Warning signs:** `start_dt` values are naïve (no tzinfo) after parsing despite the ICS having `TZID=` on DTSTART. If `icalendar` cannot resolve a Windows TZID to IANA, it will produce a `dateutil.tz.tzlocal()` result — test with `isinstance(dt.tzinfo, datetime.timezone)` to detect this.

### Pitfall 3: Floating Times (No TZID on DTSTART)

**What goes wrong:** Some ICS events have `DTSTART:20260901T090000` (no `TZID=`, no `Z` suffix) — a "floating" time. `icalendar` returns these as naïve `datetime.datetime`. Storing naïve values in `DateTime(timezone=True)` columns with SQLAlchemy will produce `None` or incorrect times.

**Why it happens:** RFC 5545 defines "floating" times for events that should be interpreted in the local timezone of the viewer. Some all-campus events published by university systems use floating times.

**How to avoid:** After getting `dt` from `DTSTART.dt`, if `isinstance(dt, datetime.datetime) and dt.tzinfo is None`, replace tzinfo with `datetime.timezone.utc`. This is a pragmatic assumption: for a personal class schedule, UTC is a safe fallback (the planner can make `America/Chicago` the explicit fallback if the user's actual timezone is known at research time, but UTC is simpler and avoids config complexity).

**Warning signs:** `dt.tzinfo is None` on a value that `isinstance(dt, datetime.datetime)` returns True for.

### Pitfall 4: Replace-on-Sync Scope Bleed

**What goes wrong:** A delete like `delete(CalendarEvent).where(CalendarEvent.google_id.startswith("outlook:"))` or a typo in the LIKE pattern could accidentally delete Google rows.

**Why it happens:** SQLAlchemy's `.like()` does not validate the pattern.

**How to avoid:** Use `.like("outlook:%")` — the `%` wildcard covers all suffixes. Verify in tests that a pre-existing Google row (e.g., `google_id="google_event_1"`) survives the delete step in the sync. The `test_deletion_propagation` test case should assert both that the removed Outlook event is gone AND that a pre-seeded Google event is still present.

### Pitfall 5: Non-Recurring Event ID Stability

**What goes wrong:** If you always use `outlook:<UID>:<DTSTART>` for all events (including non-recurring), an event edited in Outlook that shifts its start time generates a new `google_id` on the next sync, leaving a stale duplicate until the replace-on-sync cleans it up. That stale row will only exist for one 5-minute cycle, so it is benign — but using `outlook:<UID>` (no date) for non-recurring events is marginally cleaner.

**How to avoid:** Check whether the component has an RRULE or RDATE property. If absent, it is a non-recurring singleton; use `outlook:<UID>`. If present, `recurring_ical_events` will return one component per expanded instance; use `outlook:<UID>:<compact_dtstart>`.

**Practical note:** Since replace-on-sync deletes all `outlook:%` rows on every tick, even a wrong ID only lives for one cycle. This pitfall is LOW severity.

### Pitfall 6: `between()` Returns All-Day Events With DATE Objects

**What goes wrong:** `dt = component["DTSTART"].dt` for an all-day event is `datetime.date`, not `datetime.datetime`. Code that unconditionally calls `.astimezone()` on the result will raise `AttributeError`.

**How to avoid:** Always branch on `isinstance(dt, datetime.datetime)` before calling timezone methods — see Pattern 3 above.

---

## Code Examples

### Full sync_outlook_ics() Skeleton

```python
# backend/app/services/sync.py (addition)
import logging
from datetime import date, datetime, timezone, timedelta
from icalendar import Calendar
import recurring_ical_events
import httpx
from sqlalchemy import delete
from app.models.calendar import CalendarEvent

_log = logging.getLogger(__name__)
_OUTLOOK_UA = "Mozilla/5.0 (Linux) Chrome/139"
_WINDOW_DAYS = 90


def sync_outlook_ics() -> None:
    """Fetch, parse, and replace-sync Outlook ICS feed into calendar_events.
    
    Best-effort: all exceptions are logged and swallowed.
    No-op when OUTLOOK_ICS_URL is unset.
    """
    from app.config import settings
    if not settings.outlook_ics_url:
        return

    try:
        raw = _fetch_ics(settings.outlook_ics_url)
        events = _expand_ics(raw)
        _replace_sync(events)
    except Exception:
        _log.warning("Outlook ICS sync failed", exc_info=True)


def _fetch_ics(url: str) -> bytes:
    with httpx.Client(follow_redirects=True, timeout=15) as client:
        resp = client.get(url, headers={"User-Agent": _OUTLOOK_UA})
        resp.raise_for_status()
        return resp.content


def _expand_ics(raw: bytes) -> list:
    cal = Calendar.from_ical(raw)
    today = date.today()
    end = today + timedelta(days=_WINDOW_DAYS)
    return recurring_ical_events.of(cal).between(today, end)


def _replace_sync(components: list) -> None:
    with _Session() as session:
        session.execute(
            delete(CalendarEvent).where(CalendarEvent.google_id.like("outlook:%"))
        )
        for component in components:
            values = _parse_ics_component(component)
            if values:
                _upsert(session, values)
        session.commit()


def _parse_ics_component(component) -> dict | None:
    dtstart = component.get("DTSTART")
    uid = str(component.get("UID", ""))
    if dtstart is None or not uid:
        return None
    dt = dtstart.dt
    title = str(component.get("SUMMARY", "(No title)")).strip() or "(No title)"

    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        start_dt = dt.astimezone(timezone.utc)
        google_id = f"outlook:{uid}:{start_dt.strftime('%Y%m%dT%H%M%S')}"
        dtend = component.get("DTEND")
        end_dt = None
        if dtend is not None:
            et = dtend.dt
            if isinstance(et, datetime):
                if et.tzinfo is None:
                    et = et.replace(tzinfo=timezone.utc)
                end_dt = et.astimezone(timezone.utc)
        return {
            "google_id": google_id,
            "title": title,
            "all_day": False,
            "start_date": None,
            "start_dt": start_dt,
            "end_dt": end_dt,
            "cancelled": False,
        }
    else:
        # All-day: dt is datetime.date
        google_id = f"outlook:{uid}:{dt.strftime('%Y%m%d')}"
        return {
            "google_id": google_id,
            "title": title,
            "all_day": True,
            "start_date": dt.isoformat(),
            "start_dt": None,
            "end_dt": None,
            "cancelled": False,
        }
```

### Minimal Fixture ICS String (for tests)

```python
FIXTURE_ICS = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//University//Calendar//EN
BEGIN:VEVENT
UID:timed-event-001@university.edu
SUMMARY:Lecture
DTSTART;TZID=America/Chicago:20260901T090000
DTEND;TZID=America/Chicago:20260901T105000
END:VEVENT
BEGIN:VEVENT
UID:allday-event-002@university.edu
SUMMARY:Labor Day
DTSTART;VALUE=DATE:20260907
DTEND;VALUE=DATE:20260908
END:VEVENT
BEGIN:VEVENT
UID:recurring-event-003@university.edu
SUMMARY:Weekly Lab
DTSTART;TZID=America/Chicago:20260901T140000
DTEND;TZID=America/Chicago:20260901T160000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=America/Chicago:20260915T140000
END:VEVENT
END:VCALENDAR"""
```

### Test Monkeypatching Pattern

Mirror `test_calendar.py`'s approach — patch at the module-attribute level, use the sync `_Session` override, and use `TestSyncSession` from `conftest.py`:

```python
# backend/tests/test_outlook_ics_sync.py
from unittest.mock import patch, MagicMock
from app.services.sync import sync_outlook_ics

def test_timed_event(monkeypatch, fake_sync_session):
    with patch("app.services.sync._fetch_ics", return_value=FIXTURE_ICS):
        with patch("app.services.sync._Session", fake_sync_session):
            sync_outlook_ics()
    # assert CalendarEvent row with google_id starting "outlook:" exists
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x (present in `pyproject.toml` dev deps) |
| Config file | none (uses default discovery from `backend/`) |
| Quick run command | `uv run pytest backend/tests/test_outlook_ics_sync.py -x` |
| Full suite command | `uv run pytest backend/tests/ -x` |

### Phase Requirements → Test Map

| Behavior | Test Name | Test Type | Automated Command |
|----------|-----------|-----------|-------------------|
| Timed event stored with tz-aware start_dt/end_dt, all_day=False | `test_timed_event_stored` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_timed_event_stored -x` |
| All-day event stored with start_date YYYY-MM-DD, all_day=True, null start_dt | `test_allday_event_stored` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_allday_event_stored -x` |
| Recurring event (RRULE WEEKLY;COUNT=4) expanded to 3 occurrences (1 EXDATE) | `test_recurring_event_expanded` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_recurring_event_expanded -x` |
| Deletion propagation: event in previous sync removed from table on re-sync | `test_deletion_propagation` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_deletion_propagation -x` |
| Google events unaffected by Outlook replace-sync delete | `test_google_rows_untouched` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_google_rows_untouched -x` |
| No-op when OUTLOOK_ICS_URL is empty string | `test_noop_when_url_unset` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_noop_when_url_unset -x` |
| Best-effort: fetch failure does not raise | `test_fetch_failure_swallowed` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_fetch_failure_swallowed -x` |

### Sampling Rate

- **Per task commit:** `uv run pytest backend/tests/test_outlook_ics_sync.py -x`
- **Per wave merge:** `uv run pytest backend/tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_outlook_ics_sync.py` — new file, does not exist yet; all tests above are RED at Wave 0
- [ ] `conftest.py` may need a `fake_sync_session` fixture analogous to `fake_credentials_json` — patch `app.services.sync._Session` with a `TestSyncSession` bound to the test DB

*(Existing conftest.py infrastructure covers the test DB setup; only the `_Session` patch fixture is new.)*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `icalendar` | ICS parsing | Not yet installed | — | None (new dep, install required) |
| `recurring-ical-events` | RRULE expansion | Not yet installed | — | None (new dep, install required) |
| `httpx` | Feed fetch | Already in `pyproject.toml` | ≥0.27 | — |
| Python 3.12 | icalendar 7.x requires ≥3.10 | Confirmed (pyproject.toml) | 3.12 | — |
| System zoneinfo (`/usr/share/zoneinfo`) | IANA timezone resolution on Pi | Available on Debian Bookworm | (system) | `tzdata` PyPI package (not needed) |

**Missing dependencies with no fallback:**
- `icalendar>=7.1,<8.0` — must be added to `backend/pyproject.toml` and installed via `uv sync`
- `recurring-ical-events>=3.8,<4.0` — same

**Missing dependencies with fallback:** None.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `icalendar` used `pytz` for timezone objects | `icalendar` 6.0+ defaults to `zoneinfo` | v6.0 (2024) | `dt.tzinfo` is now a `ZoneInfo` or `dateutil.tz` object, not `pytz.tzinfo`. Check `isinstance(dt.tzinfo, datetime.timezone)` won't catch `ZoneInfo` — use `dt.tzinfo is not None` instead. |
| `recurring-ical-events` 2.x API | `recurring-ical-events` 3.x API | v3.0 (2024) | API is the same (`of().between()`); internal handling of edge cases improved. No breaking change for this usage. |

**Deprecated/outdated:**
- `ics` 0.7.3: No RRULE expansion; do not use.
- `vobject`: Unmaintained; do not use.
- `recurring-ical-events` <2.x: Different API surface; do not use.

---

## Open Questions

1. **Windows TZID in Alabama's Office365 tenant**
   - What we know: University of Alabama likely uses Office365 with Central Time (`America/Chicago`). TZID in their ICS will likely be `"Central Standard Time"` (Windows name).
   - What's unclear: Whether their tenant has corrected VTIMEZONE blocks or uses mismatched TZID references (a known Exchange bug as of 2025).
   - Recommendation: `icalendar` 7.x `WINDOWS_TO_OLSON` should handle this transparently. If any event's `start_dt` appears wrong in testing, add a fallback that maps `"Central Standard Time"` → `"America/Chicago"` explicitly. LOW priority until live feed is tested.

2. **Non-recurring event ID — include date suffix or not?**
   - What we know: Replace-on-sync means a stale ID from a shifted non-recurring event only survives one 5-minute cycle before being replaced.
   - What's unclear: Whether using `outlook:<UID>` (no date) for singletons is worth the logic branch.
   - Recommendation: Use `outlook:<UID>:<compact_dtstart>` for ALL events (recurring and non-recurring alike) for simplicity. The replace-on-sync makes ID stability irrelevant across cycles. This avoids a RRULE detection branch and keeps the ID construction unconditional.

3. **`content-type` validation before parsing**
   - What we know: Office365 returns HTML on User-Agent failure.
   - What's unclear: Whether a `Content-Type: text/calendar` check is worth adding as a defensive guard.
   - Recommendation: Add `if "text/calendar" not in resp.headers.get("content-type", "")` check before calling `Calendar.from_ical()`. Log a warning and return empty bytes. LOW cost, high diagnostic value.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on this Phase |
|-----------|---------------------|
| PowerShell / Windows dev environment | Run `uv sync` and `uv run pytest` via PowerShell; no Bash-only commands in plans |
| `uv` as package manager | Add deps to `pyproject.toml`, run `uv sync` to install; never `pip install` directly |
| No defensive coding for impossible states | Don't check for `UID` presence on every component if icalendar guarantees it (but UID CAN be absent in malformed ICS — that IS a boundary) |
| Error handling only at system boundaries | Wrap `sync_outlook_ics()` at the top level; don't add try/except inside `_parse_ics_component` |
| Typed where language supports it | Use type annotations on new functions; `dict | None` return type on `_parse_ics_component` |
| APScheduler 3.x (not 4.x) | Confirmed; new job uses same `IntervalTrigger` from `apscheduler.triggers.interval` |
| No `create_all` — migrations only | D-01/D-02 hold: no new columns → no migration needed. Confirm before planning. |
| Tables exist ONLY via Alembic | If any new column is decided (e.g., a future `source` field) it MUST go through Alembic. For this phase: no migration. |

---

## Sources

### Primary (HIGH confidence)
- PyPI `icalendar` 7.1.2 — version, Python requirement, zoneinfo default
- PyPI `recurring-ical-events` 3.8.2 — version, icalendar dependency constraint (`>=6.1.0,<8.0.0`)
- recurring-ical-events API reference (readthedocs) — `of().between()` return type, EXDATE automatic exclusion, property access patterns
- icalendar readthedocs usage (stable/7.x) — `Calendar.from_ical()`, `.dt` accessor, `isinstance(date)` all-day detection, WINDOWS_TO_OLSON
- `backend/app/services/sync.py` (local) — `_upsert`, `_Session`, engine setup pattern to mirror
- `backend/app/models/calendar.py` (local) — `CalendarEvent` column types and constraints
- `backend/tests/conftest.py` (local) — test session fixture pattern
- `backend/tests/test_calendar.py` (local) — test style to mirror

### Secondary (MEDIUM confidence)
- Nextcloud GitHub issue #54799 — Office365 User-Agent enforcement, `OwaBasicUnsupportedException`, Chrome UA workaround
- Mozilla Bugzilla #1984590 — corroborates User-Agent issue; GET also fails without correct UA; `curl -H "User-Agent: Mozilla/5.0"` confirmed working
- Microsoft Q&A (learn.microsoft.com) — Windows TZID mismatch bug in Exchange/Office365 ICS; VTIMEZONE blocks present but name-mismatched

### Tertiary (LOW confidence)
- General ICS format guides (calen.events, calendargeek.com) — ICS structure, UID conventions; not Office365-specific

---

## Metadata

**Confidence breakdown:**
- Standard stack (icalendar + recurring-ical-events): HIGH — versions verified on PyPI 2026-06-15; dependency constraint verified
- Architecture patterns: HIGH — derived directly from existing sync.py code + verified library APIs
- Office365 User-Agent pitfall: HIGH — confirmed by two independent bug trackers (Nextcloud + Mozilla)
- Windows TZID handling: HIGH — icalendar 7.x has WINDOWS_TO_OLSON confirmed in source
- Pitfalls (floating time, scope bleed, all-day branch): HIGH — derived from RFC 5545 + library source

**Research date:** 2026-06-15
**Valid until:** 2026-09-15 (90 days; stable libraries; Office365 UA behavior could change but workaround is robust)
