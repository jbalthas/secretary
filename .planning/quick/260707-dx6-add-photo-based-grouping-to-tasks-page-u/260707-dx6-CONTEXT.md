# Quick Task 260707-dx6: Add photo-based grouping to Tasks page - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Task Boundary

Add photo-based grouping to the Tasks page: let the user upload a custom photo for each umbrella list / goal (the top-level groupings currently shown as filter chips — "Career", "FLOW", "Grocery", plus goals like "Robotics book"). The photo grid becomes the new default landing view on the Tasks page — replacing today's dense chip-row + flat task list as the entry point. Clicking a tile drills into that group's tasks. The user uploads the photo themselves via a file picker; it's stored on the backend and persists across sessions.

</domain>

<decisions>
## Implementation Decisions

### View mode
- The photo-tile grid REPLACES the current default view (chip row + dense list) as the Tasks page landing state.
- Clicking a tile drills into a filtered view for that group, reusing the existing filter/task-list rendering (chip row, Pending/Completed tabs, sort) that already exists today — just scoped to the selected group, with a way back to the tile grid.

### Tile scope
- One tile per **top-level** group only: each parent list (`parent-list` kind from `taskFilters.ts` — e.g. "Career", "Grocery") and each goal (`goal` kind — e.g. "Robotics book"). Sub-lists (`list` kind, e.g. "next summer work") do NOT get their own tile in the top-level grid.
- After drilling into a top-level tile, sub-lists belonging to that group appear as filter chips within the drilled-in view (existing `list-chip-child` pattern), not as their own photo tiles.
- Tasks with no list/goal assignment (the `priority:*` fallback category in `taskCategory.ts`) still need a landing spot — give them a catch-all tile (e.g. "Other" / "Unsorted") using the existing default icon+gradient treatment, no photo upload needed for it unless trivial to include.

### Upload UX
- Every top-level tile (list or goal) is always-editable: a small edit/camera icon overlay opens a native file picker to set or replace that group's photo at any time — no separate "manage photos" mode.
- Tiles without a photo yet show the existing icon+gradient treatment (from `taskCategory.ts` / `categoryVisual`) as the placeholder background, with the edit affordance overlaid.

### Claude's Discretion
- Exact key used to persist an uploaded photo server-side: the natural choice is a new backend table keyed by the same normalized string key `taskFilters.ts` already computes for `parent-list:*` and `goal:*` filter kinds (goals keyed by `goal:{id}`, lists keyed by `parent-list:{normalized-name}`), so no schema changes to `Task`/`Goal` are needed. Planner should confirm this against the existing `list_name` string-based architecture (no dedicated List entity exists — see `taskCategory.ts` `resolveCategory()` and `taskFilters.ts` `buildTaskFilters()`).
- Image storage mechanism: reuse the existing static-file-serving pattern already established for TTS audio (Phase 6, `TTSClient` + `StaticFiles` mount) rather than inventing a new one.
- Exact grid layout / tile sizing / animation on drill-in vs. drill-out — implementer's discretion, should feel like a natural extension of the existing card-based Tasks page redesign (quick task 260630-j83).
- Whether the "Other"/unsorted catch-all tile is in scope for this pass or deferred — lean toward including it minimally (no photo upload) so no tasks become unreachable, but this is not a hard requirement if it meaningfully expands scope.

</decisions>

<specifics>
## Specific Ideas

No additional specific requirements beyond the decisions above — standard file-picker upload, standard image serving.

</specifics>

<canonical_refs>
## Canonical References

- `frontend/src/lib/taskFilters.ts` — `buildTaskFilters()` / `TaskFilter` — defines the parent-list/list/goal key structure the new photo tiles should key off of.
- `frontend/src/lib/taskCategory.ts` — `resolveCategory()` / `categoryVisual()` — existing icon+gradient fallback treatment to reuse as tile placeholder.
- `frontend/src/pages/Tasks.tsx` — current chip row + filtered list rendering, to be reorganized into tile-grid (default) + drilled-in (existing) states.
- Phase 6 TTS static file serving pattern (`backend/app/routers/tts.py`, `StaticFiles` mount) — precedent for serving uploaded images.
- Quick task `260630-j83` (card-based Tasks page redesign) — visual/interaction precedent for the new grid.

</canonical_refs>
