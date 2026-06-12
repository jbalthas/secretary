---
phase: 1
plan: 2
subsystem: infra/frontend
tags: [provisioning, frontend, react, vite, uv, python]
depends_on: []
provides: [provision-pi-script, react-placeholder-app]
affects: [01-03-tailscale-nginx-systemd, 01-04-bootstrap-smoketest]
tech_stack:
  added: [React 19.2, Vite 8, TypeScript 5, @vitejs/plugin-react 6, uv, Python 3.12]
  patterns: [idempotent-shell-script, static-spa]
key_files:
  created:
    - scripts/provision-pi.sh
    - frontend/package.json
    - frontend/vite.config.ts
    - frontend/index.html
    - frontend/src/main.tsx
    - frontend/src/App.tsx
    - frontend/.gitignore
    - frontend/tsconfig.json
    - frontend/tsconfig.app.json
  modified: []
decisions:
  - "@vitejs/plugin-react upgraded to ^6 (not ^4) — v4 peer constraint excludes Vite 8"
metrics:
  duration: 94s
  completed: 2026-06-12T21:10:03Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 0
---

# Phase 1 Plan 2: Pi OS Provisioning + Placeholder React App Summary

**One-liner:** Idempotent Pi provisioning script (uv + Python 3.12 + venv) and a React 19 + Vite 8 placeholder app that builds to `dist/` for later static serving via nginx.

## What Was Built

**Task 1 — `scripts/provision-pi.sh`**
Idempotent bash script targeting Raspberry Pi OS Bookworm 64-bit. Installs system build deps via apt, installs uv if absent (curl guard), pins Python 3.12 via `uv python install 3.12`, and creates the backend venv via `uv sync`. Scoped strictly to INFRA-01 — no nginx, Tailscale, or systemd setup here. Wave 3 bootstrap will call this script.

**Task 2 — `frontend/` React placeholder app**
React 19.2 + Vite 8 + TypeScript app under `frontend/`. Renders `<h1>My Secretary</h1>` and `<p>Foundation online</p>`. Builds to `frontend/dist/` via `npm run build`. The `dist/index.html` is the artifact nginx will serve once the Wave 2 reverse proxy is configured.

## Verification

- `bash -n scripts/provision-pi.sh` exits 0 (syntax valid)
- `cd frontend && npm run build` exits 0; `frontend/dist/index.html` produced
- No nginx/tailscale references in provision script

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Upgraded @vitejs/plugin-react from ^4 to ^6**
- **Found during:** Task 2 — `npm install` failed with ERESOLVE peer conflict
- **Issue:** `@vitejs/plugin-react@4.x` peer constraint excludes Vite 8 (`^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`); v6.x supports Vite 8
- **Fix:** Changed devDependency from `"^4"` to `"^6"` in `frontend/package.json`
- **Files modified:** `frontend/package.json`
- **Commit:** 01c82a1

## Known Stubs

- `frontend/src/App.tsx` — renders placeholder text ("Foundation online"). Intentional; wired data comes in later plans once the backend API exists.

## Self-Check: PASSED
