---
phase: 15
slug: context-export-advisor-prompt
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-29
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing) |
| **Config file** | `backend/pytest.ini` or `backend/pyproject.toml` |
| **Quick run command** | `cd backend && python -m pytest tests/test_export.py -x -q` |
| **Full suite command** | `cd backend && python -m pytest -x -q` |
| **Estimated runtime** | ~30 seconds (quick), full suite per existing baseline |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && python -m pytest tests/test_export.py -x -q`
- **After every plan wave:** Run `cd backend && python -m pytest -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-XX-XX | TBD | 0 | infra | scaffolding | `pytest tests/test_export.py --collect-only` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | EXPORT-01 | unit (TestClient) | `pytest tests/test_export.py::test_bundle_endpoint -x` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | EXPORT-02 | unit (mock DB) | `pytest tests/test_export.py::test_bundle_contains_goal_section -x` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | EXPORT-03 | unit (mock blocks) | `pytest tests/test_export.py::test_block_summary -x` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | EXPORT-04 | unit (pure fn) | `pytest tests/test_export.py::test_velocity_label -x` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | EXPORT-05 | unit (mock DB) | `pytest tests/test_export.py::test_calendar_section_privacy -x` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | EXPORT-06 | unit (mock DB) | `pytest tests/test_export.py::test_goal_ordering -x` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | PROMPT-01 | manual / lint | inspect `advisorPrompt.ts` for `[SCHEMA BLOCK]` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | — | locked constraint | unit (CI guard) | `pytest tests/test_export.py::test_no_llm_imports -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are placeholders — gsd-planner assigns final IDs and waves.*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_export.py` — stubs for EXPORT-01..06 (7 test functions) plus `test_no_llm_imports` CI guard
- [ ] `frontend/src/lib/advisorPrompt.ts` — file must exist with literal `[SCHEMA BLOCK]` placeholder before `Advisor.tsx` imports it
- [ ] Confirm pytest config + `TestClient` fixture available (existing infrastructure expected to cover)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| One-click copy of bundle to clipboard from Sync/Advisor page | EXPORT-01 (UI half) | Clipboard API behavior is browser-runtime; not unit-testable | Open `/advisor`, click "Copy advisory brief", paste into editor — verify markdown header has `generated_at` + `session_id` |
| One-click copy of advisor system prompt | PROMPT-01 (UI half) | Same — clipboard runtime | Click "Copy advisor prompt", paste — verify role framing, scope/out-of-scope, `[SCHEMA BLOCK]`, example payload (incl. ≥1 new-task item), `notes` guidance present |

*Bundle content generation (the markdown body) IS automated via the endpoint tests above; only the clipboard-copy UX is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`test_export.py`, `advisorPrompt.ts`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
