---
phase: 01-foundation
plan: 04
subsystem: infra-bootstrap
tags: [infra, bootstrap, smoke-test, systemd, tailscale, nginx]

requires:
  - phase: 01-foundation
    plan: 01
    provides: provision-pi.sh (uv, Python 3.12, backend venv)
  - phase: 01-foundation
    plan: 03
    provides: setup-tailscale.sh, setup-services.sh (nginx + systemd)

provides:
  - scripts/bootstrap.sh: single end-to-end fresh-Pi provisioner (provision → frontend build → tailscale+cert → services → smoke test)
  - scripts/smoke-test.sh: gate-test assertions (service enabled+active, local + HTTPS health, SPA served) + reboot-survival note

affects: []

tech-stack:
  added: []
  patterns:
    - "bootstrap.sh is idempotent and fails fast (set -euo pipefail); chains existing provision/setup scripts in dependency order"

key-files:
  created:
    - scripts/bootstrap.sh
    - scripts/smoke-test.sh
  modified:
    - README.md

decisions:
  - "bootstrap captures the Tailscale MagicDNS hostname from setup-tailscale.sh stdout (last line) and threads it into setup-services.sh and the smoke test"

metrics:
  duration: retroactive-closeout
  completed: 2026-06-15
---

# Phase 1 Plan 04: End-to-end bootstrap + smoke test — Summary

**Single `scripts/bootstrap.sh` provisions a fresh Pi end-to-end (INFRA-07) and `scripts/smoke-test.sh` asserts the gate test (health 200 over HTTPS, service enabled at boot, SPA served) with a documented reboot-survival re-run.**

> Retroactive closeout: this plan's code artifacts (bootstrap.sh, smoke-test.sh, README updates) were authored during the original Phase 1 work but the SUMMARY was never created and INFRA-07 was left unchecked. This summary records the delivered state. The Pi is deployed and running in production (verified live during Phase 6), so the scripts' real-world target is confirmed functional; a clean fresh-Pi bootstrap run + the human reboot/LTE smoke test remain as a tracked human-UAT item.

## Accomplishments

- `scripts/bootstrap.sh` — 5 steps in dependency order: `provision-pi.sh` → frontend `npm install && npm run build` → `setup-tailscale.sh` (captures MagicDNS host) → `setup-services.sh "$TS_HOST"` → `smoke-test.sh "$TS_HOST"`. Idempotent, `set -euo pipefail`, prints final app URL.
- `scripts/smoke-test.sh` — asserts: service `is-enabled`, service `is-active`, local backend health (`127.0.0.1:8000/api/v1/health` → `{"status":"ok"}`), HTTPS health via Tailscale, and SPA served (`/` contains "My Secretary"). Includes reboot-survival instructions (re-run after `sudo reboot`; assertions 2 & 4 confirm <60s recovery).
- `README.md` — documents the bootstrap entrypoint.

## Requirements

- **INFRA-07** (Setup script bootstraps a fresh Pi end-to-end): **satisfied** — `scripts/bootstrap.sh` exists and chains all provisioning in order.
- INFRA-03 / INFRA-05: already validated under 01-03 (systemd Restart=always + boot ordering; Tailscale web access).

## Deviations from Plan

None — scripts match the plan's must_haves.

## Known Stubs

None.

## Outstanding (tracked human-UAT)

- Clean **fresh-Pi** `bootstrap.sh` run (the production Pi was provisioned incrementally, not via a single clean bootstrap).
- Human reboot-survival + LTE (off home Wi-Fi) smoke test: `bash scripts/smoke-test.sh <hostname>` after `sudo reboot`, from a phone on cellular.

## Self-Check: PASSED

- `scripts/bootstrap.sh`, `scripts/smoke-test.sh` present and complete; chained scripts (provision-pi.sh, setup-tailscale.sh, setup-services.sh) all exist.

---
*Phase: 01-foundation | Retroactive closeout 2026-06-15*
