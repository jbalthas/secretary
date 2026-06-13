---
phase: 2
slug: tasks-agenda
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend) + vitest (frontend) |
| **Config file** | `pyproject.toml` (pytest) / `vite.config.ts` (vitest) |
| **Quick run command** | `cd backend && python -m pytest tests/ -x -q` |
| **Full suite command** | `cd backend && python -m pytest tests/ && cd ../frontend && npm test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && python -m pytest tests/ -x -q`
- **After every plan wave:** Run `cd backend && python -m pytest tests/ && cd ../frontend && npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | TASK-01 | unit | `python -m pytest tests/test_tasks.py -x -q` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TASK-01 | integration | `python -m pytest tests/test_tasks.py::test_create_task -x -q` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | TASK-02 | integration | `python -m pytest tests/test_tasks.py::test_update_task -x -q` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | TASK-03 | integration | `python -m pytest tests/test_tasks.py::test_complete_delete_task -x -q` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | TASK-04 | manual | N/A | N/A | ⬜ pending |
| 02-02-02 | 02 | 2 | TASK-05 | manual | N/A | N/A | ⬜ pending |
| 02-02-03 | 02 | 2 | TASK-06 | integration | `python -m pytest tests/test_tasks.py::test_recurring_task -x -q` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 2 | TASK-07 | manual | N/A | N/A | ⬜ pending |
| 02-03-01 | 03 | 2 | CAL-05 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_tasks.py` — stubs for TASK-01 through TASK-07
- [ ] `backend/tests/conftest.py` — async test client fixtures
- [ ] `backend/tests/__init__.py` — package marker
- [ ] `pytest-asyncio` asyncio_mode configured in `pyproject.toml` OR use sync `TestClient`

*Wave 0 must create test stubs before any Wave 1+ implementation tasks run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Task form renders on mobile browser | TASK-01 | UI rendering requires browser | Open app on phone, tap "Add Task", verify form appears with all fields |
| Slide-in drawer animation | TASK-02 | CSS animation, no automated equivalent | Edit a task, verify drawer slides in from right |
| Filter/sort UI controls | TASK-05 | UI interaction | Use filter chips and sort dropdown, verify list updates |
| Recurring task re-appears | TASK-06 | Time-dependent behavior | Complete a daily recurring task, verify it re-creates |
| Today's agenda merge | CAL-05 | Visual layout | Open agenda view, verify tasks and placeholder events merge correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
