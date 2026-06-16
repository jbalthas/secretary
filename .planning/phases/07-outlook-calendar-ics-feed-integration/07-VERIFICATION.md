---
phase: 07-outlook-calendar-ics-feed-integration
verified: 2026-06-15T14:30:00Z
status: human_needed
score: 11/11 must-haves verified
human_verification:
  - test: "Set OUTLOOK_ICS_URL to the live University of Alabama feed on the Pi, wait one 5-min tick (or restart for the startup run)"
    expected: "Class events appear in the Today view at correct local (America/Chicago) times, merged with Google events, no visual distinction"
    why_human: "Depends on the university's live Office365 tenant + network; real TZID resolution and the browser-UA fetch cannot be asserted in CI"
  - test: "Trigger a daily brief (Pushover + TTS) on a day with a known class"
    expected: "The Outlook class is listed in the brief body and spoken in the TTS readout alongside Google events"
    why_human: "End-to-end across scheduler -> DB -> brief -> Pushover/TTS; requires live feed populated first"
---

# Phase 7: Outlook Calendar ICS Feed Integration Verification Report

**Phase Goal:** Subscribe to a single read-only published Outlook/Office365 ICS calendar feed and merge its events into the existing `calendar_events` table so they appear seamlessly in the Today view, daily brief, and TTS alongside Google Calendar events.
**Verified:** 2026-06-15T14:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (from plan must_haves) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | icalendar + recurring-ical-events installed and importable | ✓ VERIFIED | `uv run python -c "import icalendar, recurring_ical_events"` exits 0; pinned in pyproject.toml |
| 2 | OUTLOOK_ICS_URL is a configurable Settings field defaulting to "" | ✓ VERIFIED | config.py:18 `outlook_ics_url: str = ""`; runtime assert `== ''` passes |
| 3 | 7 Outlook sync behaviors exist as named tests | ✓ VERIFIED | test_outlook_ics_sync.py defines all 7; collected and run |
| 4 | fake_sync_session fixture seeds Outlook+Google rows, patches _Session | ✓ VERIFIED | conftest.py:86 `def fake_sync_session`, seeds `google_event_keep_1`, patches `app.services.sync._Session`, yields sessionmaker |
| 5 | sync_outlook_ics fetches (browser UA), expands recurrences, replace-syncs occurrences | ✓ VERIFIED | sync.py:228 + `_fetch_ics`/`_expand_ics`/`_replace_sync`; tests green |
| 6 | Occurrences stored as `outlook:<UID>:<compact_dtstart>`, timed tz-aware/all_day=False, all-day with start_date+all_day=True+null start_dt | ✓ VERIFIED | `_parse_ics_component` (sync.py:187-213); test_timed_event_stored + test_allday_event_stored pass |
| 7 | Each sync deletes all outlook:% rows then re-inserts; Google rows untouched | ✓ VERIFIED | `_replace_sync` delete `like("outlook:%")` (sync.py:219); test_deletion_propagation + test_google_rows_untouched pass |
| 8 | No-op when URL empty; swallows all fetch/parse errors without raising | ✓ VERIFIED | sync.py:231 early return; single `except Exception` + `_log.warning` (sync.py:237); test_noop + test_fetch_failure_swallowed pass |
| 9 | APScheduler job runs sync on 5-min IntervalTrigger + once at startup | ✓ VERIFIED | scheduler.py:103 `schedule_outlook_ics_sync` id=outlook_ics_sync IntervalTrigger(minutes=5); main.py:16 schedules it, main.py:23-26 startup run |
| 10 | All 7 tests pass GREEN | ✓ VERIFIED | `pytest tests/test_outlook_ics_sync.py` → 7 passed |
| 11 | Events flow to Today view / brief / TTS merged (data-flow seam) | ✓ VERIFIED (seam) / ? human (live) | events.py + brief.py select CalendarEvent with no source filter; live feed flagged for human |

**Score:** 11/11 truths verified at the automated/seam level

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `backend/pyproject.toml` | icalendar + recurring-ical-events deps | ✓ VERIFIED | lines 13-14, version-pinned per CONTEXT |
| `backend/app/config.py` | outlook_ics_url Settings field | ✓ VERIFIED | line 18, default "" |
| `backend/.env.example` | OUTLOOK_ICS_URL doc line | ✓ VERIFIED | line 11 |
| `backend/tests/conftest.py` | fake_sync_session fixture | ✓ VERIFIED | line 86, seeds google row, patches _Session, yields |
| `backend/tests/test_outlook_ics_sync.py` | 7 RED→GREEN tests | ✓ VERIFIED | 186 lines, all 7 named tests, dynamic _make_fixture |
| `backend/app/services/sync.py` | sync_outlook_ics + 4 helpers | ✓ VERIFIED | lines 173-238; sync_calendar (Google) unmodified |
| `backend/app/scheduler.py` | schedule_outlook_ics_sync job | ✓ VERIFIED | lines 103-112, separate job id, 5-min cadence |
| `backend/app/main.py` | lifespan wiring + startup sync | ✓ VERIFIED | lines 9, 16, 23-26 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| sync.py | calendar_events | delete outlook:% then _upsert | ✓ WIRED | `delete(CalendarEvent).where(...like("outlook:%"))` (sync.py:219) reuses existing `_upsert` |
| sync.py | Outlook feed | httpx GET browser User-Agent | ✓ WIRED | `_OUTLOOK_UA = "Mozilla/5.0 (Linux) Chrome/139"` passed as User-Agent header (sync.py:175) |
| scheduler.py | sync_outlook_ics | add_job IntervalTrigger(minutes=5) | ✓ WIRED | scheduler.py:106-112 |
| main.py | schedule_outlook_ics_sync | lifespan call | ✓ WIRED | imported main.py:9, called main.py:16, startup run main.py:23-26 |
| events.py / brief.py | calendar_events | select CalendarEvent, no source filter | ✓ WIRED | both filter only on cancelled + date range; Outlook rows pass through |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| events.py `/today` | CalendarEvent rows | shared `calendar_events` table | Yes (real DB select, no prefix filter) | ✓ FLOWING (seam) |
| brief.py (body/speech/range) | CalendarEvent rows | shared `calendar_events` table | Yes (3 query paths, cancelled+date filter only) | ✓ FLOWING (seam) |
| sync.py `_replace_sync` | parsed occurrence dicts | `_expand_ics(_fetch_ics(url))` | Real expansion (tested); live fetch is human-verify | ✓ FLOWING (tested) / ? live |

Note: The full live data flow (real Office365 feed → DB → UI) is routed to human verification per VALIDATION.md — the seam is proven correct but the live tenant/network cannot be exercised in CI.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Deps importable + config default + app boots | `uv run python -c "import icalendar, recurring_ical_events; ...; import app.main"` | IMPORTS_OK | ✓ PASS |
| 7 Outlook tests | `pytest tests/test_outlook_ics_sync.py -v` | 7 passed | ✓ PASS |
| Full suite regression | `pytest tests/` | 67 passed, 1 failed | ✓ PASS (failure pre-existing) |

### Requirements Coverage

Both plans declare `requirements: []` and CONTEXT confirms Phase 7 has no pre-assigned REQ-IDs. No REQUIREMENTS.md IDs to cross-reference. No orphaned requirements. Contract verified against plan `must_haves` and 07-VALIDATION.md (all 7 mapped behaviors → GREEN).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | None found | — | TODO/FIXME/placeholder scan on sync.py/scheduler.py/main.py returned no matches |

Minor note (not a defect): `_parse_ics_component` strips UID at `@` (`split("@", 1)[0]`) vs the plan's literal `str(UID)`. This is a benign improvement — it produces cleaner ids, preserves the `outlook:` prefix and per-occurrence uniqueness, and tests asserting `outlook:timed-event-001:%` pass.

### Pre-existing Failure (not a phase-07 regression)

`test_calendar.py::test_callback_stores_credentials` fails with a 404 on the OAuth callback route. Confirmed pre-existing (fails identically before phase-07 changes), documented in `deferred-items.md`, unrelated to ICS sync. Not counted against this phase.

### Human Verification Required

1. **Live feed populates Today view** — Set `OUTLOOK_ICS_URL` on the Pi, wait one 5-min tick (or restart for startup run). Expected: class events appear at correct America/Chicago local times, merged with Google events. Why human: live Office365 tenant + network + real TZID resolution can't run in CI.
2. **Class events in daily brief + TTS** — Trigger a brief on a day with a known class. Expected: the class is in the brief body and spoken in TTS alongside Google events. Why human: end-to-end scheduler→DB→brief→Pushover/TTS requires the live feed populated first.

### Gaps Summary

No automated gaps. All 11 plan must_have truths, all 8 artifacts (exist + substantive + wired + data-flowing at the seam), and all 5 key links verify. The 7 Outlook tests pass GREEN, the app imports/boots cleanly, deps install, and the downstream read paths (events/today, brief body/speech/range) query the shared `calendar_events` table with no source discrimination — so merged display is structurally guaranteed. The phase goal is achieved at every level verifiable without the live university feed. Status is `human_needed` (not `passed`) solely because the two end-to-end behaviors against the live Office365 tenant — explicitly flagged Manual-Only in 07-VALIDATION.md — can only be confirmed by the user on the Pi.

---

_Verified: 2026-06-15T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
