---
plan: 01-04
phase: 1
wave: 3
title: End-to-end bootstrap script + reboot/remote smoke test
depends_on: [01-01, 01-02, 01-03]
requirements: [INFRA-07, INFRA-05, INFRA-03]
files_modified:
  - scripts/bootstrap.sh
  - scripts/smoke-test.sh
  - README.md
autonomous: false
---

## Objective
Tie everything together with a single `scripts/bootstrap.sh` that provisions a fresh Pi end-to-end with minimal manual steps (INFRA-07), running provisioning, frontend build, Tailscale + cert, nginx, and the systemd service in the correct order. Add `scripts/smoke-test.sh` to assert the gate test (health 200 over HTTPS, survives reboot). A human-verify checkpoint confirms the gate test from a phone on LTE — the one thing only a human with a phone off home Wi-Fi can prove.

## must_haves
- `scripts/bootstrap.sh` calls, in order: `provision-pi.sh`, frontend build, `setup-tailscale.sh` (capturing the hostname), then `setup-services.sh "$TS_HOST"`.
- The script is idempotent and re-runnable; it fails fast (`set -euo pipefail`).
- `scripts/smoke-test.sh` verifies `https://<host>/api/v1/health` returns 200 and that the service is enabled at boot.
- The gate test (`curl https://<host>.ts.net/api/v1/health` from a phone on LTE returns 200) is confirmed by a human.
- Reboot survival is verified: service is `active` within 60s of reboot.

## Tasks

<task id="01-04-T1" title="Bootstrap orchestration script">
  <read_first>
  - C:\Projects\My Secretary\scripts\provision-pi.sh — entrypoint + success line (plan 01-02)
  - C:\Projects\My Secretary\deploy\setup-tailscale.sh — echoes TS_HOST hostname (plan 01-03)
  - C:\Projects\My Secretary\deploy\setup-services.sh — takes hostname as $1 (plan 01-03)
  - C:\Projects\My Secretary\frontend\package.json — build script (plan 01-02)
  </read_first>

  <action>
  Create `scripts/bootstrap.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`). Resolve repo root via `ROOT="$(cd "$(dirname "$0")/.." && pwd)"`. Steps:
  1. `bash "$ROOT/scripts/provision-pi.sh"` (host runtime: uv, Python 3.12, backend venv).
  2. Build frontend: `cd "$ROOT/frontend" && npm install && npm run build` (produces `dist/`).
  3. Tailscale + cert, capturing hostname: `TS_HOST="$(bash "$ROOT/deploy/setup-tailscale.sh" | tail -n1)"`.
  4. Services: `cd "$ROOT" && bash "$ROOT/deploy/setup-services.sh" "$TS_HOST"`.
  5. Run `bash "$ROOT/scripts/smoke-test.sh" "$TS_HOST"`.
  6. Echo final `https://$TS_HOST/` URL and `[bootstrap] done`.

  Keep manual steps minimal: the only human interaction is the one-time `tailscale up` auth URL (documented). Note that in README.

  Update root `README.md` with a "Fresh Pi setup" section: clone repo to `/home/pi/my-secretary`, run `bash scripts/bootstrap.sh`, open the printed `tailscale up` URL once, done.
  </action>

  <acceptance_criteria>
  - [ ] `bash -n scripts/bootstrap.sh` exits 0
  - [ ] grep shows calls to `provision-pi.sh`, `npm run build`, `setup-tailscale.sh`, `setup-services.sh`, `smoke-test.sh` in that order
  - [ ] grep shows `TS_HOST="$(bash` capturing the tailscale hostname
  - [ ] grep shows `set -euo pipefail`
  - [ ] `README.md` contains a "Fresh Pi setup" / bootstrap section referencing `scripts/bootstrap.sh`
  </acceptance_criteria>
</task>

<task id="01-04-T2" title="Smoke-test script (health + reboot survival assertions)">
  <read_first>
  - C:\Projects\My Secretary\deploy\secretary.service — unit name `secretary` (plan 01-03)
  - C:\Projects\My Secretary\backend\app\main.py — health path `/api/v1/health` (plan 01-01)
  </read_first>

  <action>
  Create `scripts/smoke-test.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`) taking hostname `$1`. Assertions, each exiting non-zero on failure:
  1. Service enabled at boot: `systemctl is-enabled secretary | grep -q enabled`.
  2. Service active: `systemctl is-active secretary | grep -q active`.
  3. Local backend health: `curl -fsS http://127.0.0.1:8000/api/v1/health | grep -q '"status":"ok"'`.
  4. HTTPS through nginx over Tailscale: `curl -fsS "https://$1/api/v1/health" | grep -q '"status":"ok"'`.
  5. Static SPA served: `curl -fsS "https://$1/" | grep -q "My Secretary"`.
  Print a `[smoke] all checks passed` line on success.

  Add a commented "reboot survival" note: after `sudo reboot`, re-run this script; assertions 2 and 4 confirm <60s recovery (verified manually in the checkpoint).
  </action>

  <acceptance_criteria>
  - [ ] `bash -n scripts/smoke-test.sh` exits 0
  - [ ] grep shows `systemctl is-enabled secretary` and `systemctl is-active secretary`
  - [ ] grep shows `curl -fsS "https://$1/api/v1/health"` and a `status":"ok"` check
  - [ ] grep shows a `curl` of `https://$1/` checking for `My Secretary`
  - [ ] script prints `[smoke] all checks passed` on success
  </acceptance_criteria>
</task>

<task id="01-04-T3" title="Human-verify gate test (remote LTE + reboot)" type="checkpoint:human-verify" gate="blocking">
  <read_first>
  - C:\Projects\My Secretary\.planning\ROADMAP.md — Phase 1 gate test and success criteria
  </read_first>

  <what-built>
  A fully provisioned Pi: FastAPI behind nginx with Tailscale HTTPS, running as a systemd service with Restart=always, started by a single bootstrap script.
  </what-built>

  <how-to-verify>
  1. On your phone, turn OFF Wi-Fi so you are on the mobile (LTE) network, with the Tailscale app connected.
  2. Visit `https://<host>.ts.net/api/v1/health` in the phone browser. Expect HTTP 200 and body `{"status":"ok"}`.
  3. Visit `https://<host>.ts.net/` — expect the placeholder page showing "My Secretary".
  4. On the Pi, run `sudo reboot`. Wait ~60 seconds. Re-run step 2 from the phone and confirm 200 again WITHOUT touching the Pi.
  </how-to-verify>

  <acceptance_criteria>
  - [ ] Health endpoint returns 200 from the phone on LTE (not home Wi-Fi)
  - [ ] Root URL shows the "My Secretary" placeholder over HTTPS
  - [ ] After reboot, health returns 200 within 60s with no manual intervention
  </acceptance_criteria>

  <resume-signal>Type "approved" or describe what failed.</resume-signal>
</task>

## Verification
`bash -n` passes on both scripts. On a fresh Pi, `scripts/bootstrap.sh` runs to completion with only the one-time `tailscale up` auth interaction, `scripts/smoke-test.sh` prints all-checks-passed, and the human checkpoint confirms remote LTE access plus <60s reboot recovery — satisfying all four Phase 1 success criteria.
