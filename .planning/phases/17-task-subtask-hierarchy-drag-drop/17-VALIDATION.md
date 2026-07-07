---
phase: 17
slug: task-subtask-hierarchy-drag-drop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + FastAPI `TestClient` (backend, sync); Vitest 4.1.x + jsdom (frontend) |
| **Config file** | `backend/pyproject.toml` ([dependency-groups] dev); frontend `vitest` config implicit via `vite` config + `package.json` `"test": "vitest"` |
| **Quick run command** | `cd backend && uv run pytest tests/test_tasks.py tests/test_plan.py -x` / `cd frontend && npm test -- --run` |
| **Full suite command** | `cd backend && uv run pytest` / `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~30 seconds (backend), ~20 seconds (frontend) |

---

## Sampling Rate

- **After every task commit:** Run targeted `pytest tests/test_tasks.py tests/test_plan.py -x` (backend) and `npm test -- --run <touched-file>.test.ts` (frontend)
- **After every plan wave:** Run full `uv run pytest` + `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-TBD | TBD | TBD | D-01 | integration | `pytest tests/test_tasks.py::test_nest_under_child_rejected -x` | ❌ W0 | ⬜ pending |
| 17-TBD | TBD | TBD | D-01 | integration | `pytest tests/test_tasks.py::test_nest_task_with_children_rejected -x` | ❌ W0 | ⬜ pending |
| 17-TBD | TBD | TBD | D-04/D-05 | integration | `pytest tests/test_plan.py::test_patch_block_parent_task_id -x` | ❌ W0 | ⬜ pending |
| 17-TBD | TBD | TBD | D-07 | integration | `pytest tests/test_tasks.py::test_no_completion_propagation -x` | ❌ W0 | ⬜ pending |
| 17-TBD | TBD | TBD | D-10 | integration | `pytest tests/test_tasks.py::test_delete_parent_clears_children -x` | ❌ W0 | ⬜ pending |
| 17-TBD | TBD | TBD | D-06 | unit | `npm test -- --run taskHierarchy.test.ts` | ❌ W0 | ⬜ pending |
| 17-TBD | TBD | TBD | D-03 | unit | `npm test -- --run dragIntent.test.ts` | ❌ W0 | ⬜ pending |
| 17-TBD | TBD | TBD | D-11 | manual | manual verification (drawer has no existing component test harness) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finalized once PLAN.md files are written by gsd-planner.*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_tasks.py` — add nesting-validation tests (D-01, D-07, D-10) alongside existing task tests
- [ ] `backend/tests/test_plan.py` — add `ScheduledBlock.parent_task_id` PATCH tests (D-04/D-05); requires the `ScheduledBlockUpdate` schema/router fix (currently only has `completed: bool`) before these tests can pass
- [ ] `frontend/src/lib/taskHierarchy.test.ts` — new file, unit tests for the client-side grouping helper (mirrors existing `taskFilters.test.ts`)
- [ ] `frontend/src/lib/dragIntent.test.ts` (or co-located with the DnD wrapper) — unit tests for the nest/reorder pointer-position classifier (pure function, unit-testable without mounting dnd-kit)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Subtask of" dropdown in TaskDrawer renders and excludes invalid parents (already-nested tasks) | D-11 | No existing component test harness for TaskDrawer | Open TaskDrawer for a task, verify dropdown lists only top-level tasks (not the task itself, not tasks already nested under another parent) |
| Drag-drop nest vs. reorder interaction on Today timeline | D-03 | Requires real pointer/drag events in a browser, not practical to automate with current test setup | Drag a task onto center of another row → verify it nests; drag into gap between rows → verify it reorders |
| Nested groups render expanded by default with progress badge | D-06/D-09 | Visual verification | Nest 2+ children under a parent, reload page, confirm children visible without expanding and badge shows correct count (e.g. "2/3") |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
