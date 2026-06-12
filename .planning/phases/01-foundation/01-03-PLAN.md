---
plan: 01-03
phase: 1
wave: 2
title: Tailscale + systemd service + nginx HTTPS reverse proxy
depends_on: [01-01, 01-02]
requirements: [INFRA-03, INFRA-04, INFRA-05]
files_modified:
  - deploy/secretary.service
  - deploy/nginx-secretary.conf
  - deploy/setup-tailscale.sh
  - deploy/setup-services.sh
  - deploy/README.md
autonomous: true
---

## Objective
Make the backend reachable, durable, and HTTPS-served over Tailscale. This plan delivers: a systemd unit that runs the FastAPI service with `Restart=always` and starts on boot after Tailscale (INFRA-03); an nginx reverse proxy that fronts FastAPI, serves the React `dist/` static files, and terminates HTTPS using the Tailscale-provisioned cert (INFRA-04); and Tailscale install/serve configuration so the UI is reachable at `https://<host>.ts.net` from any device (INFRA-05). These are config artifacts plus installer scripts; the Wave 3 bootstrap orchestrates them.

## must_haves
- systemd unit `secretary.service` has `Restart=always` and `After=network-online.target time-sync.target tailscaled.service` (per CLAUDE.md decision).
- systemd unit runs uvicorn with a SINGLE worker (CLAUDE.md: multiple workers duplicate APScheduler fires) bound to `127.0.0.1:8000`.
- nginx proxies `/api/` to `127.0.0.1:8000` and serves SPA static files from the frontend `dist/` for all other paths.
- nginx terminates HTTPS using the Tailscale cert (`tailscale cert` output) for the `.ts.net` hostname.
- `setup-tailscale.sh` brings Tailscale up and enables `tailscale serve`/cert for HTTPS.
- After enable, `systemctl is-enabled secretary` returns `enabled` and `nginx -t` passes.

## Tasks

<task id="01-03-T1" title="systemd unit for the FastAPI service">
  <read_first>
  - C:\Projects\My Secretary\backend\app\main.py — ASGI app path is `app.main:app` (from plan 01-01)
  - C:\Projects\My Secretary\CLAUDE.md — decisions: single uvicorn worker; systemd `After=network-online.target time-sync.target tailscaled.service`; uv-managed venv
  </read_first>

  <action>
  Create `deploy/secretary.service` (systemd unit). Use a placeholder install path `/home/pi/my-secretary` and user `pi` (documented as variables in README). Contents:
  ```ini
  [Unit]
  Description=My Secretary FastAPI service
  After=network-online.target time-sync.target tailscaled.service
  Wants=network-online.target

  [Service]
  Type=simple
  User=pi
  WorkingDirectory=/home/pi/my-secretary/backend
  ExecStart=/home/pi/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
  Restart=always
  RestartSec=3

  [Install]
  WantedBy=multi-user.target
  ```
  The `--workers 1` flag is mandatory. The `ExecStart` uses `uv run` so the project venv is used without manual activation.
  </action>

  <acceptance_criteria>
  - [ ] `deploy/secretary.service` contains `Restart=always`
  - [ ] grep shows `After=network-online.target time-sync.target tailscaled.service`
  - [ ] grep shows `uvicorn app.main:app` and `--workers 1`
  - [ ] grep shows `--host 127.0.0.1 --port 8000`
  - [ ] grep shows `WantedBy=multi-user.target`
  </acceptance_criteria>
</task>

<task id="01-03-T2" title="nginx reverse proxy + SPA static + HTTPS">
  <read_first>
  - C:\Projects\My Secretary\CLAUDE.md — INFRA-04 (nginx proxies to FastAPI, serves React static, terminates HTTPS via Tailscale cert); api_prefix is /api/v1
  - C:\Projects\My Secretary\frontend\vite.config.ts — build outDir is `dist` (plan 01-02)
  </read_first>

  <action>
  Create `deploy/nginx-secretary.conf`. Use placeholder `__TS_HOSTNAME__` (e.g. `secretary.tailXXXX.ts.net`) and cert paths produced by `tailscale cert`. Server block:
  ```nginx
  server {
      listen 443 ssl;
      server_name __TS_HOSTNAME__;

      ssl_certificate     /etc/nginx/certs/__TS_HOSTNAME__.crt;
      ssl_certificate_key /etc/nginx/certs/__TS_HOSTNAME__.key;

      root /home/pi/my-secretary/frontend/dist;
      index index.html;

      location /api/ {
          proxy_pass http://127.0.0.1:8000;
          proxy_set_header Host $host;
          proxy_set_header X-Forwarded-For $remote_addr;
          proxy_set_header X-Forwarded-Proto $scheme;
      }

      location / {
          try_files $uri $uri/ /index.html;
      }
  }
  server {
      listen 80;
      server_name __TS_HOSTNAME__;
      return 301 https://$host$request_uri;
  }
  ```
  `location /api/` MUST proxy to the FastAPI service; the SPA fallback `try_files ... /index.html` serves the React app. Document in `deploy/README.md` that `__TS_HOSTNAME__` is substituted by the bootstrap script.
  </action>

  <acceptance_criteria>
  - [ ] grep `deploy/nginx-secretary.conf` shows `proxy_pass http://127.0.0.1:8000`
  - [ ] grep shows `try_files $uri $uri/ /index.html`
  - [ ] grep shows `root /home/pi/my-secretary/frontend/dist`
  - [ ] grep shows `listen 443 ssl` and `ssl_certificate`
  - [ ] grep shows a port-80 server block with `return 301 https://`
  </acceptance_criteria>
</task>

<task id="01-03-T3" title="Tailscale + service installer scripts">
  <read_first>
  - C:\Projects\My Secretary\deploy\secretary.service — unit name `secretary` (T1)
  - C:\Projects\My Secretary\deploy\nginx-secretary.conf — placeholder `__TS_HOSTNAME__` and cert paths (T2)
  - C:\Projects\My Secretary\CLAUDE.md — Tailscale install via official script; `tailscale serve`/`funnel` for HTTPS; no open ports
  </read_first>

  <action>
  Create `deploy/setup-tailscale.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`):
  1. Install Tailscale via official script, guarded: `command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh`.
  2. `sudo tailscale up` (note in script comment: prints an auth URL the user must open once — this is an unavoidable manual auth step).
  3. Derive the MagicDNS hostname: `TS_HOST=$(tailscale status --json | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")`.
  4. Generate the HTTPS cert into nginx certs dir: `sudo mkdir -p /etc/nginx/certs && sudo tailscale cert --cert-file /etc/nginx/certs/$TS_HOST.crt --key-file /etc/nginx/certs/$TS_HOST.key "$TS_HOST"`.
  5. Echo `$TS_HOST` so the caller can substitute `__TS_HOSTNAME__`.

  Create `deploy/setup-services.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`) taking the hostname as `$1`:
  1. `sudo apt-get install -y nginx`.
  2. Substitute `__TS_HOSTNAME__` -> `$1` in nginx conf: `sudo sed "s/__TS_HOSTNAME__/$1/g" deploy/nginx-secretary.conf | sudo tee /etc/nginx/sites-available/secretary >/dev/null`, then symlink into `sites-enabled` and remove `default`.
  3. `sudo nginx -t && sudo systemctl reload nginx`.
  4. Install the systemd unit: `sudo cp deploy/secretary.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now secretary`.

  Create `deploy/README.md` documenting install path (`/home/pi/my-secretary`), user (`pi`), the one manual `tailscale up` auth step, and the `__TS_HOSTNAME__` substitution.
  </action>

  <acceptance_criteria>
  - [ ] `bash -n deploy/setup-tailscale.sh` exits 0 and `bash -n deploy/setup-services.sh` exits 0
  - [ ] grep `setup-tailscale.sh` shows `command -v tailscale` guard and `tailscale cert`
  - [ ] grep `setup-services.sh` shows `systemctl enable --now secretary`
  - [ ] grep `setup-services.sh` shows `nginx -t` and a `sed s/__TS_HOSTNAME__/`
  - [ ] `deploy/README.md` documents the manual `tailscale up` auth step
  </acceptance_criteria>
</task>

## Verification
On the Pi after running both scripts: `systemctl is-enabled secretary` returns `enabled`, `systemctl is-active secretary` returns `active`, `sudo nginx -t` exits 0, and `curl -k https://<host>.ts.net/api/v1/health` returns `{"status":"ok"}`. Static `/` returns the placeholder React page containing "My Secretary".
