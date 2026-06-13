---
phase: 02-tasks-agenda
plan: "03"
subsystem: frontend
tags: [react, router, dark-theme, hooks, spa-shell]
dependency_graph:
  requires: [02-01]
  provides: [spa-shell, bottom-nav, useTasks-hook, dark-theme]
  affects: [02-04, 02-05]
tech_stack:
  added: [react-router-dom, lucide-react]
  patterns: [BrowserRouter+Routes, NavLink active state, custom fetch hook with re-fetch]
key_files:
  created:
    - frontend/src/App.tsx
    - frontend/src/components/BottomNav.tsx
    - frontend/src/hooks/useTasks.ts
    - frontend/src/pages/Today.tsx
    - frontend/src/pages/Tasks.tsx
    - frontend/src/styles.css
    - frontend/src/types/task.ts
  modified:
    - frontend/package.json
    - frontend/src/main.tsx
decisions:
  - NavLink style callback used for isActive (no CSS modules — keeps styles co-located per hand-rolled approach)
  - types/task.ts created here since 02-01 ran in parallel and had not yet written it
metrics:
  duration: "~8 min"
  completed: "2026-06-13"
  tasks_completed: 2
  files_changed: 9
---

# Phase 02 Plan 03: SPA Shell — Router, Nav, Theme, useTasks Hook Summary

React SPA shell with BrowserRouter, two-tab bottom nav (Today/Tasks), dark theme CSS variables per UI-SPEC, and a useTasks data hook wired to /api/v1/tasks.

## What Was Built

- `styles.css`: dark theme tokens (`--bg:#0f172a`, `--surface:#1e293b`, `--accent:#6366f1`, etc.), base layout classes, priority badge variants
- `useTasks.ts`: fetch/create/patch/delete operations against `/api/v1/tasks`, re-fetches after every mutation
- `App.tsx`: BrowserRouter + Routes with default redirect `/` → `/today`
- `BottomNav.tsx`: fixed 56px nav bar, NavLink tabs with accent/slate active color toggling
- `Today.tsx` / `Tasks.tsx`: minimal stubs ready for 02-04 and 02-05

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created types/task.ts (expected from 02-01)**
- **Found during:** Task 1
- **Issue:** 02-01 runs in parallel and had not yet created `frontend/src/types/task.ts`; useTasks.ts imports from it
- **Fix:** Created the types file with Task, TaskCreate, AgendaItem interfaces matching the plan's interface spec
- **Files modified:** `frontend/src/types/task.ts`
- **Commit:** d878b71

## Known Stubs

- `Today.tsx`: renders only `<h1>Today</h1>` — intentional; 02-04 fills this
- `Tasks.tsx`: renders only `<h1>Tasks</h1>` — intentional; 02-05 fills this

These stubs are expected by plan design, not errors.

## Self-Check: PASSED
