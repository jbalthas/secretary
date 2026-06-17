---
phase: 10
slug: day-auto-organize
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend), tsc/vite build (frontend — no RTL tests this phase) |
| **Config file** | `backend/pyproject.toml` (existing); frontend `tsconfig` + `vite` |
| **Quick run command** | `cd backend && python -m pytest tests/test_plan.py -x` |
| **Full suite command** | `cd backend && python -m pytest` then `cd frontend && npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01 T1 | 10-01 | 1 | PLAN-01/02 | scaffold | `cd backend && python -m pytest tests/test_plan.py --collect-only -q` | ❌ W0→created | ⬜ pending |
| 10-01 T2 | 10-01 | 1 | PLAN-02 | import | `cd backend && python -c "from app.models.plan import ScheduledBlock; from app.schemas.plan import ProposedDayPlan; print('ok')"` | ❌ W0→created | ⬜ pending |
| 10-01 T3 | 10-01 | 1 | PLAN-01 | integration | `cd backend && python -m pytest tests/test_settings.py -q` | ✅ exists | ⬜ pending |
| 10-02 T1 | 10-02 | 2 | PLAN-01 | unit (7) | `cd backend && python -m pytest tests/test_plan.py -k "all_day or estimated_minutes or task_ordering or habits or place_if_fits or fully_booked or past_gaps" -x` | ❌→green | ⬜ pending |
| 10-03 T1 | 10-03 | 3 | PLAN-01/02 | integration (5) + full | `cd backend && python -m pytest tests/test_plan.py -x && cd backend && python -m pytest` | ❌→green | ⬜ pending |
| 10-04 T1 | 10-04 | 4 | PLAN-01/02 | typecheck | `cd frontend && npx tsc --noEmit` | n/a | ⬜ pending |
| 10-04 T2 | 10-04 | 4 | PLAN-01/02 | build | `cd frontend && npx tsc --noEmit && npm run build` | n/a | ⬜ pending |
| 10-04 T3 | 10-04 | 4 | PLAN-02 | human-verify | manual (phone browser) | n/a | ⬜ pending |

### Test name → task mapping (test_plan.py)

| Test | Goes green in |
|------|---------------|
| test_all_day_event_not_a_blocker | 10-02 T1 |
| test_block_sized_from_estimated_minutes | 10-02 T1 |
| test_task_ordering | 10-02 T1 |
| test_habits_excluded | 10-02 T1 |
| test_place_if_fits_else_skip | 10-02 T1 |
| test_fully_booked_day | 10-02 T1 |
| test_past_gaps_excluded | 10-02 T1 |
| test_propose_is_read_only | 10-03 T1 |
| test_approve_idempotent_409 | 10-03 T1 |
| test_replan_replaces | 10-03 T1 |
| test_staleness_detection | 10-03 T1 |
| test_delete_block | 10-03 T1 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Backend test stubs for the pure planner (`propose_day_plan`): gap-finding, first-fit packing, all-day-as-context, place-if-fits-else-skip, ordering (priority → due-date proximity), backfill tier — `test_plan.py` 7 unit tests
- [ ] Integration test stubs for `/plan/*` endpoints: read-only propose guarantee (no DB write), 409 on second naked approve, replan replaces, staleness enrichment on read, delete — `test_plan.py` 5 integration tests
- [ ] Shared fixtures: reuse conftest.py session-scoped test DB (Base.metadata.create_all); sample tasks/events built inline in tests
- [ ] Confirm pytest infrastructure present (it is — test_tasks.py/test_goals.py use sync TestClient)

All Wave 0 test stubs are created in plan **10-01 Task 1**.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Organize page review/edit affordances (remove, up/down reorder, adjust start/duration) | PLAN-02 | UI interaction on phone browser | 10-04 Task 3 checkpoint steps 4 |
| Staleness badge rendering in Today | PLAN-02 | Visual badge after late calendar event | 10-04 Task 3 checkpoint steps 6-7 |
| Fully-booked / Re-plan / approved-state UX | PLAN-02 | Visual + flow on phone | 10-04 Task 3 checkpoint steps 5,8,9 |

*Automated tests cover the planner logic and endpoint contracts; the above cover visual/interaction layers.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 / human-verify dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test_plan.py created in 10-01 T1)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned
