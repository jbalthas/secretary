---
phase: 8
slug: goals-ingest-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio (sync `TestClient`, matching `test_tasks.py`/`test_routines.py`) |
| **Config file** | none — `pyproject.toml` has no `[tool.pytest]` section; run from `backend/` |
| **Quick run command** | `cd backend && uv run pytest tests/test_goals.py tests/test_ingest.py -x` |
| **Full suite command** | `cd backend && uv run pytest` |
| **Estimated runtime** | ~30 seconds |

**Note:** New `Goal`/`Milestone` models must be imported in `models/__init__.py` so `Base.metadata.create_all` (in `conftest.py`) registers them for the test DB.

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/test_goals.py tests/test_ingest.py -x`
- **After every plan wave:** Run `cd backend && uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. Mapped here at requirement granularity; the planner binds each row to a concrete task ID.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| GOAL-01 | Create goal (title/type/description/target_date); PATCH archive (status=archived) | integration | `pytest tests/test_goals.py::test_create_goal tests/test_goals.py::test_archive_goal -x` | ❌ W0 | ⬜ pending |
| GOAL-01 | GET goals list returns archived goals (no hard delete) | integration | `pytest tests/test_goals.py::test_no_hard_delete -x` | ❌ W0 | ⬜ pending |
| GOAL-02 | Progress % from completed/total linked tasks | unit | `pytest tests/test_goals.py::test_progress_tasks_only -x` | ❌ W0 | ⬜ pending |
| GOAL-02 | Progress is 0% with no tasks/milestones (no divide-by-zero) | unit | `pytest tests/test_goals.py::test_progress_no_items -x` | ❌ W0 | ⬜ pending |
| GOAL-03 | Done milestones count in unified ratio numerator | unit | `pytest tests/test_goals.py::test_progress_milestones_count -x` | ❌ W0 | ⬜ pending |
| GOAL-03 | Milestone CRUD — create, read, update done=True | integration | `pytest tests/test_goals.py::test_milestone_crud -x` | ❌ W0 | ⬜ pending |
| GOAL-06 | Milestone done False→True fires Pushover + TTS | unit (monkeypatch) | `pytest tests/test_goals.py::test_milestone_celebration -x` | ❌ W0 | ⬜ pending |
| GOAL-06 | Goal status→completed fires celebration | unit (monkeypatch) | `pytest tests/test_goals.py::test_goal_completion_celebration -x` | ❌ W0 | ⬜ pending |
| GOAL-06 | No celebration when done already True (idempotent) | unit | `pytest tests/test_goals.py::test_no_double_celebration -x` | ❌ W0 | ⬜ pending |
| INGEST-01 | GET /ingest/schema returns schema_version/properties/required | integration | `pytest tests/test_ingest.py::test_schema_endpoint -x` | ❌ W0 | ⬜ pending |
| INGEST-02 | Wrong schema_version → 422 | integration | `pytest tests/test_ingest.py::test_schema_version_mismatch -x` | ❌ W0 | ⬜ pending |
| INGEST-02 | Extra field in payload → 422 field-level error | integration | `pytest tests/test_ingest.py::test_extra_field_rejected -x` | ❌ W0 | ⬜ pending |
| INGEST-02 | Invalid cron in habit → 422 | integration | `pytest tests/test_ingest.py::test_invalid_cron_rejected -x` | ❌ W0 | ⬜ pending |
| INGEST-04 | confirm writes goals→tasks→routines→habits in one transaction | integration | `pytest tests/test_ingest.py::test_confirm_writes_all -x` | ❌ W0 | ⬜ pending |
| INGEST-04 | Injected mid-commit failure leaves zero new rows | integration (monkeypatch) | `pytest tests/test_ingest.py::test_rollback_on_mid_commit_failure -x` | ❌ W0 | ⬜ pending |
| INGEST-06 | Re-posting same payload creates no duplicates (external_key match) | integration | `pytest tests/test_ingest.py::test_idempotent_reimport -x` | ❌ W0 | ⬜ pending |
| INGEST-06 | Re-import preserves user-edited `completed` field | integration | `pytest tests/test_ingest.py::test_preserves_completed_on_reimport -x` | ❌ W0 | ⬜ pending |
| INGEST-07 | habits array creates Task rows with is_habit=True + recurrence_cron | integration | `pytest tests/test_ingest.py::test_habits_created -x` | ❌ W0 | ⬜ pending |
| INGEST-07 | Habit linked to goal_key resolves goal_id on Task | integration | `pytest tests/test_ingest.py::test_habit_goal_linkage -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_goals.py` — stubs for GOAL-01, GOAL-02, GOAL-03, GOAL-06
- [ ] `backend/tests/test_ingest.py` — stubs for INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07

Existing `conftest.py` (`TestClient` + `create_test_db` fixture, `Base.metadata.create_all`) covers fixtures — no new framework or fixture work needed once Goal/Milestone models are imported in `models/__init__.py`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pushover push + Google Home TTS actually reach the device | GOAL-06 | Requires live Pushover token + Chromecast on LAN; automated tests monkeypatch the clients | Complete a milestone via API on the Pi; confirm phone push + spoken announcement |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
