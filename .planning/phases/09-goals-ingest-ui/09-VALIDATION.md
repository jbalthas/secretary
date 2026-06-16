---
phase: 9
slug: goals-ingest-ui
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-16
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + FastAPI TestClient (sync) — backend; `tsc --noEmit` + `vite build` — frontend (no UI test runner; golden-path manual per CLAUDE.md) |
| **Config file** | `backend/pyproject.toml` (`[dependency-groups] dev = ["pytest>=8", ...]`); frontend `tsc`/`vite` already configured |
| **Quick run command** | `uv run --project backend python -m pytest backend/tests/test_ingest.py backend/tests/test_goals.py -q` |
| **Full suite command** | `uv run --project backend python -m pytest backend/tests/ -q` |
| **Estimated runtime** | ~15 seconds (backend suite); frontend `npm run build` ~20s |

---

## Sampling Rate

- **After every task commit:** Run `uv run --project backend python -m pytest backend/tests/test_ingest.py backend/tests/test_goals.py -q` (backend tasks); `cd frontend; npx tsc --noEmit` (frontend tasks)
- **After every plan wave:** Run `uv run --project backend python -m pytest backend/tests/ -q` and `cd frontend; npm run build`
- **Before `/gsd:verify-work`:** Full backend suite green + `npm run build` clean + manual golden-path of Goals page (09-03 Task 3) and Ingest page + linking (09-04 Task 4)
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | INGEST-03 | unit (RED) | `uv run --project backend python -m pytest backend/tests/test_ingest.py -k preview -q` | ✅ (creates) | ⬜ pending |
| 9-01-02 | 01 | 1 | INGEST-03, GOAL-05 | unit (GREEN) | `uv run --project backend python -m pytest backend/tests/test_ingest.py backend/tests/test_goals.py -q` | ✅ | ⬜ pending |
| 9-02-01 | 02 | 1 | GOAL-04, GOAL-05 | typecheck | `cd frontend; npx tsc --noEmit` | ✅ | ⬜ pending |
| 9-02-02 | 02 | 1 | GOAL-04 | build | `cd frontend; npx tsc --noEmit; npm run build` | ✅ | ⬜ pending |
| 9-03-01 | 03 | 2 | GOAL-04 | typecheck | `cd frontend; npx tsc --noEmit` | ✅ | ⬜ pending |
| 9-03-02 | 03 | 2 | GOAL-04 | build | `cd frontend; npx tsc --noEmit; npm run build` | ✅ | ⬜ pending |
| 9-03-03 | 03 | 2 | GOAL-04 | manual | Manual golden-path (browser) — see Manual-Only Verifications | N/A | ⬜ pending |
| 9-04-01 | 04 | 2 | GOAL-05 | build | `cd frontend; npx tsc --noEmit; npm run build` | ✅ | ⬜ pending |
| 9-04-02 | 04 | 2 | INGEST-03, INGEST-05 | typecheck | `cd frontend; npx tsc --noEmit` | ✅ | ⬜ pending |
| 9-04-03 | 04 | 2 | INGEST-03, INGEST-05 | build | `cd frontend; npx tsc --noEmit; npm run build` | ✅ | ⬜ pending |
| 9-04-04 | 04 | 2 | GOAL-05, INGEST-03, INGEST-05 | manual | Manual golden-path (browser) — see Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_ingest.py` — add `test_preview_*` tests (09-01 Task 1) covering: preview returns per-entity `EntityDiff` create/update list, preview does NOT write to the DB, preview returns 422 on invalid payload. These are the RED tests; 09-01 Task 2 makes them GREEN.

*(Frontend component tests: None planned. Manual golden-path is the established project convention — CLAUDE.md.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Goals page list + detail (progress bars, type badges, Active/Archived filter, milestone add/toggle-done, linked tasks, complete/archive-with-confirm) | GOAL-04 | No frontend test runner; visual + interactive UI | 09-03 Task 3 `<how-to-verify>` (run dev servers, phone-width browser, create goal → detail → milestone toggle → archive confirm → Import nav) |
| Task + routine goal dropdown linking (incl. explicit-null unlink) | GOAL-05 | UI interaction + drawer round-trip | 09-04 Task 4 steps 1–2 (link task to goal, verify in detail; link/unlink routine, verify persistence) |
| Ingest full loop: copy prompt → paste/upload → preview diff (no write) → confirm (disabled-on-submit) → /goals; JSON parse error + 422 field-level errors | INGEST-03, INGEST-05 | Clipboard, FileReader, visual diff badges, disable-on-submit | 09-04 Task 4 steps 3–7 |

*Backend behavior (INGEST-03 preview endpoint: per-entity diff + no-write) IS automated via 09-01 preview tests; the frontend rendering of it is manual.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (9 code tasks automated; 2 checkpoint tasks are manual-only and listed above)
- [x] Sampling continuity: no 3 consecutive code tasks without automated verify
- [x] Wave 0 covers all MISSING references (09-01 Task 1 creates the preview tests that 09-01 Task 2's `<verify>` relies on)
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-16
