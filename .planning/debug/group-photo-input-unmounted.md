---
status: resolved
date: 2026-07-07
scope: frontend group-photo upload
---

# Group photo input unmounted before selection

## Evidence

- nginx access logs show repeated successful `GET /api/v1/group-photos` requests but no upload `POST`.
- FastAPI service logs likewise show no upload request.
- The deployed page serves the fixed bundle and reports no browser console errors.

## Root cause

The camera button stops propagation for its own click, then programmatically invokes the hidden file input's `click()`. That second click bubbles to the parent `.group-tile`, whose handler switches Tasks into drill-down mode and unmounts `GroupTileGrid`. The file picker remains open, but the input and its React `onChange` handler are gone by the time a file is selected.

## Fix

Stop propagation on the hidden file input's click event so opening the chooser cannot select the parent tile. Cover the interaction with a component regression test asserting that activating the camera control does not invoke `onSelect`.
