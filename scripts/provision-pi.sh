#!/usr/bin/env bash
# provision-pi.sh — INFRA-01: install uv, Python 3.12, and backend venv on a fresh
# Raspberry Pi OS Bookworm 64-bit. This script is idempotent (safe to re-run).
# Called by scripts/bootstrap.sh (Wave 3).
set -euo pipefail

echo "[provision] Updating apt and installing build deps..."
sudo apt-get update
sudo apt-get install -y curl git build-essential

echo "[provision] Installing uv (if not already present)..."
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

echo "[provision] Ensuring Python 3.12 is available via uv..."
uv python install 3.12

echo "[provision] Syncing backend virtualenv..."
cd "$(dirname "$0")/../backend"
uv sync

echo "[provision] Python 3.12 + uv + backend venv ready"
