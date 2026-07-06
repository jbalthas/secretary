---
phase: 16-advisory-ingest-sync-review-ui
plan: 04
subsystem: frontend
tags: [react, vite, advisory, diff-ui, idempotency, sync-page]

# Dependency graph
requires:
  - phase: 16-advisory-ingest-sync-review-ui/16-03
    provides: "GET/POST /api/v1/advisory/{schema,preview,confirm,last-sync} HTTP routes"
  - phase: 16-advisory-ingest-sync-review-ui/16-01
    provides: AdvisoryPayload/AdvisoryPreviewResult/AdvisoryResult schemas, Goal.priority_rank
provides:
  - "Extended /advisor Sync page: paste-only advisory review UI appended below the Phase-15 export/prompt/snapshot sections"
  - "useAdvisory hook (preview/confirm against /api/v1/advisory/*, mirrors useIngest)"
  - "lib/advisoryId.ts computeAdvisoryId — canonical-JSON SHA-256 hash for one-shot idempotency"
  - "AdvisoryFieldChange/AdvisoryEntityDiff/AdvisoryPreviewResult/AdvisoryResult frontend types + Goal.priority_rank"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "computeAdvisoryId hashes the FULL pasted reply (before reject-filtering) via crypto.subtle.digest(SHA-256) over recursively-key-sorted JSON — no new dependency"
    - "AdvisoryDiffGroup is a new, richer diff component (checkbox + field-level old->new + always-visible rationale sub-text) distinct from Ingest's shallow DiffGroup, per D-02"
    - "Row identity keyed by group+external_key (goals/new_tasks) or group+'goalKey/title' (milestones, matching the backend's diff external_key shape) to survive re-render without React key collisions across the three groups"
    - "Confirm payload is client-filtered by rebuilding the arrays from the ORIGINAL full pasted payload, keeping only accepted indices/keys — advisory_id itself is always computed over the unfiltered full payload (D-05)"
    - "Manual renderHook harness (createRoot + act, no @testing-library/react) used for useAdvisory.test.ts since RTL is not an existing dependency and CLAUDE.md forbids adding new ones"

key-files:
  created:
    - frontend/src/lib/advisoryId.ts
    - frontend/src/hooks/useAdvisory.ts
    - frontend/src/hooks/useAdvisory.test.ts
  modified:
    - frontend/src/types/goal.ts
    - frontend/src/pages/Advisor.tsx

key-decisions:
  - "No React Testing Library in devDependencies and CLAUDE.md forbids new deps — wrote a minimal renderHook(hook) helper using react-dom/client's createRoot + react-dom/test-utils' act, rendering a throwaway function component that stashes the hook's return value into a mutable ref-like object"
  - "Milestone row identity mirrors the backend's diff external_key format exactly (`${goal_external_key}/${title}`, from advisory_service.dry_run_advisory) rather than inventing a separate frontend key, so accept/reject state and the confirm-time filter both derive from the same string shape"
  - "new_tasks row identity uses the backend's PREVIEW-only external_key (`advisory-PREVIEW-{index}`) since new tasks have no stable key pre-confirm; confirm-time filtering re-derives the same index-based key against the original payload array position rather than any real external_key, since the pasted payload's new_tasks[i].external_key is a different value than the preview diff's synthetic key"
  - "AdvisoryResult.created/updated use the key 'tasks' (not 'new_tasks') per advisory_service.py's apply_advisory — success summary counts read res.created.tasks / res.updated.tasks accordingly"

patterns-established:
  - "Client-computed idempotency hash pattern (computeAdvisoryId) is reusable for any future advisory-like one-shot-apply flow requiring a stable ID independent of user-side filtering"

requirements-completed: [ADVISE-04, ADVISE-06, ADVISE-07, SYNC-01, SYNC-02]

# Metrics
duration: ~40min
completed: 2026-07-06
---

# Phase 16 Plan 04: Advisory Sync Review UI Summary

**Extended the existing /advisor Sync page with a paste-only advisory review loop — grouped Goals/Milestones/New-tasks diff with per-row accept/reject and always-visible rationale, a client-side SHA-256 advisory_id hashed over the full pasted reply for one-shot idempotency, and an in-page (non-navigating) success summary.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-06T21:15:00Z
- **Completed:** 2026-07-06T21:26:00Z
- **Tasks:** 3 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `frontend/src/types/goal.ts` extended with `AdvisoryFieldChange`, `AdvisoryEntityDiff`, `AdvisoryPreviewResult`, `AdvisoryResult`, and `Goal.priority_rank`
- `frontend/src/lib/advisoryId.ts` — `computeAdvisoryId(fullPayload)` recursively sorts object keys, JSON-stringifies, and SHA-256 hashes via `crypto.subtle.digest` (no new dependency)
- `frontend/src/hooks/useAdvisory.ts` — `preview()`/`confirm()` against `/api/v1/advisory/preview` and `/confirm`, mirroring `useIngest.ts`'s `parse422`/state pattern; `confirm()` returns `AdvisoryResult | null`
- `frontend/src/hooks/useAdvisory.test.ts` — 4 tests (preview 200/422, confirm 200/422) using a minimal manual `renderHook` harness built on `react-dom/client` + `react-dom/test-utils` (no React Testing Library dependency added)
- `frontend/src/pages/Advisor.tsx` extended (Phase-15 sections untouched) with: header "Last advisor sync: N days ago" line sourced from `GET /api/v1/advisory/last-sync` (fetched on mount and re-fetched after confirm), a paste textarea + "Run preview" button, a notes accent callout above the diff, a non-blocking staleness banner (>7 days from `generated_at`), a new `AdvisoryDiffGroup` component rendering Goals/Milestones/New-tasks with per-row default-checked checkboxes, field-level `old → new` lines, and rationale always visible as sub-text, a Confirm button that filters the original pasted payload to only accepted rows and posts alongside a full-payload-hashed `advisory_id`, and an in-page success summary with a `<Link to="/goals">` (no `navigate()` call)

## Task Commits

1. **Task 1: advisory types + Goal.priority_rank + computeAdvisoryId** - `1d6a881` (feat)
2. **Task 2: useAdvisory hook + unit test** - `e059d5f` (feat)
3. **Task 3: Advisor.tsx paste/notes/staleness/diff/accept-reject/confirm/success** - `ad5b11a` (feat)

## Files Created/Modified
- `frontend/src/types/goal.ts` - advisory diff/result types + `Goal.priority_rank`
- `frontend/src/lib/advisoryId.ts` - `computeAdvisoryId` (canonical JSON + SHA-256)
- `frontend/src/hooks/useAdvisory.ts` - preview/confirm hook against advisory endpoints
- `frontend/src/hooks/useAdvisory.test.ts` - 4 unit tests via manual renderHook harness
- `frontend/src/pages/Advisor.tsx` - paste/notes/staleness/diff/accept-reject/confirm/success sections appended below Phase-15 sections

## Decisions Made
- Manual `renderHook` test harness (no RTL) — see key-decisions above
- Milestone and new-task row identity keys mirror the backend's diff `external_key` shapes exactly to avoid drift between preview-time and confirm-time filtering
- `AdvisoryResult` success-summary counts read the `tasks` key (not `new_tasks`) to match `advisory_service.apply_advisory`'s actual dict keys

## Deviations from Plan

None — plan executed exactly as written. All locked hard constraints (D-01 through D-11) honored: single linear page (no tabs/stepper), paste-only textarea (no file upload), rationale always visible as sub-text, richer grouped diff (not the shallow Ingest DiffGroup), default-accept per-row checkboxes, advisory_id hashed over the full unfiltered pasted reply, stay-on-page success summary with a `<Link>` (no `navigate()`), notes as a display-only accent callout above the diff, "Last advisor sync" header line, non-blocking staleness banner.

## Issues Encountered

None specific to this plan's files. `cd frontend && npx tsc --noEmit`, `npx vitest run src/hooks/useAdvisory.test.ts`, and `npm run build` all pass cleanly.

## User Setup Required

None — no external service configuration required. Manual golden-path click-through (paste a sample advisory reply → preview → uncheck a row → Confirm → verify stay-on-page summary + replay-on-repaste) requires a running backend with seeded goal data and is deferred to human verification when the app is next run end-to-end; this plan is `autonomous: true` with no `checkpoint:human-verify` task, and all automated verification gates in the plan (`tsc`, `vitest`, `build`) pass.

## Next Phase Readiness
- The full advisory ingest loop (export → paste → preview → accept/reject → confirm) is now wired end-to-end on `/advisor`
- ADVISE-04/06/07 and SYNC-01/02 requirements delivered
- No blockers for Phase 16 completion (this was plan 4 of the phase; check for a possible 16-05 prompt-schema-regen plan)

---
*Phase: 16-advisory-ingest-sync-review-ui*
*Completed: 2026-07-06*

## Self-Check: PASSED

Files verified present:
- frontend/src/types/goal.ts: FOUND
- frontend/src/lib/advisoryId.ts: FOUND
- frontend/src/hooks/useAdvisory.ts: FOUND
- frontend/src/hooks/useAdvisory.test.ts: FOUND
- frontend/src/pages/Advisor.tsx: FOUND

Commits verified present:
- 1d6a881 (Task 1): FOUND
- e059d5f (Task 2): FOUND
- ad5b11a (Task 3): FOUND
