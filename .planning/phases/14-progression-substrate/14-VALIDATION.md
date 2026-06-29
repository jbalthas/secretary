---
phase: 14
slug: progression-substrate
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-29
---

# Phase 14 - Validation Strategy

Focused: cd backend && python -m pytest tests/test_snapshots.py -q
Full: cd backend && python -m pytest -q

| Plan | Requirement | Behavior | Test |
|---|---|---|---|
| 14-01 | PROG-01 | Correct weekly metrics | test_snapshot_captures_active_goal_metrics |
| 14-01 | PROG-01 | Same date is idempotent | test_snapshot_same_day_is_idempotent |
| 14-01 | PROG-01 | Inactive goals excluded | test_snapshot_skips_inactive_goals |
| 14-01 | PROG-01 | Two-year retention | test_snapshot_cleanup_retention |
| 14-02 | PROG-01 | Stable scheduler jobs | test_snapshot_jobs_registered |
| 14-02 | PROG-02 | POST trigger response | test_snapshot_endpoint |

The service remains synchronous. Week bounds are local naive Monday-inclusive to next-Monday-exclusive. The composite unique index guards goal/date. The Phase 15 UI will call the backend endpoint created here.