---
phase: 13
slug: update-loop-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (jsdom) — frontend; pytest — backend (apply-step + check-in changes) |
| **Config file** | `frontend/vite.config.ts` (`test: { environment: "jsdom" }`); `backend/pyproject.toml` |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd frontend && npm test -- --run --coverage` (+ `cd backend && uv run pytest` for backend tasks) |
| **Estimated runtime** | ~5–10 seconds frontend; ~15–30 seconds backend |

> **No `@testing-library/react` (RTL) is installed and it is a forbidden new dependency.** Existing frontend tests cover only pure lib functions. Phase 13 frontend tests MUST follow the same pattern: test pure lib utilities (`timeUtils.ts`, `rollup.ts`), not React components. Component-render behavior is manual-only.

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run` (and `cd backend && uv run pytest` for backend tasks)
- **After every plan wave:** Run full suite with coverage
- **Before `/gsd:verify-work`:** Full suite (frontend + backend) must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-W0 | 01 | 0 | UPDATE-01 | unit | `npm test -- --run src/lib/timeUtils.test.ts` | ❌ W0 | ⬜ pending |
| 13-W0 | 01 | 0 | UPDATE-04 | unit | `npm test -- --run src/lib/rollup.test.ts` | ❌ W0 | ⬜ pending |
| 13-apply | — | 1 | UPDATE-01/03 | unit (backend) | `uv run pytest tests/test_updates.py` | ✅ | ⬜ pending |
| 13-checkin | — | 1 | NOTIF-08 | unit (backend) | `uv run pytest tests/test_updates.py -k checkin` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/lib/timeUtils.ts` — `isAfterWorkHours(workEnd: string | null)` pure function (does NOT exist today; UI-SPEC wrongly assumed it from Phase 10)
- [ ] `frontend/src/lib/timeUtils.test.ts` — unit tests: `null → false`, past-end → true, before-end → false
- [ ] `frontend/src/lib/rollup.ts` — `deriveRollup(tasks, blocks, todayKey)` pure function (extracted from component for testability; note `completed=true` is ambiguous between done and dropped per Phase 12)
- [ ] `frontend/src/lib/rollup.test.ts` — unit tests: completed→completed bucket, incomplete today-task→slipped bucket
- [ ] Backend `check_in_enabled` decision — Alembic migration (continue chain from 0011+) OR documented null-hour sentinel; allocate the task explicitly

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Quick-update box submit reflects in Today immediately | UPDATE-01 | No RTL; component + data-refetch flow | Type "finished standup" in the Today update box, submit, confirm the matched item shows done without page reload |
| Candidate card confirm/dismiss transitions | UPDATE-03 | No RTL; stateful component | Submit an ambiguous update, confirm candidate list renders, click "Confirm match" applies it, "Skip"/"dismiss" clears without applying |
| End-of-day rollup card render gate | UPDATE-04 | Time-gated render | After work-hours end, confirm rollup card shows completed vs. slipped; before end, confirm hidden |
| Check-in time/enable persists across restart | NOTIF-08 | Reboot/scheduler persistence | Set check-in time + toggle in Settings, restart `secretary` service, confirm schedule persists (APScheduler SQLAlchemyJobStore) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (component behaviors documented manual-only above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (timeUtils, rollup, check_in_enabled)
- [ ] No watch-mode flags (use `--run`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
