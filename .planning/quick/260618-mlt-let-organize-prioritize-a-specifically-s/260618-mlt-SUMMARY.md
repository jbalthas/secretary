---
phase: quick-260618-mlt
plan: 01
status: complete
completed: 2026-06-18
files_modified:
  - frontend/src/lib/organizeTaskSort.ts
  - frontend/src/lib/organizeTaskSort.test.ts
  - frontend/src/pages/Organize.tsx
  - frontend/src/styles.css
---

# Quick Task 260618-mlt Summary

Added specific-list prioritization to the Organize task queue.

## Delivered

- A "List first" selector shown when tasks are sorted by list.
- List choices derived from the currently unscheduled tasks.
- Case-insensitive selected-list matching.
- Selected-list tasks placed first while all other tasks remain visible.
- Priority and title ordering preserved within list groups.
- Wrapping task controls for narrow layouts.

## Verification

- `npm.cmd test -- --run src/lib/organizeTaskSort.test.ts` passed (3 tests).
- `npm.cmd run build` passed with Vite 8.0.16.
- Rendered browser QA was not completed because the local dev process failed before binding a port.
