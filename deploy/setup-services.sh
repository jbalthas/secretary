#!/usr/bin/env bash
set -euo pipefail

TS_HOST="${1:?Usage: $0 <tailscale-hostname>}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Install nginx
sudo apt-get install -y nginx

# Substitute __TS_HOSTNAME__ and install nginx site
sudo sed \
    -e "s/__TS_HOSTNAME__/$TS_HOST/g" \
    -e "s|__REPO_DIR__|$REPO_DIR|g" "$REPO_DIR/deploy/nginx-secretary.conf" \
    | sudo tee /etc/nginx/sites-available/secretary >/dev/null

# Enable site and remove default
sudo ln -sf /etc/nginx/sites-available/secretary /etc/nginx/sites-enabled/secretary
sudo rm -f /etc/nginx/sites-enabled/default

# Validate config and reload nginx
sudo nginx -t
sudo systemctl reload nginx

# Install and enable the systemd service
sudo cp "$REPO_DIR/deploy/secretary.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secretary
