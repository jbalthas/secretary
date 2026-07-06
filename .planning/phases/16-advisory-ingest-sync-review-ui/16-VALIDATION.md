---
phase: 16
slug: advisory-ingest-sync-review-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-30
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `16-RESEARCH.md` "## Validation Architecture". Framework rows are
> **inferred** (pytest+pytest-asyncio backend, Vitest frontend) and MUST be
> confirmed in Wave 0 before relying on them.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio (backend) · Vitest (frontend) — **Wave 0 must confirm** |
| **Config file** | `backend/pyproject.toml` / `frontend/package.json` — Wave 0 to locate |
| **Quick run command** | `cd backend; pytest tests/test_advisory_service.py -x` (after W0 creates it) |
| **Full suite command** | `cd backend; pytest` and `cd frontend; npm test` |
| **Estimated runtime** | ~TBD (Wave 0) |

---

## Sampling Rate

- **After every task commit:** Run the targeted unit test for the schema/service function just written
- **After every plan wave:** Run the full backend suite + the atomic-rollback and idempotent-replay integration tests
- **Before `/gsd:verify-work`:** Full suite green + CI grep guard (`grep -r "anthropic\|openai\|litellm" backend/app/` → zero) green
- **Max feedback latency:** TBD (Wave 0)

---

## Per-Task Verification Map

Requirement → behavior → test type (task IDs assigned by planner; this is the behavior contract the plans must satisfy).

| Criterion / Req | Behavior to prove | Test Type | Notes |
|-----------------|-------------------|-----------|-------|
| Criterion 1 / ADVISE-01 | Missing `rationale` on any adjustment/creation → ValidationError/422 | unit | Pydantic: construct without `rationale`, assert raises |
| Criterion 1 / ADVISE-01 | Forbidden ops impossible (no goal create; no goal status/title/type change; `TaskCreation` has no `id`/match field; `extra="forbid"`) | unit | Schema introspection + construct-with-forbidden-key asserts raise |
| Criterion 1 / ADVISE-02 | Unknown goal `external_key` → 422 at preview/confirm | integration | Seeded DB, POST referencing absent key, assert 422 (service-layer, DB-aware) |
| Criterion 1 / ADVISE-02 | Preview makes **zero** DB writes | integration | Row counts before/after preview unchanged; real test session, not mock |
| Criterion 2 / ADVISE-05 | DB error mid-apply → zero rows persisted | integration | Force IntegrityError partway through multi-item payload; assert full rollback via `async with session.begin():` — **highest-value test** |
| Criterion 3 / ADVISE-08 | Re-confirm same `advisory_id` → original result, no dupes | integration | Confirm twice; assert identical result + unchanged row counts + single `AdvisoryLog` row |
| Backward-compat (roadmap gate) | Existing `payload_type="standard"`/`schema_version 1.x` payloads still validate; omitted `payload_type` defaults to `"standard"` | unit + regression | Reuse a pre-Phase-16 `IngestPayload` fixture |
| Criterion 4 / ADVISE-06 | `notes` never written to any goal/milestone/task | unit/integration | After confirm, assert no entity column holds notes text; static grep of apply fn body |
| Criterion 4 | Adjusted `priority_rank` + new tasks visible in Goals view after confirm | integration/manual | Requires `goals.priority_rank` (migration 0018) wired through to `frontend/src/types/goal.ts` + Goals page |
| Criterion 5 / SYNC-02 | `session_id` older than 7 days → non-blocking banner, Confirm stays enabled | frontend component (Vitest/RTL) or manual | Depends on staleness-computation resolution (Open Q2) |
| CI grep guard | `grep -r "anthropic\|openai\|litellm" backend/app/` → zero | shell/CI | Add CI step; optional redundant pytest shelling out to grep |

---

## Wave 0 Requirements

- [ ] Confirm backend test framework: `ls backend/tests`, check `backend/pyproject.toml`/`requirements*.txt` for `pytest`/`pytest-asyncio`
- [ ] Confirm frontend test framework: `frontend/package.json` "test" script + Vitest devDependency
- [ ] `backend/tests/test_advisory_service.py` (or sibling to existing `ingest_service` tests) — stubs for criteria 1–4
- [ ] Shared fixture/factory: seed a Goal with `external_key` + Milestones, reusable across preview/apply/idempotency tests (`conftest.py`)
- [ ] Locate CI config (`.github/workflows/*.yml`) for the grep guard step, or confirm none exists and create

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diff layout: rationale always visible as sub-text under each row, grouped Goals/Milestones/New tasks | ADVISE-04 (D-01/D-02) | Visual layout assertion | Paste a multi-entity advisory reply; confirm each row shows entity·field·old→new and rationale beneath, grouped into the three sections |
| Notes callout renders above diff, accent style | ADVISE-06 (D-09) | Visual | After preview, notes appears as distinct callout above diff rows |
| Stay-on-page success summary + link to /goals (no auto-nav) | SYNC-01 (D-08) | Visual/flow | After Confirm, page stays on Sync, shows "N goals · M milestones · K tasks" summary + Goals link |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test framework, CI config, fixtures)
- [ ] No watch-mode flags
- [ ] Feedback latency target set (Wave 0)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
