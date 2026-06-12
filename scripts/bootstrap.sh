#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[bootstrap] Step 1: Provision Pi runtime (uv, Python 3.12, backend venv)..."
bash "$ROOT/scripts/provision-pi.sh"

echo "[bootstrap] Step 2: Build frontend..."
cd "$ROOT/frontend"
npm install
npm run build
cd "$ROOT"

echo "[bootstrap] Step 3: Set up Tailscale and generate TLS cert..."
# setup-tailscale.sh prints the MagicDNS hostname on the last line.
# The tailscale up auth URL is printed to the terminal — open it once in a browser.
TS_HOST="$(bash "$ROOT/deploy/setup-tailscale.sh" | tail -n1)"
echo "[bootstrap] Tailscale hostname: $TS_HOST"

echo "[bootstrap] Step 4: Install nginx site and systemd service..."
bash "$ROOT/deploy/setup-services.sh" "$TS_HOST"

echo "[bootstrap] Step 5: Running smoke tests..."
bash "$ROOT/scripts/smoke-test.sh" "$TS_HOST"

echo ""
echo "[bootstrap] done"
echo "[bootstrap] App available at: https://$TS_HOST/"
