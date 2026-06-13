---
phase: 4
slug: calendar-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | `backend/pyproject.toml` or `backend/pytest.ini` |
| **Quick run command** | `cd backend && uv run pytest tests/test_calendar.py -q` |
| **Full suite command** | `cd backend && uv run pytest -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_calendar.py -q`
- **After every plan wave:** Run `cd backend && uv run pytest -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | CAL-01 | unit | `uv run pytest tests/test_calendar.py::test_oauth_flow -q` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | CAL-01 | unit | `uv run pytest tests/test_calendar.py::test_token_refresh -q` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | CAL-01 | unit | `uv run pytest tests/test_calendar.py::test_token_store -q` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | CAL-02 | unit | `uv run pytest tests/test_calendar.py::test_sync_job -q` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | CAL-02 | unit | `uv run pytest tests/test_calendar.py::test_incremental_sync -q` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 1 | CAL-03 | unit | `uv run pytest tests/test_calendar.py::test_http_410_full_resync -q` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | CAL-04 | unit | `uv run pytest tests/test_calendar.py::test_token_revoke_alert -q` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 2 | CAL-02 | integration | `uv run pytest tests/test_calendar.py::test_agenda_endpoint -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_calendar.py` — stubs for CAL-01, CAL-02, CAL-03, CAL-04
- [ ] `backend/tests/conftest.py` — update with calendar fixtures (mock Google API, mock token store)

*Note: Wave 0 test stubs go in Plan 01 Task 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full OAuth flow in browser | CAL-01 | Requires real Google login flow | Navigate to `/auth/google`, complete OAuth consent, verify token stored |
| Calendar event appears within 5 min | CAL-02 | Requires real Google Calendar + wait | Create event in Google Calendar, wait ≤5 min, check app agenda view |
| Pushover alert on token revocation | CAL-04 | Requires real Pushover + token revoke | Revoke token via Google account settings, wait for next sync cycle, check Pushover app |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
