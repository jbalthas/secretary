---
phase: 17
slug: task-subtask-hierarchy-drag-drop
status: planned
nyquist_compliant: true
wave_0_complete: true
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
| 17-01 Task 2 | 17-01 | 1 | D-01 | integration | `pytest tests/test_tasks.py::test_nest_under_child_rejected -x` | ✅ planned | ⬜ pending execution |
| 17-01 Task 2 | 17-01 | 1 | D-01 | integration | `pytest tests/test_tasks.py::test_nest_task_with_children_rejected -x` | ✅ planned | ⬜ pending execution |
| 17-01 Task 3 | 17-01 | 1 | D-04/D-05 | integration | `pytest tests/test_plan.py::test_patch_block_parent_task_id -x` | ✅ planned | ⬜ pending execution |
| 17-01 Task 2 | 17-01 | 1 | D-07 | integration | `pytest tests/test_tasks.py::test_no_completion_propagation -x` | ✅ planned | ⬜ pending execution |
| 17-01 Task 2 | 17-01 | 1 | D-10 | integration | `pytest tests/test_tasks.py::test_delete_parent_clears_children -x` | ✅ planned | ⬜ pending execution |
| 17-02 Task 2 | 17-02 | 1 | D-06 | unit | `npx vitest run src/lib/taskHierarchy.test.ts` | ✅ planned | ⬜ pending execution |
| 17-02 Task 3 | 17-02 | 1 | D-03 (nest/before/after classification) | unit | `npx vitest run src/lib/dragIntent.test.ts` | ✅ planned | ⬜ pending execution |
| 17-02 Task 2 | 17-02 | 1 | D-03 (reorder — locked, not discretionary; only persistence mechanism was discretionary) | unit | `npx vitest run src/lib/taskHierarchy.test.ts` (moveInOrder/applyManualOrder cases) | ✅ planned | ⬜ pending execution |
| 17-04 Task 1/2 + Task 3 checkpoint | 17-04 | 2 | D-03 (reorder wired end-to-end on Today timeline) | manual | see Manual-Only Verifications below | — | ⬜ pending execution |
| 17-05 Task 3 (checkpoint) | 17-05 | 2 | D-11 | manual | manual verification (drawer has no existing component test harness) | — | ⬜ pending execution |

*Status: ⬜ pending execution (plans written, not yet run) · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finalized — all 5 PLAN.md files exist (17-01 through 17-05).*

---

## Wave 0 Requirements

- [x] `backend/tests/test_tasks.py` — nesting-validation tests (D-01, D-07, D-10) added alongside existing task tests — covered by Plan 17-01, Task 2
- [x] `backend/tests/test_plan.py` — `ScheduledBlock.parent_task_id` PATCH tests (D-04/D-05) added; `ScheduledBlockUpdate` schema/router fix (widened beyond `completed: bool` alone) implemented in the same task — covered by Plan 17-01, Task 3
- [x] `frontend/src/lib/taskHierarchy.test.ts` — new file, unit tests for the client-side grouping helper AND the manual-reorder helpers (`moveInOrder`/`applyManualOrder`, added in this revision to satisfy D-03's locked reorder requirement) — covered by Plan 17-02, Task 2
- [x] `frontend/src/lib/dragIntent.test.ts` — unit tests for the nest/before/after pointer-position classifier (pure function, unit-testable without mounting dnd-kit) — covered by Plan 17-02, Task 3

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Subtask of" dropdown in TaskDrawer renders and excludes invalid parents (already-nested tasks) | D-11 | No existing component test harness for TaskDrawer | Open TaskDrawer for a task, verify dropdown lists only top-level tasks (not the task itself, not tasks already nested under another parent) — covered by Plan 17-05, Task 3 checkpoint |
| Drag-drop nest vs. reorder interaction on Today timeline | D-03 | Requires real pointer/drag events in a browser, not practical to automate with current test setup | Drag a task onto center of another row → verify it nests; drag into the gap at a row's top/bottom edge → verify the two rows visibly swap order immediately (in-memory/session-level per Claude's discretion over persistence only — reordering itself is locked, not optional) — covered by Plan 17-04, Task 3 checkpoint |
| Nested groups render expanded by default with progress badge | D-06/D-09 | Visual verification | Nest 2+ children under a parent, reload page, confirm children visible without expanding and badge shows correct count (e.g. "2/3") — covered by Plan 17-04, Task 3 and Plan 17-05, Task 3 checkpoints |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint tasks use documented manual-verification steps instead, per convention)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (each plan's auto tasks carry `<verify><automated>`; only the trailing checkpoint task per Wave-2 plan is manual)
- [x] Wave 0 covers all MISSING references (all 4 Wave 0 test files are created by Plan 17-01/17-02, not deferred)
- [x] No watch-mode flags (`vitest run`, not `vitest`; `pytest -x`, no `--watch`)
- [x] Feedback latency < 30s (per-task automated commands run in seconds; full-suite gate ~30s backend / ~20s frontend)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — plans 17-01 through 17-05 satisfy this validation contract at planning time; execution-time Status column will be updated as each plan runs.
