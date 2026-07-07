---
phase: quick-260707-dx6
plan: 01
subsystem: ui
tags: [fastapi, sqlalchemy, alembic, react, tasks-page, image-upload]

requires: []
provides:
  - group_photos backend table + upload/list/image-serving endpoints
  - useGroupPhotos frontend hook
  - GroupTileGrid photo-tile component
  - grid/drill view-mode split on the Tasks page
affects: [tasks-page, goals]

tech-stack:
  added: []
  patterns:
    - "Image bytes stored in-DB (LargeBinary column) and served under /api/v1/... to stay inside the Vite dev proxy's /api-only forwarding, instead of a new StaticFiles mount"
    - "Grid/drill view-mode split on a page component (mode state) reusing all existing filtered-list rendering unchanged in drill mode"

key-files:
  created:
    - backend/app/routers/group_photos.py
    - backend/migrations/versions/0019_add_group_photos.py
    - backend/tests/test_group_photos.py
    - frontend/src/types/groupPhoto.ts
    - frontend/src/hooks/useGroupPhotos.ts
    - frontend/src/components/GroupTileGrid.tsx
  modified:
    - backend/app/models/__init__.py
    - backend/app/main.py
    - frontend/src/pages/Tasks.tsx
    - frontend/src/styles.css

key-decisions:
  - "Group photo key reuses buildTaskFilters() keys verbatim (parent-list:<normalized>, goal:<id>) — no schema change to Task/Goal needed"
  - "Images stored as LargeBinary rows in a new group_photos table, served via GET /api/v1/group-photos/image?key=... — avoids a second static mount and works with the existing /api-only Vite dev proxy"
  - "Unsorted catch-all tile has no upload affordance and uses a fixed neutral gradient (not persisted, not part of taskFilters output)"

patterns-established:
  - "Photo-per-group upload: camera overlay button on a tile triggers a hidden file input; upload is fire-and-await then refresh() the photo map so the img src cache-buster (?t=updated_at) picks up the new bytes"

requirements-completed: [DX6-01]

duration: ~35min
completed: 2026-07-07
---

# Quick Task 260707-dx6: Add photo-based grouping to Tasks page Summary

**Tasks page now opens on a photo-tile grid (one tile per top-level list/goal, backed by a new `group_photos` DB table); clicking a tile drills into the existing filtered task view with a Back control.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 10

## Accomplishments
- New `group_photos` backend table + 3 endpoints (upload/replace, list, image-serve) with in-DB byte storage, TDD'd (5 tests, RED then GREEN)
- `useGroupPhotos` hook + `GroupTileGrid` component: photo-or-gradient-placeholder tiles, per-tile camera/upload overlay, Unsorted catch-all tile
- `Tasks.tsx` reorganized into `grid` (default landing) / `drill` (existing chip+list view, now with a Back control) view modes, with an `unsorted` filter branch for orphan tasks

## Task Commits

1. **Task 1: Backend group_photos table + endpoints** - TDD: `fd69407` (test, RED) → `541433b` (feat, GREEN)
2. **Task 2: Frontend photo hook + GroupTileGrid component** - `2311b80` (feat)
3. **Task 3: Wire grid/drill view modes into Tasks.tsx** - `566b3b3` (feat)

## Files Created/Modified
- `backend/app/models/__init__.py` - added `GroupPhoto` model (group_key unique index, LargeBinary data, updated_at)
- `backend/migrations/versions/0019_add_group_photos.py` - creates `group_photos` table, chains from 0018
- `backend/app/routers/group_photos.py` - POST (upsert by group_key), GET (list, no bytes), GET /image (serve bytes or 404)
- `backend/app/main.py` - registered `group_photos.router`
- `backend/tests/test_group_photos.py` - 5 tests covering create, replace, list-excludes-bytes, image fetch, 404
- `frontend/src/types/groupPhoto.ts` - `GroupPhotoMeta` type
- `frontend/src/hooks/useGroupPhotos.ts` - fetch/upload/imageUrl/hasPhoto
- `frontend/src/components/GroupTileGrid.tsx` - tile grid built from `buildTaskFilters()`, camera upload overlay, Unsorted tile
- `frontend/src/pages/Tasks.tsx` - `mode`/`unsorted` state, grid landing view, drill view with Back control
- `frontend/src/styles.css` - `.group-tile-grid`, `.group-tile*`, `.tasks-back-button`

## Decisions Made
- Reused `buildTaskFilters()` keys (`parent-list:*`, `goal:*`) directly as the photo table's `group_key` — no new columns on `Task`/`Goal`.
- Images stored in-DB (LargeBinary) and served under `/api/v1/group-photos/image`, not a `StaticFiles` mount — keeps the dev proxy (which only forwards `/api`) working with zero config changes.
- Tile placeholder visuals reuse `categoryVisual(filter.label.toLowerCase())` for both parent-list and goal tiles, per plan interface spec.

## Deviations from Plan

None — plan executed exactly as written across all 3 tasks.

## Known Stubs

None. The Unsorted tile intentionally has no photo-upload affordance (by design, not a stub — see CONTEXT.md decisions).

## Verification

- Backend: `pytest tests/test_group_photos.py -x -q` → 5/5 passed. Full backend suite: 199 passed, 4 pre-existing unrelated failures + 1 pre-existing error (test_brief.py, test_calendar.py, test_plan.py, test_weekly_brief.py — confirmed pre-existing per Phase 16-01/16-03 SUMMARY notes, untouched by this task).
- `alembic upgrade head` applied 0019 cleanly on top of 0018.
- Frontend: `npm run build` (tsc + vite) passed. `npm test -- --run`: 62/64 passed; 2 pre-existing failures in `src/lib/agenda.test.ts` (untouched file, confirmed via `git diff` — logged to `deferred-items.md`, out of scope).
- Manual smoke test: started uvicorn on port 8123, exercised POST/GET/GET-image group-photos endpoints end-to-end (create → 200, image fetch → 200 with correct bytes), then stopped the server and removed the throwaway dev DB.

## Self-Check: PASSED

- `backend/app/routers/group_photos.py` — FOUND
- `backend/migrations/versions/0019_add_group_photos.py` — FOUND
- `backend/tests/test_group_photos.py` — FOUND
- `frontend/src/types/groupPhoto.ts` — FOUND
- `frontend/src/hooks/useGroupPhotos.ts` — FOUND
- `frontend/src/components/GroupTileGrid.tsx` — FOUND
- Commit `fd69407` — FOUND
- Commit `541433b` — FOUND
- Commit `2311b80` — FOUND
- Commit `566b3b3` — FOUND
