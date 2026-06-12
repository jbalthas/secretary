---
plan: 01-03
phase: 1
subsystem: infrastructure
tags: [systemd, nginx, tailscale, https, deploy]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [INFRA-03, INFRA-04, INFRA-05]
  affects: []
tech_stack:
  added: [nginx, tailscale, systemd]
  patterns: [uv-run-in-systemd, tailscale-cert-nginx, TS_HOSTNAME-placeholder]
key_files:
  created:
    - deploy/secretary.service
    - deploy/nginx-secretary.conf
    - deploy/setup-tailscale.sh
    - deploy/setup-services.sh
    - deploy/README.md
  modified: []
decisions:
  - Single uvicorn worker enforced in ExecStart (--workers 1) to prevent duplicate APScheduler fires
  - uv run used in ExecStart to avoid manual venv activation in systemd
  - __TS_HOSTNAME__ placeholder pattern for nginx conf to support sed substitution at install time
  - tailscale up auth step documented as unavoidable manual action in README
metrics:
  duration_minutes: 8
  completed_date: "2026-06-12"
  tasks_completed: 3
  files_created: 5
  files_modified: 0
---

# Phase 1 Plan 3: Tailscale + systemd + nginx HTTPS reverse proxy Summary

Deploy artifacts that make the FastAPI backend durable, process-managed, and HTTPS-served over Tailscale — systemd unit with `Restart=always`, nginx reverse proxy fronting FastAPI and serving the React SPA, and installer scripts that wire everything together.

## What Was Built

### Task 1 — systemd unit (`deploy/secretary.service`)

- `After=network-online.target time-sync.target tailscaled.service` — starts after Tailscale is up
- `Restart=always` + `RestartSec=3` — survives crashes and reboots
- `ExecStart` uses `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1`
- Runs as user `pi` from `/home/pi/my-secretary/backend`

### Task 2 — nginx config (`deploy/nginx-secretary.conf`)

- HTTPS on port 443 using Tailscale-provisioned cert at `/etc/nginx/certs/__TS_HOSTNAME__.*`
- `/api/` proxies to `127.0.0.1:8000` with forwarded headers
- `/` falls back via `try_files $uri $uri/ /index.html` for React SPA routing
- Port 80 block redirects to HTTPS with 301

### Task 3 — installer scripts + README

- `setup-tailscale.sh`: guards Tailscale install, runs `tailscale up` (prints auth URL), derives MagicDNS hostname, generates HTTPS cert into `/etc/nginx/certs/`
- `setup-services.sh`: installs nginx, `sed`-substitutes `__TS_HOSTNAME__`, enables site, runs `nginx -t`, copies and enables `secretary.service`
- `deploy/README.md`: documents install path, user, manual auth step, full install sequence, and verification commands

## Verification

Both scripts pass `bash -n` syntax check. All acceptance criteria met:
- `Restart=always`, `After=network-online.target time-sync.target tailscaled.service` present in unit
- `uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1` in ExecStart
- nginx conf has `proxy_pass http://127.0.0.1:8000`, `try_files`, `listen 443 ssl`, `ssl_certificate`, port-80 redirect
- Scripts have Tailscale install guard, `tailscale cert`, `nginx -t`, `systemctl enable --now secretary`
- README documents the manual `tailscale up` auth step

Live verification (on Pi after both scripts run) is documented in `deploy/README.md`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — these are deploy artifacts with no runtime stubs.

## Self-Check: PASSED

- deploy/secretary.service: FOUND
- deploy/nginx-secretary.conf: FOUND
- deploy/setup-tailscale.sh: FOUND
- deploy/setup-services.sh: FOUND
- deploy/README.md: FOUND
- Commits da18a88, 6966324, 6302dbf: FOUND
