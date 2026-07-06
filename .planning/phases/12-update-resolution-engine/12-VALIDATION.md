---
phase: 12
slug: update-resolution-engine
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-22
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | none — pytest discovers `backend/tests/` |
| **Quick run command** | `cd backend && python -m pytest tests/test_updates.py -x -q` |
| **Full suite command** | `cd backend && python -m pytest -x -q` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && python -m pytest tests/test_updates.py -x -q`
- **After every plan wave:** Run `cd backend && python -m pytest -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-02-T1 | 12-02 | 2 | UPDATE-02 | unit | `pytest tests/test_updates.py::test_resolve_clear_match -x` | ❌ W0 | ⬜ pending |
| 12-02-T1 | 12-02 | 2 | UPDATE-02 | unit | `pytest tests/test_updates.py::test_no_http_call -x` | ❌ W0 | ⬜ pending |
| 12-02-T1 | 12-02 | 2 | UPDATE-03 | unit | `pytest tests/test_updates.py::test_resolve_ambiguous -x` | ❌ W0 | ⬜ pending |
| 12-02-T1 | 12-02 | 2 | UPDATE-03 | unit | `pytest tests/test_updates.py::test_resolve_no_match -x` | ❌ W0 | ⬜ pending |
| 12-03-T1 | 12-03 | 2 | NOTIF-07 | unit | `pytest tests/test_updates.py::test_schedule_checkin_registers_job -x` | ❌ W0 | ⬜ pending |
| 12-03-T1 | 12-03 | 2 | NOTIF-07 | unit | `pytest tests/test_updates.py::test_checkin_notification_includes_url -x` | ❌ W0 | ⬜ pending |
| 12-03-T2 | 12-03 | 2 | NOTIF-07 | integration | `pytest tests/test_updates.py::test_checkin_time_settings_roundtrip -x` | ❌ W0 | ⬜ pending |
| 12-04-T2 | 12-04 | 2 | INGEST-08 | integration | `pytest tests/test_updates.py::test_ingest_intra_day_update_applies -x` | ❌ W0 | ⬜ pending |
| 12-04-T2 | 12-04 | 2 | INGEST-08 | integration | `pytest tests/test_updates.py::test_ingest_update_idempotent -x` | ❌ W0 | ⬜ pending |
| 12-04-T1 | 12-04 | 2 | INGEST-08 | integration | `pytest tests/test_updates.py::test_ingest_v10_still_valid -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. All 10 named tests are authored RED in Wave 0 (12-01 Task 3) and turned green by the Wave 2 plans referenced above.*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_updates.py` — stubs for all named tests above (red until implementation)
- [ ] `backend/app/schemas/update.py` — `UpdateRequest`, `UpdateResponse` Pydantic models (needed for test imports)
- [ ] `backend/app/services/resolution_service.py` — stub with `resolve_update` signature only
- [ ] `rapidfuzz>=3.9,<4.0` added to `pyproject.toml`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Check-in job survives a real Pi reboot | NOTIF-07 | True OS reboot can't run in CI | After deploy, set check-in time, reboot Pi, confirm `scheduler.get_job("mid_day_checkin")` still present and notification fires |

*Automated proxy: scheduler restart test (stop/start scheduler against the SQLAlchemyJobStore, assert job re-loads).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
