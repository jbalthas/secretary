---
plan: 01-02
phase: 1
wave: 1
title: Pi OS provisioning base + placeholder React app
depends_on: []
requirements: [INFRA-01]
files_modified:
  - scripts/provision-pi.sh
  - frontend/package.json
  - frontend/vite.config.ts
  - frontend/index.html
  - frontend/src/main.tsx
  - frontend/src/App.tsx
  - frontend/.gitignore
autonomous: true
---

## Objective
Establish the host-provisioning foundation (INFRA-01) as an idempotent shell script that installs uv, Python 3.12, and the project virtualenv on a fresh Raspberry Pi OS Bookworm 64-bit, plus a minimal placeholder React + Vite app that nginx will later serve. The provisioning script is the reusable building block that the Wave 3 bootstrap script will call. The frontend produces a `dist/` that proves the static-serving path end-to-end.

## must_haves
- `scripts/provision-pi.sh` is idempotent (safe to re-run) and installs uv, Python 3.12, and creates the backend venv via `uv sync`.
- The script targets Raspberry Pi OS Bookworm and uses `uv python install 3.12` (no system-Python surgery).
- The placeholder React app builds to `frontend/dist/index.html` via `npm run build`.
- The app renders an identifiable string ("My Secretary") so HTTPS serving can be smoke-tested later.

## Tasks

<task id="01-02-T1" title="Pi provisioning script (uv + Python 3.12 + venv)">
  <read_first>
  - C:\Projects\My Secretary\CLAUDE.md — INFRA-01 stack (Raspberry Pi OS Bookworm 64-bit, uv, Python 3.12), env management = uv (not pip/poetry), and "Ask before destructive operations"
  </read_first>

  <action>
  Create `scripts/provision-pi.sh` (bash, `#!/usr/bin/env bash` + `set -euo pipefail`). It MUST be idempotent. Steps:
  1. `sudo apt-get update && sudo apt-get install -y curl git build-essential` (apt is idempotent).
  2. Install uv if missing: guard with `command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh`, then ensure `~/.local/bin` is on PATH (`export PATH="$HOME/.local/bin:$PATH"`).
  3. `uv python install 3.12` (pins Python 3.12 via uv — does NOT touch system Python; per CLAUDE.md decision avoid 3.13).
  4. From the repo backend dir: `cd "$(dirname "$0")/../backend" && uv sync` to create the project virtualenv.
  5. Echo a clear success line: `echo "[provision] Python 3.12 + uv + backend venv ready"`.

  Do NOT install nginx/tailscale/systemd here — those belong to the Wave 2 plan. Keep this script focused on INFRA-01 (host runtime). Add a comment header noting it is called by `scripts/bootstrap.sh` (Wave 3).
  </action>

  <acceptance_criteria>
  - [ ] `scripts/provision-pi.sh` starts with `#!/usr/bin/env bash` and contains `set -euo pipefail`
  - [ ] grep shows `command -v uv` guard before the uv install line
  - [ ] grep shows `uv python install 3.12`
  - [ ] grep shows `uv sync` run from the backend directory
  - [ ] `bash -n scripts/provision-pi.sh` exits 0 (syntax valid)
  - [ ] script does NOT contain `apt-get install`...`nginx` or `tailscale` (those are Wave 2)
  </acceptance_criteria>
</task>

<task id="01-02-T2" title="Placeholder React + Vite app">
  <read_first>
  - C:\Projects\My Secretary\CLAUDE.md — frontend stack (React 19.2.x, Vite 8.x, Node 22 LTS) and deploy note (build dist/ and serve as static files)
  </read_first>

  <action>
  Create a minimal React 19 + Vite 8 + TypeScript app under `frontend/`.

  `frontend/package.json`: name `my-secretary-web`, type `module`, scripts `dev`/`build`/`preview`. Dependencies `react@^19.2`, `react-dom@^19.2`. devDependencies `vite@^8`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`.

  `frontend/vite.config.ts`:
  ```ts
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";
  export default defineConfig({ plugins: [react()], build: { outDir: "dist" } });
  ```

  `frontend/index.html` with `<div id="root"></div>` and `<script type="module" src="/src/main.tsx">`.

  `frontend/src/main.tsx` mounting `<App />` to `#root` via `createRoot`.

  `frontend/src/App.tsx`: render an `<h1>My Secretary</h1>` and a `<p>Foundation online</p>` placeholder.

  `frontend/.gitignore`: `node_modules`, `dist`.

  Run `cd frontend; npm install; npm run build` to confirm it produces `dist/`.
  </action>

  <acceptance_criteria>
  - [ ] grep `frontend/package.json` shows `"react": "^19` and `"vite": "^8`
  - [ ] `frontend/src/App.tsx` contains the string `My Secretary`
  - [ ] `cd frontend; npm install` exits 0
  - [ ] `cd frontend; npm run build` exits 0 and `frontend/dist/index.html` exists
  - [ ] `frontend/.gitignore` contains `dist`
  </acceptance_criteria>
</task>

## Verification
`bash -n scripts/provision-pi.sh` passes. `cd frontend; npm run build` produces `frontend/dist/index.html` containing the bundled app. On an actual Pi, running `scripts/provision-pi.sh` would leave a working backend venv (full execution validated in Wave 3 bootstrap).
