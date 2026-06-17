---
phase: 10
slug: day-auto-organize
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend), vitest (frontend) — confirm against existing config during Wave 0 |
| **Config file** | `backend/pyproject.toml` / `frontend/vitest.config.ts` (verify; Wave 0 installs if missing) |
| **Quick run command** | `cd backend; pytest -q` |
| **Full suite command** | `cd backend; pytest` then `cd frontend; npm run test` |
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
| TBD — planner populates from PLAN.md task IDs | | | PLAN-01 / PLAN-02 | unit/integration | `cd backend; pytest -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Backend test stubs for the pure planner (`propose_day_plan`): gap-finding, first-fit packing, all-day-as-context, place-if-fits-else-skip, ordering (priority → due-date proximity), backfill tier
- [ ] Integration test stubs for `/plan/*` endpoints: read-only propose guarantee (no DB write), 409 on second naked approve, replan replaces, staleness enrichment on read
- [ ] Shared fixtures: in-memory async session, sample tasks (due/overdue/backfill/habit), sample calendar events (timed + all-day)
- [ ] Confirm pytest + vitest infrastructure present; install if missing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Organize page review/edit affordances (remove, up/down reorder, adjust start/duration) | PLAN-02 | UI interaction on phone browser | Open Organize, propose plan, remove a block, reorder via up/down, adjust a duration, approve |
| Staleness badge rendering in Today | PLAN-02 | Visual badge after late calendar event | Approve plan, add overlapping calendar event, confirm per-block "conflicts with [event]" badge appears |

*Automated tests cover the planner logic and endpoint contracts; the above cover visual/interaction layers.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
