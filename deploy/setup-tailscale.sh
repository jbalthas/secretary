#!/usr/bin/env bash
set -euo pipefail

# Install Tailscale if not already present
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh

# Bring Tailscale up.
# This prints an auth URL — open it in a browser to authenticate this device (one-time step).
sudo tailscale up

# Derive the MagicDNS hostname (e.g. secretary.tail1234.ts.net)
TS_HOST=$(tailscale status --json | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")

# Generate the HTTPS certificate into nginx's certs directory
sudo mkdir -p /etc/nginx/certs
sudo tailscale cert \
    --cert-file "/etc/nginx/certs/$TS_HOST.crt" \
    --key-file "/etc/nginx/certs/$TS_HOST.key" \
    "$TS_HOST"

# Echo the hostname so the caller can substitute __TS_HOSTNAME__
echo "$TS_HOST"
