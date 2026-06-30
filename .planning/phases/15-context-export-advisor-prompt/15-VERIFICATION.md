---
phase: 15-context-export-advisor-prompt
verified: 2026-06-29T00:00:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 15: Context Export + Advisor Prompt Verification Report

**Phase Goal:** User can copy a complete, token-budgeted LLM advisory brief and a documented advisor system prompt in one action from the Sync page, enabling the outbound half of the advisory loop without waiting for Phase 16.
**Verified:** 2026-06-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                      | Status     | Evidence                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | GET /export/bundle returns 200 with {markdown, session_id, generated_at}; starts "# Advisor Brief" | ✓ VERIFIED | `export_service.build_export_bundle` returns all 3 keys (line 236); `_assemble` first line is `# Advisor Brief` (line 178); endpoint live; user-confirmed in-browser |
| 2   | Bundle lists each active goal: title, type, target+days, live progress, milestones, top-3 tasks, overdue | ✓ VERIFIED | `_render_goal_section` (lines 41-101): title/type, days_remaining, `_compute_progress_sync` live (D-03), milestones, sorted top-3 active tasks, overdue count |
| 3   | Bundle has 14-day block summary, 7-day per-day calendar count (no titles), trend+velocity, stalled list | ✓ VERIFIED | `_render_block_summary` (Planned/Completed/Slipped), `_render_calendar_load` (counts only, title never read), per-goal trend + `_velocity_label`, `_render_stalled` |
| 4   | Career/learning goals rendered before other goal types                                    | ✓ VERIFIED | `build_export_bundle` sort key uses `g.type.value not in PRIORITY_TYPES` as primary (lines 207-214); `test_goal_ordering` green |
| 5   | No anthropic/openai/litellm import anywhere in backend/app/                                | ✓ VERIFIED | Grep across backend/app returns zero matches; `test_no_llm_imports` passes (CI guard) |
| 6   | /advisor renders 4-section Sync page (copy-prompt, copy-brief, snapshot, preview)          | ✓ VERIFIED | `Advisor.tsx` has all 4 sections (lines 38-99); user-confirmed in-browser |
| 7   | Copy buttons / snapshot wired to backend; Sync nav entry + route resolve                  | ✓ VERIFIED | `useExport.ts` fetches `/export/bundle` + POSTs `/export/snapshot`; `App.tsx` route `/advisor`; `BottomNav.tsx` Sync tab w/ Bot icon |
| 8   | advisorPrompt.ts exports ADVISOR_PROMPT with all 8 PROMPT-01 sections + [SCHEMA BLOCK]     | ✓ VERIFIED | All 8 sections present in order; `[SCHEMA BLOCK]` on own line (37); new-task example, session_id echo, notes guidance present |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                | Expected                                   | Status     | Details                                                                 |
| --------------------------------------- | ------------------------------------------ | ---------- | ---------------------------------------------------------------------- |
| `backend/tests/test_export.py`          | 8 contract tests + no-LLM guard            | ✓ VERIFIED | 8 export tests pass (RED→GREEN target met)                            |
| `frontend/src/lib/advisorPrompt.ts`     | ADVISOR_PROMPT + [SCHEMA BLOCK]            | ✓ VERIFIED | 8 sections, placeholder, new-task example                             |
| `backend/app/services/export_service.py`| build_export_bundle + _velocity_label      | ✓ VERIFIED | 237 lines, sync-only, all 6 EXPORT sections, no LLM imports           |
| `backend/app/schemas/export.py`         | BundleResponse model                       | ✓ VERIFIED | BundleResponse(markdown, session_id, generated_at); SnapshotResponse intact |
| `backend/app/routers/export.py`         | GET /bundle endpoint (sync)                | ✓ VERIFIED | `get_export_bundle` sync def; snapshot route intact                   |
| `frontend/src/hooks/useExport.ts`       | fetchBundle + triggerSnapshot              | ✓ VERIFIED | Both calls present, loading/error/snapshotting state                  |
| `frontend/src/pages/Advisor.tsx`        | Sync page shell (4 sections)               | ✓ VERIFIED | All 4 sections wired to hook + ADVISOR_PROMPT                         |
| `frontend/src/App.tsx`                  | /advisor route                             | ✓ VERIFIED | Import + Route present                                                |
| `frontend/src/components/BottomNav.tsx` | Sync nav entry                             | ✓ VERIFIED | Bot icon + NavLink to /advisor "Sync"                                 |

### Key Link Verification

| From                  | To                                  | Via                    | Status   | Details                                          |
| --------------------- | ----------------------------------- | ---------------------- | -------- | ------------------------------------------------ |
| routers/export.py     | export_service.build_export_bundle  | sync endpoint call     | ✓ WIRED  | `BundleResponse(**export_service.build_export_bundle())` |
| export_service.py     | brief._compute_progress_sync        | live progress (D-03)   | ✓ WIRED  | Imported + called per goal (line 46)             |
| export_service.py     | guidance_service._find_stalled_goals| stalled list, open session | ✓ WIRED | Called with open session (line 169)              |
| useExport.ts          | /api/v1/export/bundle               | fetch GET              | ✓ WIRED  | Response parsed, markdown returned               |
| useExport.ts          | /api/v1/export/snapshot             | fetch POST             | ✓ WIRED  | method: "POST", result returned                  |
| Advisor.tsx           | lib/advisorPrompt.ts                | import ADVISOR_PROMPT  | ✓ WIRED  | Imported + copied + rendered                     |

### Data-Flow Trace (Level 4)

| Artifact          | Data Variable          | Source                              | Produces Real Data | Status     |
| ----------------- | ---------------------- | ----------------------------------- | ------------------ | ---------- |
| Advisor.tsx       | ex.bundle              | fetchBundle → GET /export/bundle    | Yes (live DB query)| ✓ FLOWING  |
| export_service.py | goal_sections          | select(Goal) active + ORM relations | Yes                | ✓ FLOWING  |
| export_service.py | block/calendar/stalled | ScheduledBlock/CalendarEvent/_find_stalled_goals | Yes   | ✓ FLOWING  |

Empty-state strings (`no_data` trend, `- none` stalled, zero calendar counts) are intentional graceful degradation, not stubs.

### Behavioral Spot-Checks

| Behavior                          | Command                                              | Result          | Status |
| --------------------------------- | --------------------------------------------------- | --------------- | ------ |
| Export + snapshot test suites     | `pytest tests/test_export.py tests/test_snapshots.py -q` | 14 passed   | ✓ PASS |
| No-LLM CI guard                   | `pytest tests/test_export.py::test_no_llm_imports`  | 1 passed        | ✓ PASS |
| No new migration (stateless D-11) | migrations HEAD check                                | HEAD 0017       | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan      | Description                                            | Status      | Evidence                                                       |
| ----------- | ---------------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| EXPORT-01   | 15-01,15-02,15-03| Copy complete brief w/ generated_at + session_id      | ✓ SATISFIED | Endpoint + header line + Copy advisory brief button           |
| EXPORT-02   | 15-01,15-02      | Goal section: title/type/target/progress/milestones/tasks/overdue | ✓ SATISFIED | `_render_goal_section`; test_bundle_contains_goal_section green |
| EXPORT-03   | 15-01,15-02      | 14-day planned/completed/slipped block summary        | ✓ SATISFIED | `_render_block_summary`; test_block_summary green              |
| EXPORT-04   | 15-01,15-02      | Per-goal trend + velocity label, graceful no_data     | ✓ SATISFIED | trend render + `_velocity_label`; test_trend_no_data green     |
| EXPORT-05   | 15-01,15-02      | 7-day calendar counts only (no titles) + stalled list | ✓ SATISFIED | `_render_calendar_load` counts only; test_calendar_section_privacy green; D-05 confirmed in-browser |
| EXPORT-06   | 15-01,15-02      | Career/learning goals ordered first                   | ✓ SATISFIED | sort key; test_goal_ordering green                            |
| PROMPT-01   | 15-01,15-03      | Documented advisor prompt, one-click copy             | ✓ SATISFIED | advisorPrompt.ts 8 sections; copy button wired ([SCHEMA BLOCK] is intentional Phase-16 deferral) |

No orphaned requirements. EXPORT-05's REQUIREMENTS.md wording references `get_stalled_goals()`; implementation correctly uses the internal `_find_stalled_goals(session)` on the open session to avoid a second-session DetachedInstanceError — a deliberate refinement of the same behavior, not a gap.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder in production code paths. The single `[SCHEMA BLOCK]` literal in advisorPrompt.ts is a documented, intentional Phase-16 deferral (one-line swap to `AdvisoryPayload.model_json_schema()`), explicitly excluded from gap-flagging.

### Human Verification Required

None outstanding. The 15-03 plan's blocking human-verify checkpoint has already been satisfied: the user confirmed the full in-browser round-trip (brief header with generated_at + session_id, career/learning-first goals, 14-day block summary, 7-day per-day counts with no event titles, trend/velocity, stalled goals, prompt copy, snapshot 6-created/0-skipped, Sync tab).

### Gaps Summary

No gaps. All 8 must-have truths verified, all 9 artifacts exist and are substantive and wired, all 6 key links connected, data flows from live DB queries, all 7 requirement IDs satisfied. Backend suite (14 export+snapshot tests) green, no-LLM guard passes, stateless constraint held (migration HEAD unchanged at 0017). The phase goal — one-action copy of a token-budgeted advisory brief plus a documented advisor prompt from the Sync page — is achieved. AdvisoryPayload correctly does not yet exist, preserving the clean Phase-16 boundary.

---

_Verified: 2026-06-29_
_Verifier: Claude (gsd-verifier)_
