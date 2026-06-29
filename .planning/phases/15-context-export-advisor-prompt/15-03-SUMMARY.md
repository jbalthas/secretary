---
phase: 15-context-export-advisor-prompt
plan: 03
subsystem: frontend-sync-page
tags: [export, advisor-prompt, sync-ui, react, clipboard]
requires:
  - 15-01 (advisorPrompt.ts ADVISOR_PROMPT with [SCHEMA BLOCK] placeholder)
  - 15-02 (GET /api/v1/export/bundle, POST /api/v1/export/snapshot live)
provides:
  - frontend/src/hooks/useExport.ts (fetchBundle + triggerSnapshot)
  - frontend/src/pages/Advisor.tsx (the /advisor Sync page shell Phase 16 extends)
  - /advisor route + Sync bottom-nav entry
affects:
  - Phase 16 (advisory ingest / sync review UI builds on this page: paste reply, diff, confirm)
tech-stack:
  added: []
  patterns:
    - "useExport mirrors useIngest state shape (loading/error, try/catch/finally, parse on res.ok)"
    - "fetchBundle returns markdown so the page does fetch-then-copy in one click"
    - "Clipboard copy via navigator.clipboard.writeText + 2s 'Copied!' flag (Ingest.tsx pattern)"
    - "Inline-style page conventions reused from Ingest.tsx; existing styles.css classes (.page, .page-title, .section-label, .btn-text-accent, .btn-save, .prompt-block)"
key-files:
  created:
    - frontend/src/hooks/useExport.ts
    - frontend/src/pages/Advisor.tsx
  modified:
    - frontend/src/App.tsx
    - frontend/src/components/BottomNav.tsx
decisions:
  - "[15-03] Bot icon (lucide-react) for the Sync tab; added as 6th nav tab before Settings — first nav addition (the /ingest route is intentionally NOT in BottomNav)"
  - "[15-03] Both backend endpoints already existed from 15-02 (POST /snapshot + GET /bundle, matching contract); no backend changes needed — wired hook directly"
  - "[15-03] Snapshot confirmation surfaces created + skipped counts ('Snapshot saved (N created, M skipped).')"
metrics:
  duration: "~5 min"
  completed: 2026-06-29
  tasks: "2 of 3 (Task 3 is a human-verify checkpoint — paused)"
  files: 4
---

# Phase 15 Plan 03: /advisor Sync Page Summary

One-liner: Built the `/advisor` Sync page — one-click copy of the advisor system prompt (PROMPT-01) and the export bundle (EXPORT-01 UI half), an on-demand snapshot trigger (the Phase 14 deferral), and a read-only rendered-brief preview — wired to the live `GET /bundle` + `POST /snapshot` endpoints via a new `useExport` hook.

## What Was Built

### Task 1 — useExport.ts hook (commit 8c050d0)
`frontend/src/hooks/useExport.ts`, mirroring `useIngest.ts` state shape:
- `fetchBundle()` GETs `/api/v1/export/bundle`, stores `bundle`/`sessionId`/`generatedAt`, and returns the markdown so the page can fetch-then-copy in one click.
- `triggerSnapshot()` POSTs `/api/v1/export/snapshot`, returns `{created, skipped}`.
- `loading` / `snapshotting` / `error` flags; try/catch/finally on each call.

### Task 2 — Advisor.tsx page + route + nav (commit fd372d1)
`frontend/src/pages/Advisor.tsx` (default export `Advisor`), four sections per D-09:
1. **Advisor prompt** — `Copy advisor prompt` (`btn-text-accent`) copies `ADVISOR_PROMPT`; 2s "Copied!"; full prompt rendered in a `.prompt-block`.
2. **Advisory brief** — `Copy advisory brief` (`btn-save`) does `fetchBundle()` then copies the markdown; disabled + "Loading…" while `ex.loading`; `ex.error` shown in `var(--destructive)`.
3. **Preview** — when `ex.bundle` is set, renders it read-only in a `.prompt-block` with `generated_at` + `session_id` shown above.
4. **Snapshot** — `Take snapshot now` calls `triggerSnapshot()`; disabled while `ex.snapshotting`; on success shows "Snapshot saved (N created, M skipped)".

`App.tsx`: added `import Advisor` and `<Route path="/advisor" element={<Advisor />} />` (all existing routes kept).
`BottomNav.tsx`: added `Bot` to the lucide-react import and a 6th `NavLink to="/advisor"` (label "Sync") before Settings.

## Deviations from Plan

None for Rules 1-3 in the code itself. One plan-assumption resolved: the plan flagged that `POST /api/v1/export/snapshot` might not exist and to follow its guidance if so — verified before wiring that **both** `/snapshot` and `/bundle` were already implemented in 15-02 (`backend/app/routers/export.py`, contract matches exactly), so the hook was wired directly with no backend work.

## Verification

- Task 1: `cd frontend && npx tsc --noEmit -p tsconfig.json` → exit 0
- Task 2: `cd frontend && npx tsc --noEmit -p tsconfig.json && npm run build` → exit 0 (vite build clean, 1795 modules)

## Checkpoint Status

**PAUSED at Task 3 (checkpoint:human-verify, gate=blocking).** This plan is non-autonomous: clipboard copy and the full backend→clipboard round-trip are browser-runtime behaviors that require manual verification per 15-VALIDATION.md. Tasks 1-2 are complete and committed. Human verification is required before the phase can be marked done — see the checkpoint instructions returned to the orchestrator (start stack, copy brief/prompt, run snapshot, confirm calendar counts-only privacy, confirm 6-tab nav at 320px).

## Self-Check: PASSED

- FOUND: frontend/src/hooks/useExport.ts
- FOUND: frontend/src/pages/Advisor.tsx
- FOUND: frontend/src/App.tsx
- FOUND: frontend/src/components/BottomNav.tsx
- FOUND commit 8c050d0 (Task 1)
- FOUND commit fd372d1 (Task 2)
