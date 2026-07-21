---
phase: quick-260721-b6t
plan: 01
subsystem: ui
tags: [react, vitest, ingest, tasks]

requires: []
provides:
  - "tasksPrompt.ts: TASKS_PROMPT constant + normalizeTasksInput pure function + slugKey helper"
  - "QuickAddTasks.tsx: tasks-only paste page at /ingest/tasks reusing useIngest()"
  - "Entry points from Goals header and Tasks grid header to /ingest/tasks"
affects: [ingest, tasks, goals]

tech-stack:
  added: []
  patterns:
    - "Tasks-only ingest variant mirrors Ingest.tsx structurally (DiffGroup copied verbatim, no shared extraction)"
    - "Client-side deterministic external_key generation (djb2 hash) for LLM-pasted entities lacking one"

key-files:
  created:
    - frontend/src/lib/tasksPrompt.ts
    - frontend/src/lib/tasksPrompt.test.ts
    - frontend/src/pages/QuickAddTasks.tsx
  modified:
    - frontend/src/App.tsx
    - frontend/src/pages/Goals.tsx
    - frontend/src/pages/Tasks.tsx

key-decisions:
  - "slugKey uses djb2 32-bit hash (base36, ~6-7 chars) of the trimmed original title as collision-resistant suffix, not crypto.subtle (async) or Date.now()/Math.random() (non-deterministic)"
  - "normalizeTasksInput allowlists exactly the 7 optional TaskImport fields plus title; unknown keys silently dropped since backend uses extra=\"forbid\""
  - "QuickAddTasks stores the normalized payload in state and reuses it verbatim on Confirm (never re-parses the textarea) to prevent preview/confirm drift"

patterns-established:
  - "Tasks-only ingest variant mirrors Ingest.tsx structurally (DiffGroup copied verbatim, no shared extraction) — per plan's explicit no-refactor instruction"

requirements-completed: [QUICKADD-01]

duration: 12min
completed: 2026-07-21
---

# Phase quick-260721-b6t: Tasks-only paste LLM output quick-add flow Summary

**Tasks-only "paste LLM output" quick-add page at `/ingest/tasks` — short 18-line prompt, tolerant normalizer with stable client-generated `external_key`s, reusing `useIngest()` for preview/confirm.**

## Performance

- **Duration:** ~12 min (08:07–08:19 local)
- **Started:** 2026-07-21T08:07:00-05:00
- **Completed:** 2026-07-21T08:19:00-05:00
- **Tasks:** 3 of 3 (Task 3 golden-path checkpoint run by orchestrator — see below)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `tasksPrompt.ts`: short tasks-only prompt (no goals/routines/habits/external_key/schema_version), `slugKey()` (deterministic djb2-hashed slug), `normalizeTasksInput()` (tolerant fence-stripping, array/object shape acceptance, allowlist filtering, never throws)
- 23 unit tests covering fence stripping, array/object shapes, key stability/uniqueness, explicit-key preservation, field passthrough, unknown-key dropping, and 8 distinct error paths
- `QuickAddTasks.tsx`: paste-only page (no file upload) mirroring `Ingest.tsx` conventions, tasks-only preview/confirm via `useIngest()`, zero `fetch()` calls
- Entry points wired: `/ingest/tasks` route in `App.tsx`, "Tasks" link in Goals header, "Import" link in Tasks grid header

## Task Commits

1. **Task 1 (RED): failing test for tasksPrompt** - `30f845f` (test)
2. **Task 1 (GREEN): tasksPrompt.ts implementation** - `7998656` (feat)
3. **Task 2: QuickAddTasks page + route + entry points** - `af8075c` (feat)

_No plan-metadata commit yet — pending this SUMMARY (final commit follows)._

## Files Created/Modified
- `frontend/src/lib/tasksPrompt.ts` - `TASKS_PROMPT`, `slugKey`, `normalizeTasksInput`
- `frontend/src/lib/tasksPrompt.test.ts` - 23 unit tests
- `frontend/src/pages/QuickAddTasks.tsx` - tasks-only paste/preview/confirm page
- `frontend/src/App.tsx` - added `/ingest/tasks` route
- `frontend/src/pages/Goals.tsx` - added "Tasks" entry-point button beside existing "Import"
- `frontend/src/pages/Tasks.tsx` - added "Import" entry-point button to grid-mode header only

## Decisions Made
- djb2 32-bit hash (not FNV-1a) for the slug suffix — simpler, same collision-resistance guarantee for this use case
- Optional fields omitted (not sent as `null`) when absent, matching plan's "omit rather than send nulls" instruction
- No CSS changes — reused existing `.tasks-header` flex layout as-is; three-element header (title + Import button + MomentumRing) fit without adjustment (see Task 3 notes below on why this still needs a human look)

## Deviations from Plan

None on the plan's own scope. One out-of-scope pre-existing issue was found and logged (not fixed, per scope-boundary rule):

- `frontend/src/lib/agenda.test.ts` has 2 pre-existing failing tests (timezone-dependent: expected "15:00", got "10:00"; task-ordering assertion also off). Not touched by this plan — `agenda.ts`/`agenda.test.ts` are outside the plan's file list and were last modified by unrelated prior quick tasks. Confirmed present independent of these changes. Logged to `.planning/quick/260721-b6t-tasks-only-paste-llm-output-quick-add-fl/deferred-items.md`.

**Total deviations:** 0 auto-fixed. 1 out-of-scope item logged and deferred.
**Impact on plan:** None — all in-scope verification passed.

## Issues Encountered
None.

## Automated Verification (Tasks 1–2)

- `npx tsc -b --force` → exit 0 (no `any`, no unused imports)
- `npm test -- --run` → 121/123 passed; the 2 failures are the pre-existing unrelated `agenda.test.ts` failures above; `tasksPrompt.test.ts` itself: 23/23 passed
- `npm run build` (`tsc -b && vite build`) → succeeded, `dist/` output produced cleanly
- `git status --short backend/` → empty (frontend-only constraint respected)
- `git diff --stat frontend/package.json` → empty (no new dependencies)
- `grep -n "fetch(" frontend/src/pages/QuickAddTasks.tsx` → 0 matches
- `grep` confirms both `useIngest()` and `normalizeTasksInput` are referenced in `QuickAddTasks.tsx`

## Task 3: Golden-Path Verification — PERFORMED (orchestrator, browser preview)

The executor had no browser tooling; the orchestrator ran the checkpoint afterwards against the live stack (backend :8000 + frontend :5173).

| # | Step | Result |
|---|------|--------|
| 1 | Stack running | ✅ both servers already up |
| 2 | `/tasks` → "Import" button in grid header → `/ingest/tasks` | ✅ button present, header not cramped, navigates correctly |
| 3 | "Copy prompt" flips to "Copied!" | ⚠️ **not verifiable in sandbox** — `navigator.clipboard.writeText` rejects with `NotAllowedError` in the automation browser (no user-activation grant). Identical `handleCopy` pattern to the shipped `Ingest.tsx`, so not a regression. Prompt text itself confirmed correct: mentions only title/priority/due_date/description/estimated_minutes; no goals/routines/habits/external_key/schema_version. |
| 4 | Fenced array + a stray `notes` key → Run Preview | ✅ "Preview · 2 tasks", both `create`. Fences stripped; unknown key dropped by the allowlist rather than 422-ing |
| 5 | Confirm Import | ✅ navigated to `/tasks`, both tasks visible |
| 6 | Re-paste as `{"tasks":[…]}`, no fences | ✅ both rows `update`, no duplicates — generated `external_key`s are stable across shapes |
| 7 | Prose paste (`Sure! Here are your tasks: 1. buy milk…`) | ✅ friendly error "Couldn't read that as JSON — paste just the JSON output from the LLM.", no crash |
| 8 | `/goals` "Tasks" link beside "Import" | ✅ confirmed in source (`Goals.tsx:301` → `/ingest/tasks`); browser tab hung before the visual check, and the link is static markup |

Console error check after the full run: **no errors**.

Test data created during the walkthrough (task ids 5, 6 — "Golden path smoke task alpha/beta") was deleted from the live DB afterwards; `DELETE /api/v1/tasks/{id}` → 204, zero smoke tasks remaining.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- All code, tests, typecheck, and production build are green.
- Golden path verified end to end. Only open item is the clipboard "Copied!" affordance (step 3), unverifiable under automation — worth an eyeball next time you're on the page in a real browser.

---
*Phase: quick-260721-b6t*
*Completed: 2026-07-21 (all 3 tasks; step 3 of the checkpoint sandbox-limited)*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commits (30f845f, 7998656, af8075c) verified present in git log.
