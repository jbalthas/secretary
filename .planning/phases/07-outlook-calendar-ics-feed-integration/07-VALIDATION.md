---
phase: 7
slug: outlook-calendar-ics-feed-integration
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-15
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (present in `backend/pyproject.toml` dev deps) |
| **Config file** | none — default discovery from `backend/` |
| **Quick run command** | `uv run pytest backend/tests/test_outlook_ics_sync.py -x` |
| **Full suite command** | `uv run pytest backend/tests/ -x` |
| **Estimated runtime** | ~15 seconds (fixture ICS strings, no network) |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest backend/tests/test_outlook_ics_sync.py -x`
- **After every plan wave:** Run `uv run pytest backend/tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

> Task IDs (`07-NN-MM`) assigned by the planner. Each behavior below maps to a named
> test in `backend/tests/test_outlook_ics_sync.py`. All RED at Wave 0 (file does not exist).

| Behavior | Test Name | Test Type | Automated Command | File Exists | Status |
|----------|-----------|-----------|-------------------|-------------|--------|
| Timed event → tz-aware start_dt/end_dt, all_day=False | `test_timed_event_stored` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_timed_event_stored -x` | ❌ W0 | ⬜ pending |
| All-day event → start_date YYYY-MM-DD, all_day=True, null start_dt | `test_allday_event_stored` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_allday_event_stored -x` | ❌ W0 | ⬜ pending |
| Recurring (RRULE WEEKLY;COUNT=4, 1 EXDATE) → 3 occurrences | `test_recurring_event_expanded` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_recurring_event_expanded -x` | ❌ W0 | ⬜ pending |
| Deletion propagation: removed-from-feed event disappears on re-sync | `test_deletion_propagation` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_deletion_propagation -x` | ❌ W0 | ⬜ pending |
| Google rows untouched by Outlook replace-sync delete | `test_google_rows_untouched` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_google_rows_untouched -x` | ❌ W0 | ⬜ pending |
| No-op when OUTLOOK_ICS_URL empty | `test_noop_when_url_unset` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_noop_when_url_unset -x` | ❌ W0 | ⬜ pending |
| Best-effort: fetch failure does not raise | `test_fetch_failure_swallowed` | unit | `uv run pytest backend/tests/test_outlook_ics_sync.py::test_fetch_failure_swallowed -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_outlook_ics_sync.py` — new file; all tests above are RED at Wave 0
- [ ] `backend/tests/conftest.py` — may need a `fake_sync_session` fixture analogous to
      `fake_credentials_json`: patch `app.services.<outlook-module>._Session` (and/or
      `app.services.sync._Session`) with a session bound to the test DB
- [ ] `icalendar>=7.1,<8.0` + `recurring-ical-events>=3.8,<4.0` added to
      `backend/pyproject.toml` and installed via `uv sync` (framework deps, not test deps)

*Existing conftest.py covers test-DB setup; only the `_Session` patch fixture is new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Office365 feed fetches (correct User-Agent, real TZID resolves) | Phase 7 | Depends on the university's live tenant + network; can't assert in CI | Set `OUTLOOK_ICS_URL` on the Pi, wait one 5-min tick (or trigger sync), confirm class events appear in the Today view with correct local times |
| Class events appear merged in Today view + daily brief alongside Google events | Phase 7 | End-to-end across scheduler → DB → API → UI | After live sync, open the app Today tab and check a known class shows at the right time; trigger a brief and confirm the class is listed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`test_outlook_ics_sync.py`, new deps)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-15
