# My Secretary

A self-hosted personal secretary running on a Raspberry Pi 5. Handles scheduling, task management, push notifications, recurring routines, and bidirectional Google Home voice integration. Accessible from anywhere via Tailscale VPN.

## Fresh Pi setup

Requirements: fresh Raspberry Pi OS Bookworm 64-bit, internet access, a Tailscale account.

```bash
# 1. Clone the repo
git clone https://github.com/your-user/my-secretary /home/pi/my-secretary
cd /home/pi/my-secretary

# 2. Run the bootstrap script
bash scripts/bootstrap.sh
```

The script will:
1. Install uv, Python 3.12, and the backend virtualenv
2. Build the React frontend
3. Install Tailscale and generate a TLS certificate (prints a `tailscale up` auth URL — **open it in a browser once**)
4. Configure nginx and the systemd service
5. Run smoke tests to confirm everything is working

After the one-time Tailscale auth, the app is fully operational and will restart automatically on reboot.

## Accessing the app

After bootstrap, the app is available at `https://<hostname>.ts.net/` from any device on your Tailscale network.

To find the hostname:
```bash
tailscale status --json | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))"
```

## Running smoke tests manually

```bash
bash scripts/smoke-test.sh <tailscale-hostname>
```

## Development

See `backend/` for the FastAPI service and `frontend/` for the React app.

```bash
# Backend (dev)
cd backend
uv run uvicorn app.main:app --reload

# Frontend (dev)
cd frontend
npm run dev
```
