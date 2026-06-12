#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?Usage: $0 <tailscale-hostname>}"

echo "[smoke] Checking service is enabled at boot..."
systemctl is-enabled secretary | grep -q enabled

echo "[smoke] Checking service is active..."
systemctl is-active secretary | grep -q active

echo "[smoke] Checking local backend health (http://127.0.0.1:8000/api/v1/health)..."
curl -fsS http://127.0.0.1:8000/api/v1/health | grep -q '"status":"ok"'

echo "[smoke] Checking HTTPS health via Tailscale (https://$HOST/api/v1/health)..."
curl -fsS "https://$HOST/api/v1/health" | grep -q '"status":"ok"'

echo "[smoke] Checking SPA is served (https://$HOST/)..."
curl -fsS "https://$HOST/" | grep -q "My Secretary"

echo "[smoke] all checks passed"

# Reboot survival note:
# After 'sudo reboot', wait ~60 seconds for the Pi to come back, then re-run:
#   bash scripts/smoke-test.sh <hostname>
# Assertions 2 (service active) and 4 (HTTPS health) confirm <60s recovery with no manual intervention.
