---
phase: 11
slug: goal-guided-guidance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | `backend/pytest.ini` or `pyproject.toml` |
| **Quick run command** | `cd backend && python -m pytest tests/test_guidance.py -x -q` |
| **Full suite command** | `cd backend && python -m pytest -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && python -m pytest tests/test_guidance.py -x -q`
- **After every plan wave:** Run `cd backend && python -m pytest -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | GUIDE-01 | unit | `pytest tests/test_guidance.py::test_goal_snapshot -x -q` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | GUIDE-01 | unit | `pytest tests/test_guidance.py::test_brief_includes_snapshot -x -q` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | GUIDE-02 | unit | `pytest tests/test_guidance.py::test_next_best_task_scoring -x -q` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 1 | GUIDE-02 | unit | `pytest tests/test_guidance.py::test_next_best_task_api -x -q` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 2 | GUIDE-03 | unit | `pytest tests/test_guidance.py::test_stall_detection -x -q` | ❌ W0 | ⬜ pending |
| 11-03-02 | 03 | 2 | GUIDE-03 | unit | `pytest tests/test_guidance.py::test_one_guidance_per_day -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_guidance.py` — stubs for GUIDE-01, GUIDE-02, GUIDE-03
- [ ] `backend/tests/conftest.py` — verify shared fixtures exist (should already exist)

*Existing test infrastructure covers most of the phase; only test_guidance.py is new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Today view displays next-best-task above agenda | GUIDE-02 | Frontend rendering; no Selenium/Playwright setup | Open UI, verify card appears above agenda items |
| Stall nudge fires on day 7 | GUIDE-03 | APScheduler timing in dev is awkward to simulate | Set `stall_threshold_days=1`, mark goal task completed 2 days ago, trigger job manually, verify Pushover received |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
