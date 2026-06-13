---
phase: 3
slug: pushover-reminders
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | tests/conftest.py |
| **Quick run command** | `python -m pytest tests/ -x -q` |
| **Full suite command** | `python -m pytest tests/ -v` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest tests/ -x -q`
- **After every plan wave:** Run `python -m pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | NOTIF-01 | unit | `python -m pytest tests/test_notifications.py -x -q` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | NOTIF-01 | unit | `python -m pytest tests/test_notifications.py::test_send_pushover -x -q` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | NOTIF-02 | unit | `python -m pytest tests/test_notifications.py::test_scheduler_misfire -x -q` | ❌ W0 | ⬜ pending |
| 3-01-04 | 01 | 2 | NOTIF-02 | integration | `python -m pytest tests/test_notifications.py::test_reminder_survives_restart -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_notifications.py` — stubs for NOTIF-01, NOTIF-02
- [ ] `tests/conftest.py` — shared fixtures (app client, DB session, mock Pushover)

*If existing: update conftest with notification fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pushover notification arrives within 60s | NOTIF-01 | Requires real Pushover API + phone | Create task with reminder 2 min out, wait, check phone |
| Reminder fires after Pi reboot | NOTIF-02 | Requires physical reboot | Schedule reminder, reboot Pi, confirm notification arrives |
| No duplicate on service restart | NOTIF-02 | Depends on timing + real scheduler | Restart service while job is pending, confirm single notification |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
