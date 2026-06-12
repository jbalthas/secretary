# Deploy

Configuration files and installer scripts for running My Secretary on a Raspberry Pi 5.

## Assumptions

| Variable | Value |
|----------|-------|
| Install path | `/home/pi/my-secretary` |
| User | `pi` |
| Python env | managed by `uv` |

## Files

| File | Purpose |
|------|---------|
| `secretary.service` | systemd unit — starts FastAPI via uvicorn, restarts on crash |
| `nginx-secretary.conf` | nginx virtual host — HTTPS termination, `/api/` proxy, SPA static files |
| `setup-tailscale.sh` | Installs Tailscale, authenticates, generates HTTPS cert |
| `setup-services.sh` | Installs nginx, deploys config, enables systemd service |

## Installation

### 1. Clone the repo onto the Pi

```bash
git clone <repo-url> /home/pi/my-secretary
cd /home/pi/my-secretary
```

### 2. Set up Tailscale (one-time manual auth required)

```bash
bash deploy/setup-tailscale.sh
```

This script will print a Tailscale auth URL. **Open that URL in a browser to authenticate the Pi.** This is a one-time manual step — Tailscale requires browser-based OAuth to register a new device.

After authentication the script derives the MagicDNS hostname (e.g. `secretary.tail1234.ts.net`) and generates the HTTPS certificate, then prints the hostname.

### 3. Deploy nginx and the systemd service

Pass the hostname printed in step 2:

```bash
bash deploy/setup-services.sh secretary.tail1234.ts.net
```

This script:
- Installs nginx
- Substitutes `__TS_HOSTNAME__` in `nginx-secretary.conf` and activates the site
- Runs `nginx -t` to validate config
- Copies `secretary.service` to `/etc/systemd/system/` and runs `systemctl enable --now secretary`

### 4. Verify

```bash
systemctl is-enabled secretary   # → enabled
systemctl is-active secretary    # → active
sudo nginx -t                    # → syntax ok
curl -k https://secretary.tail1234.ts.net/api/v1/health
# → {"status":"ok"}
```

## Notes

- The `__TS_HOSTNAME__` placeholder in `nginx-secretary.conf` is substituted by `setup-services.sh` using `sed`. Do not edit it manually.
- The systemd unit runs a **single uvicorn worker** (`--workers 1`). Multiple workers would cause duplicate APScheduler job fires.
- `uv run` is used in `ExecStart` so the project virtualenv is activated automatically without manual path management.
