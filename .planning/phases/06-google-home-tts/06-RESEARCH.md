# Phase 6: Google Home TTS - Research

**Researched:** 2026-06-14
**Domain:** pychromecast + gTTS + FastAPI static file serving + IFTTT webhook exposure
**Confidence:** HIGH (core stack well-understood from prior decisions; unknowns resolved below)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Task reminders spoken as `"Reminder: {title}"`. Non-empty description appended: `"Reminder: {title}. {description}"`. Priority NOT read aloud.
- **D-02:** Daily brief uses a separate spoken formatter (`build_brief_speech()`). Opens with `"Good morning."`, strips `• ` bullets and `HH:MM` formatting, joins items with `". "`. Empty → `"Good morning. Nothing scheduled today."`
- **D-03:** Ad-hoc TTS (`POST /api/v1/tts`) speaks exact submitted text verbatim — no wrapping.
- **D-04:** TTS fires alongside Pushover at same hook points (`_send_reminder` for reminders, `send_daily_brief` for brief). Pushover sent first/independently.
- **D-05:** TTS is best-effort: any failure caught, logged, swallowed. MUST NOT raise out of job or block Pushover.
- **D-06:** No secondary "speaker unreachable" Pushover alert in v1.
- **D-07:** Single global `tts_enabled` boolean in `AppSettings` (default true). When false, all Google Home announcements skipped; Pushover unaffected. Quiet hours / per-item toggles deferred.
- **D-08:** "Google Home" card in `frontend/src/pages/Settings.tsx` — text input + "Speak" button calling `POST /api/v1/tts` + `tts_enabled` toggle. Mirror Daily Brief card pattern + `useBriefSettings.ts` hook pattern.
- **D-09:** Target speaker configured in `.env` via `google_home_ip` (and optional `google_home_name`) in `config.py`. Static DHCP reservation + `known_hosts=[<ip>]`. Single device; speaker groups deferred.
- **D-10:** Routine-trigger brief webhook (NOTIF-06) requires shared-secret token (env `webhook_secret`, checked via query param or `X-Webhook-Secret` header). Reject 401/403 on mismatch. Called from outside Tailscale boundary.
- **D-11:** `POST /api/v1/tts` and Settings UI calls protected by Tailscale network boundary only — no per-request app auth, consistent with all existing endpoints.

### Claude's Discretion

- Exact module layout for TTS/cast service (e.g. `services/tts.py` + `services/cast.py` vs combined) — follow `PushoverClient` service shape.
- **How generated MP3s are hosted so the Google Home can fetch them** — researcher to determine (resolved below).
- gTTS cache directory location and cache-key hashing scheme (decision: hash by text).
- Exact spoken phrasing beyond D-02 (e.g. whether to expand "09:00" → "9 AM").
- Naming of webhook route (e.g. `POST /api/v1/tts/brief` vs `POST /api/v1/webhooks/brief`).
- Settings-card visual styling (reuse existing `CARD_STYLE` / `SECTION_LABEL_STYLE`).

### Deferred Ideas (OUT OF SCOPE)

- Quiet hours / time-windowed muting — v2.
- Per-reminder or per-routine TTS opt-in — v2.
- Speaker groups / multi-device targeting — v2.
- "Speaker unreachable" failure alerting via Pushover — v1 not needed.
- Voice input (Google Home → add task via IFTTT) — v2.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-03 | User can trigger a TTS announcement on their Google Home from the web UI (`POST /api/v1/tts`) | Endpoint pattern from settings router; pychromecast play_media via run_in_threadpool |
| NOTIF-04 | Task reminders also announce on Google Home via pychromecast + gTTS (in addition to Pushover) | gTTS file generation + cache; cast call from `_send_reminder` sync context |
| NOTIF-05 | Daily brief announces on Google Home at brief time (in addition to Pushover) | `build_brief_speech()` formatter; cast call from `send_daily_brief` sync context |
| NOTIF-06 | Google Home morning routine can trigger the daily brief via a webhook endpoint | IFTTT → Tailscale Funnel path-specific exposure; shared-secret 401 guard |
</phase_requirements>

---

## Summary

Phase 6 adds Google Home TTS as a best-effort second channel alongside Pushover. The three technical building blocks are: (1) gTTS to synthesize MP3 from text, with a text-hash disk cache; (2) pychromecast to connect to the speaker by static IP and issue a `play_media` call with an HTTP URL; and (3) a FastAPI `StaticFiles` mount that serves the cache directory over HTTP on the LAN IP, making it reachable by the cast device.

The critical unknown — **how the Chromecast fetches audio** — is resolved: mount the MP3 cache dir as a FastAPI `StaticFiles` path, construct the media URL using the Pi's LAN IP (not Tailscale IP, not hostname) and the exposed HTTP port, and pass that URL to `play_media`. The Chromecast device uses Google's public DNS, not local mDNS/DHCP, so the URL must use a bare IP address. Tailscale-only HTTPS is irrelevant here: the audio fetch is a LAN HTTP call on port 8000 (FastAPI) or a new nginx location — LAN HTTP is safe since the cast device is on the same private network as the Pi.

The IFTTT webhook is exposed via `tailscale funnel --https=443 --set-path=/api/v1/webhooks/brief localhost:8000` (already behind nginx on the Pi, so tunnel to 8000 directly) or by adding an nginx `location /api/v1/webhooks/brief` that permits only the specific path. The shared secret in `X-Webhook-Secret` header guards it from unauthorized calls.

**Primary recommendation:** `services/tts.py` is a single sync class (mirrors `PushoverClient`) with `speak(text: str) -> None` that hashes the text, writes an MP3 to `tts_cache/`, and calls pychromecast `play_media`. Mount `tts_cache/` as `/tts-audio/` in `main.py`. Construct the media URL as `http://{PI_LAN_IP}:8000/tts-audio/{hash}.mp3`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pychromecast | 14.0.9 | Discover + control Google Home/Chromecast | Official Home Assistant library; `known_hosts` avoids mDNS on Pi boot |
| gTTS | 2.5.4 | Generate MP3 from text via Google TTS API | Minimal, no API key required, widely used |
| FastAPI StaticFiles | (bundled via `fastapi[standard]`) | Serve MP3 cache over HTTP for cast device | Already a dependency; zero extra overhead |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hashlib (stdlib) | — | Compute text-hash cache key (SHA-256, first 16 hex chars) | Always — no extra install |
| starlette.concurrency.run_in_threadpool | (bundled) | Call blocking cast/TTS from async FastAPI endpoint | `POST /api/v1/tts` only; APScheduler jobs are already sync |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FastAPI StaticFiles mount | pychromecast's built-in HTTP server (`cast.media_controller`) | pychromecast has no built-in media server; the cast device fetches from a URL we provide — we must host it ourselves |
| FastAPI StaticFiles mount | Separate Python `http.server` subprocess | More moving parts; StaticFiles is already wired into the FastAPI process |
| gTTS (Google TTS endpoint) | Edge TTS / Coqui TTS | No internet dependency, but heavier setup; gTTS is already chosen in stack |
| Tailscale Funnel path-specific | Full nginx public exposure | Funnel keeps everything else private; nginx public means opening a router port |

**Installation (Pi):**
```bash
uv pip install pychromecast==14.0.9 gTTS==2.5.4
```

**Version verification:**
```bash
pip index versions pychromecast  # 14.0.9 as of 2026-06-14
pip index versions gTTS           # 2.5.4 as of 2026-06-14
```

---

## Architecture Patterns

### Recommended Project Structure

```
backend/app/
├── services/
│   ├── pushover.py      # existing — canonical sync service shape
│   └── tts.py           # NEW — TTSClient (sync), wraps gTTS + pychromecast
├── routers/
│   ├── settings.py      # existing — add tts_enabled GET/PUT + POST /tts
│   └── (or new tts.py router)  # if endpoint count warrants splitting
├── config.py            # add: google_home_ip, google_home_lan_ip, webhook_secret
├── models/__init__.py   # add: tts_enabled bool column on AppSettings
├── main.py              # add: StaticFiles mount + new router
└── migrations/versions/
    └── 0004_add_tts_enabled.py  # Alembic migration

tts_cache/               # runtime directory at project root or /tmp/tts_cache
                         # created on startup if missing; not committed to git
frontend/src/
├── pages/Settings.tsx   # add Google Home card
└── hooks/useGoogleHome.ts  # new hook: tts_enabled GET/PUT + speak POST
```

### Pattern 1: TTSClient — Sync Blocking Service (mirrors PushoverClient)

**What:** A class with a single `speak(text: str) -> None` method. Synthesizes to a cached MP3, constructs the media URL, opens a pychromecast connection, plays, then shuts down discovery. All blocking.

**When to use:** Called from APScheduler sync jobs (`_send_reminder`, `send_daily_brief`) directly. Called via `run_in_threadpool` from the async `POST /api/v1/tts` endpoint.

```python
# Source: pychromecast README + FastAPI StaticFiles pattern
import hashlib
import os
from pathlib import Path
from gtts import gTTS
import pychromecast
from app.config import settings

CACHE_DIR = Path(__file__).parent.parent.parent / "tts_cache"


class TTSClient:
    def speak(self, text: str) -> None:
        CACHE_DIR.mkdir(exist_ok=True)
        key = hashlib.sha256(text.encode()).hexdigest()[:16]
        mp3_path = CACHE_DIR / f"{key}.mp3"
        if not mp3_path.exists():
            tts = gTTS(text=text, lang="en")
            tts.save(str(mp3_path))

        media_url = (
            f"http://{settings.google_home_lan_ip}:8000/tts-audio/{key}.mp3"
        )

        chromecasts, browser = pychromecast.get_listed_chromecasts(
            friendly_names=[settings.google_home_name or ""],
            known_hosts=[settings.google_home_ip],
        )
        try:
            if not chromecasts:
                raise RuntimeError("No cast device found")
            cast = chromecasts[0]
            cast.wait()
            cast.media_controller.play_media(media_url, "audio/mp3")
            # Brief sleep so cast receives command before discovery shuts down
            import time; time.sleep(3)
        finally:
            browser.stop_discovery()
```

**Key detail:** `cast.wait()` blocks until the socket worker thread has initial status. `play_media` is a send-and-return call (non-blocking on pychromecast's side). The `time.sleep(3)` gives the device time to start buffering before we call `stop_discovery()`.

### Pattern 2: MP3 URL Wiring — LAN IP Required

**What:** The Chromecast device fetches the MP3 by issuing an HTTP GET to the URL passed to `play_media`. It uses Google's public DNS, not the Pi's mDNS or DHCP DNS, so a hostname like `secretary.ts.net` will not resolve from the cast device's network stack. A Tailscale IP will likely not be reachable from the Chromecast (it's not in the tailnet).

**Concrete recommendation:**
- Use the Pi's **LAN IP address** (e.g. `192.168.1.x`) — set via env var `GOOGLE_HOME_LAN_IP`.
- Serve on **port 8000** (FastAPI direct, not nginx) or add an nginx `location /tts-audio/` that proxies to FastAPI. The simpler path is port 8000 direct since the Chromecast is on the LAN.
- Mount in `main.py`:
  ```python
  from fastapi.staticfiles import StaticFiles
  from pathlib import Path
  TTS_CACHE = Path(__file__).parent.parent.parent / "tts_cache"
  TTS_CACHE.mkdir(exist_ok=True)
  app.mount("/tts-audio", StaticFiles(directory=TTS_CACHE), name="tts-audio")
  ```

**Why not nginx?** nginx serves `frontend/dist` statics and proxies `/api/`. Adding `/tts-audio/` to nginx requires a config change on Pi + nginx reload. FastAPI `mount` is a one-line code change with no deploy step. Use FastAPI directly.

### Pattern 3: async → sync boundary for POST /api/v1/tts

**What:** The FastAPI endpoint is `async def`. pychromecast calls are blocking. Use `run_in_threadpool` (already imported in `main.py`).

```python
# Source: starlette.concurrency — already used in main.py lifespan
from starlette.concurrency import run_in_threadpool
from app.services.tts import TTSClient

@router.post("/tts", status_code=202)
async def speak_text(body: TTSRequest, session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg and not cfg.tts_enabled:
        return {"status": "disabled"}
    await run_in_threadpool(TTSClient().speak, body.text)
    return {"status": "queued"}
```

**APScheduler jobs are sync** — call `TTSClient().speak(text)` directly, no `await` or `run_in_threadpool`.

### Pattern 4: Webhook Secret Guard (NOTIF-06)

**What:** A FastAPI dependency that reads `X-Webhook-Secret` header (or `?secret=` query param as fallback), compares with `settings.webhook_secret` using constant-time compare, raises 403 on mismatch.

```python
import hmac
from fastapi import Header, HTTPException

def verify_webhook_secret(x_webhook_secret: str = Header(default="")):
    if not hmac.compare_digest(x_webhook_secret, settings.webhook_secret):
        raise HTTPException(status_code=403, detail="Forbidden")
```

IFTTT Webhooks sends a POST to a URL. The secret goes in a custom header that the IFTTT applet is configured to send. IFTTT's "Webhooks" action supports custom headers in the "Make a web request" action.

### Pattern 5: Alembic Migration — add `tts_enabled` column

Mirror `0003_add_app_settings_and_routines.py`. New migration adds a nullable-with-server-default `Boolean` column, then inserts/updates the single row.

```python
# 0004_add_tts_enabled.py
def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("tts_enabled", sa.Boolean(), nullable=False, server_default="1"),
    )

def downgrade() -> None:
    op.drop_column("app_settings", "tts_enabled")
```

`server_default="1"` ensures the existing row (id=1) gets `true` without a separate UPDATE.

### Pattern 6: `build_brief_speech()` — Spoken Brief Formatter

**What:** Parallel to `build_brief_body()` in `services/brief.py`. Reuses the same DB query. Strips `HH:MM` prefix, strips `•` bullets, joins with `. `.

```python
def build_brief_speech() -> str:
    # Re-runs same query as build_brief_body()
    # timed items: "09:00 Team standup" -> "Team standup"
    # untimed items: "• Call dentist" -> "Call dentist"
    # join: "Good morning. Team standup. Call dentist."
    # empty: "Good morning. Nothing scheduled today."
    ...
```

Whether to expand `"09:00"` → `"9 AM"` is Claude's discretion. Recommendation: skip time expansion in v1 — gTTS reads `"09:00"` as "09 colon 00" which is awkward. Extract only the title portion for timed items (drop the time string entirely in the spoken version). This avoids the problem.

### Anti-Patterns to Avoid

- **`await` in `_send_reminder` or `send_daily_brief`:** These run in APScheduler's sync thread pool. No event loop is available. Call `TTSClient().speak()` synchronously.
- **Using Tailscale IP or `secretary.ts.net` in the media URL:** The Chromecast uses Google DNS, not the Pi's tailnet. The URL must be a LAN IP.
- **Using HTTPS for the media URL:** The LAN HTTP call from Chromecast does not need TLS — the cast device is on the local network. Trying to make it use the nginx HTTPS cert adds unnecessary complexity.
- **Calling `browser.stop_discovery()` before `cast.wait()`:** Stops the socket worker before it initializes. Always wait → play → sleep briefly → stop_discovery.
- **Not wrapping `TTSClient().speak()` in try/except in the scheduler hooks:** D-05 requires swallowing all errors. Never let a cast failure propagate out of `_send_reminder` or `send_daily_brief`.
- **Storing MP3 files in git:** `tts_cache/` must be in `.gitignore`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text-to-speech synthesis | Custom Google TTS HTTP client | `gTTS` | Handles auth, chunking, audio format negotiation |
| Chromecast discovery/control | Raw protobuf socket | `pychromecast` | Full Cast protocol implementation in 20K LOC |
| Constant-time secret comparison | `==` string compare | `hmac.compare_digest` | Timing-safe; prevents timing oracle on webhook secret |
| Static file serving | Custom FileResponse handler per file | `FastAPI StaticFiles` mount | Handles Range headers, ETags, MIME types correctly |

---

## Runtime State Inventory

> Phase 6 adds new config to `.env` and a new DB column. No rename/refactor — this section is brief.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `app_settings` row (id=1) — gains `tts_enabled` column | Alembic migration with `server_default="1"` handles existing row |
| Live service config | nginx conf — no change required (MP3 served by FastAPI on port 8000, not nginx) | None |
| OS-registered state | systemd unit — no change required | None |
| Secrets/env vars | New: `GOOGLE_HOME_IP`, `GOOGLE_HOME_LAN_IP`, `GOOGLE_HOME_NAME` (optional), `WEBHOOK_SECRET` | Add to `.env` + `.env.example`; add fields to `config.py` |
| Build artifacts | None | None |

---

## Common Pitfalls

### Pitfall 1: Chromecast Cannot Resolve the Pi's Hostname

**What goes wrong:** `play_media("http://secretary.ts.net/tts-audio/abc.mp3", ...)` — the Chromecast fetches the URL using Google's `8.8.8.8` DNS, which doesn't know about `secretary.ts.net` or the Pi's local hostname.

**Why it happens:** Chromecast devices ignore the LAN's DHCP-provided DNS and use Google's public resolvers. mDNS names (`.local`) and Tailscale domains don't resolve externally.

**How to avoid:** Always use a bare LAN IP (`192.168.x.x`) in the media URL. Add `GOOGLE_HOME_LAN_IP` to `.env` and build the URL from that setting.

**Warning signs:** Cast device buffers forever or shows "Error loading" in the media controller status.

### Pitfall 2: pychromecast zeroconf/mDNS Failing on Pi After Reboot

**What goes wrong:** `get_listed_chromecasts()` with `known_hosts=[ip]` still times out if mDNS is not available, because the library may still try mDNS in addition to the known host.

**Why it happens:** pychromecast uses zeroconf for discovery; `known_hosts` supplements rather than replaces discovery in some versions.

**How to avoid:** Pass `discovery_timeout=5` and check that `known_hosts` is correctly formatted (list of strings, not a single string). If using `friendly_names=[]` (empty), pychromecast returns all found devices including known hosts. Consider using `pychromecast.get_chromecasts(known_hosts=[ip])` and taking `chromecasts[0]` when only one device is configured.

**Warning signs:** Long delay (>5s) before cast attempt; "No chromecast discovered" log even though IP is correct.

### Pitfall 3: gTTS Hangs When Google Is Unreachable

**What goes wrong:** `gTTS().save()` makes an outbound HTTPS call to `translate.google.com`. If the Pi has no internet, it blocks until timeout (~30s default).

**Why it happens:** gTTS has no explicit timeout parameter on the HTTP request.

**How to avoid:** Cache by text hash — if the file already exists, skip gTTS entirely. Pre-generate static MP3s for the most common phrases ("Good morning. Nothing scheduled today.", "Reminder:…") as part of a Wave 0 task so the gate test works even without internet.

**Warning signs:** `TTSClient().speak()` hangs for 30+ seconds; scheduler job misfires logged.

### Pitfall 4: `stop_discovery()` Called Before Media Starts Playing

**What goes wrong:** Calling `browser.stop_discovery()` immediately after `play_media()` can shut down the underlying socket before the Chromecast device has connected and started streaming.

**Why it happens:** `play_media()` returns immediately — it sends the instruction but doesn't wait for the device to start. The socket thread must remain alive long enough for the device to handshake.

**How to avoid:** Sleep 2–3 seconds after `play_media()` before calling `stop_discovery()`. For the gate test (10s budget), this is acceptable. The `media_controller.block_until_active()` method exists but can block indefinitely if the device never starts — prefer a fixed short sleep in this use case.

**Warning signs:** No sound despite no exception; cast status stays `IDLE` in logs.

### Pitfall 5: double-start of StaticFiles mount

**What goes wrong:** `app.mount("/tts-audio", ...)` called after `app.include_router(...)` but `tts_cache/` dir doesn't exist yet — Starlette raises `AssertionError` at startup.

**Why it happens:** `StaticFiles(directory=...)` checks that the directory exists at mount time.

**How to avoid:** Create `CACHE_DIR.mkdir(exist_ok=True)` before calling `app.mount(...)` in `main.py`, or create it as part of the `lifespan` startup.

### Pitfall 6: Tailscale Funnel Path Doesn't Persist Across Reboots Without `--bg`

**What goes wrong:** After Pi reboots, IFTTT calls the webhook URL and gets a connection refused.

**Why it happens:** `tailscale funnel` without `--bg` is ephemeral.

**How to avoid:** Use `tailscale funnel --bg --https=443 --set-path=/api/v1/webhooks/brief localhost:8000` and verify the funnel is listed in `tailscale funnel status`. Document in deploy/README.

---

## Code Examples

### gTTS Cache Write

```python
# Source: gTTS PyPI docs + stdlib hashlib
import hashlib
from pathlib import Path
from gtts import gTTS

def _mp3_path(text: str, cache_dir: Path) -> Path:
    key = hashlib.sha256(text.encode()).hexdigest()[:16]
    return cache_dir / f"{key}.mp3"

def synthesize(text: str, cache_dir: Path) -> Path:
    path = _mp3_path(text, cache_dir)
    if not path.exists():
        gTTS(text=text, lang="en").save(str(path))
    return path
```

### pychromecast Play (Complete Sync Flow)

```python
# Source: pychromecast/examples/media_example.py (official repo)
import time
import pychromecast

def cast_mp3(media_url: str, ip: str, friendly_name: str = "") -> None:
    chromecasts, browser = pychromecast.get_listed_chromecasts(
        friendly_names=[friendly_name] if friendly_name else [],
        known_hosts=[ip],
    )
    try:
        if not chromecasts:
            raise RuntimeError(f"Cast device not found at {ip}")
        cast = chromecasts[0]
        cast.wait()
        cast.media_controller.play_media(media_url, "audio/mp3")
        time.sleep(3)  # allow device to start buffering before teardown
    finally:
        browser.stop_discovery()
```

### FastAPI StaticFiles Mount

```python
# Source: FastAPI docs — StaticFiles
from fastapi.staticfiles import StaticFiles
from pathlib import Path

TTS_CACHE = Path(__file__).parent.parent.parent / "tts_cache"
TTS_CACHE.mkdir(exist_ok=True)
app.mount("/tts-audio", StaticFiles(directory=TTS_CACHE), name="tts-audio")
# Media URL: f"http://{settings.google_home_lan_ip}:8000/tts-audio/{key}.mp3"
```

### TTS Endpoint (async → sync via run_in_threadpool)

```python
# Source: starlette.concurrency (already used in main.py lifespan)
from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.db import get_session
from app.models import AppSettings
from app.services.tts import TTSClient

router = APIRouter(prefix="/api/v1", tags=["tts"])

class TTSRequest(BaseModel):
    text: str

@router.post("/tts", status_code=202)
async def speak_text(body: TTSRequest, session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is not None and not cfg.tts_enabled:
        return {"status": "disabled"}
    await run_in_threadpool(TTSClient().speak, body.text)
    return {"status": "ok"}
```

### Webhook Guard Dependency

```python
import hmac
from fastapi import Header, HTTPException
from app.config import settings

def verify_webhook_secret(x_webhook_secret: str = Header(default="")):
    if not settings.webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not hmac.compare_digest(x_webhook_secret, settings.webhook_secret):
        raise HTTPException(status_code=403, detail="Forbidden")

@router.post("/webhooks/brief")
async def trigger_brief(
    _: None = Depends(verify_webhook_secret),
    session: AsyncSession = Depends(get_session),
):
    await run_in_threadpool(send_daily_brief)
    return {"status": "ok"}
```

### Spoken Reminder Hook (in `_send_reminder`, sync)

```python
# In backend/app/scheduler.py — add after PushoverClient().send()
def _send_reminder(title: str, body: str, priority: int) -> None:
    from app.services.pushover import PushoverClient
    PushoverClient().send(title=title, message=body, priority=priority)
    # TTS — best-effort, D-05
    try:
        from app.services.tts import TTSClient
        from app.services.tts_settings import get_tts_enabled  # sync DB read helper
        if get_tts_enabled():
            spoken = f"Reminder: {title}"
            if body:
                spoken += f". {body}"
            TTSClient().speak(spoken)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("TTS reminder failed")
```

### Alembic Migration

```python
# 0004_add_tts_enabled.py — mirrors 0003 pattern
revision = "0004"
down_revision = "0003"

def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("tts_enabled", sa.Boolean(), nullable=False, server_default="1"),
    )

def downgrade() -> None:
    op.drop_column("app_settings", "tts_enabled")
```

### config.py additions

```python
class Settings(BaseSettings):
    # ... existing fields ...
    google_home_ip: str = ""          # Cast device IP (for pychromecast known_hosts)
    google_home_lan_ip: str = ""      # Pi LAN IP (for media URL the cast fetches)
    google_home_name: str = ""        # Optional friendly name for device filter
    webhook_secret: str = ""          # Shared secret for /webhooks/brief
```

### .env.example additions

```
GOOGLE_HOME_IP=192.168.1.x
GOOGLE_HOME_LAN_IP=192.168.1.y
GOOGLE_HOME_NAME=Living Room
WEBHOOK_SECRET=change-me-to-a-random-string
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pychromecast.get_chromecasts()` (returns all) | `pychromecast.get_listed_chromecasts(friendly_names=[], known_hosts=[ip])` | pychromecast v10+ | More targeted; avoids iterating all devices |
| gTTS `write_to_fp()` streaming | `gTTS().save(path)` to disk then serve file | gTTS 2.x | File-on-disk approach required for Chromecast URL serving |

**Deprecated/outdated:**

- `pychromecast.get_chromecast(device_name=...)`: removed in v9+. Use `get_listed_chromecasts`.
- `cast.media_controller.block_until_active()` for one-shot playback: blocks indefinitely on failure. Use a fixed sleep or timeout instead.

---

## Open Questions

1. **Which IP is `google_home_lan_ip`?**
   - What we know: Pi's LAN IP (assigned by router DHCP, static reserved) — e.g. `192.168.1.50`.
   - What's unclear: The user hasn't documented their Pi's LAN IP in `.env.example` yet.
   - Recommendation: Plan includes a task to add `GOOGLE_HOME_LAN_IP` to `.env.example` with `192.168.x.y` placeholder. User fills it in during deployment.

2. **pychromecast device compatibility with specific Google Home/Nest model?**
   - What we know: pychromecast supports Google Home, Google Home Mini, Nest Mini, Nest Hub. Maintained by Home Assistant.
   - What's unclear: User's exact device model — noted in STATE.md as live-verification risk.
   - Recommendation: Gate test (`POST /api/v1/tts` → speaker speaks within 10s) is the verification. No planning blocker.

3. **gTTS first-call latency with no internet?**
   - What we know: gTTS requires internet; caching eliminates repeat calls.
   - What's unclear: Whether the Pi always has internet at brief time.
   - Recommendation: Pre-generate the empty-brief phrase (`"Good morning. Nothing scheduled today."`) in a Wave 0 setup task so the gate test doesn't depend on internet.

4. **IFTTT custom header support for `X-Webhook-Secret`?**
   - What we know: IFTTT "Make a web request" action supports custom headers.
   - What's unclear: Whether IFTTT free tier allows header customization or requires Pro.
   - Recommendation: Implement the `X-Webhook-Secret` header guard as primary; also accept `?secret=` query param as fallback (IFTTT can embed it in the URL). Reject if both are empty.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pychromecast | NOTIF-03,04,05 | Must install | 14.0.9 | None (required) |
| gTTS | NOTIF-03,04,05 | Must install | 2.5.4 | Pre-generated MP3s for common phrases |
| Google Home speaker | Gate test | Hardware (not verified) | — | None — hardware gate test |
| Internet access (Pi) | gTTS synthesis | Assumed yes | — | Cache files cover repeat calls |
| Tailscale Funnel | NOTIF-06 | Tailscale already installed | — | Router port-forward (fallback in STATE.md) |

**Missing dependencies with no fallback:**
- Google Home/Nest speaker hardware — gate test verifies, not a planning blocker.

**Missing dependencies with fallback:**
- gTTS internet dependency: mitigated by pre-generating static MP3s for the empty-brief phrase.

---

## Validation Architecture

`workflow.nyquist_validation = true` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (existing, version in `backend/pyproject.toml`) |
| Config file | `backend/pyproject.toml` (existing `[tool.pytest.ini_options]`) |
| Quick run command | `cd backend && pytest tests/test_tts.py -x` |
| Full suite command | `cd backend && pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-03 | `POST /api/v1/tts` calls TTSClient.speak with submitted text | unit (mock TTSClient) | `pytest tests/test_tts.py::test_tts_endpoint_calls_speak -x` | ❌ Wave 0 |
| NOTIF-03 | `POST /api/v1/tts` returns 200 when tts_enabled=True | unit | `pytest tests/test_tts.py::test_tts_endpoint_enabled -x` | ❌ Wave 0 |
| NOTIF-03 | `POST /api/v1/tts` returns disabled status when tts_enabled=False | unit | `pytest tests/test_tts.py::test_tts_endpoint_disabled -x` | ❌ Wave 0 |
| NOTIF-03 | `GET /api/v1/settings/tts` returns tts_enabled value | unit | `pytest tests/test_settings.py::test_get_tts_enabled -x` | ❌ Wave 0 |
| NOTIF-03 | `PUT /api/v1/settings/tts` updates tts_enabled and persists | unit | `pytest tests/test_settings.py::test_set_tts_enabled -x` | ❌ Wave 0 |
| NOTIF-04 | `_send_reminder` calls TTSClient.speak with "Reminder: {title}" | unit (mock TTSClient) | `pytest tests/test_scheduler.py::test_reminder_calls_tts -x` | ❌ Wave 0 |
| NOTIF-04 | `_send_reminder` swallows TTSClient exception (D-05) | unit | `pytest tests/test_scheduler.py::test_reminder_tts_failure_swallowed -x` | ❌ Wave 0 |
| NOTIF-04 | `_send_reminder` skips TTS when tts_enabled=False | unit | `pytest tests/test_scheduler.py::test_reminder_tts_respects_flag -x` | ❌ Wave 0 |
| NOTIF-05 | `send_daily_brief` calls TTSClient.speak with speech-formatted brief | unit (mock TTSClient) | `pytest tests/test_brief.py::test_brief_calls_tts -x` | ❌ Wave 0 |
| NOTIF-05 | `build_brief_speech` returns "Good morning. Nothing scheduled today." when empty | unit | `pytest tests/test_brief.py::test_build_brief_speech_empty -x` | ❌ Wave 0 |
| NOTIF-05 | `build_brief_speech` strips HH:MM and bullet prefix, joins with `. ` | unit | `pytest tests/test_brief.py::test_build_brief_speech_format -x` | ❌ Wave 0 |
| NOTIF-05 | `send_daily_brief` swallows TTS exception (D-05) | unit | `pytest tests/test_brief.py::test_brief_tts_failure_swallowed -x` | ❌ Wave 0 |
| NOTIF-06 | `POST /api/v1/webhooks/brief` with correct secret calls send_daily_brief | unit (mock send_daily_brief) | `pytest tests/test_tts.py::test_webhook_brief_correct_secret -x` | ❌ Wave 0 |
| NOTIF-06 | `POST /api/v1/webhooks/brief` with wrong secret returns 403 | unit | `pytest tests/test_tts.py::test_webhook_brief_wrong_secret -x` | ❌ Wave 0 |
| NOTIF-06 | `POST /api/v1/webhooks/brief` with missing secret returns 403 | unit | `pytest tests/test_tts.py::test_webhook_brief_missing_secret -x` | ❌ Wave 0 |
| (gate) | Speaker announces text within 10 seconds of POST /api/v1/tts | hardware gate test | Manual: `curl -X POST http://pi:8000/api/v1/tts -d '{"text":"hello"}'` | manual-only |
| (gate) | TTSClient.speak writes an MP3 file to tts_cache/ | unit | `pytest tests/test_tts.py::test_tts_client_caches_mp3 -x` (mock gTTS) | ❌ Wave 0 |

**Note on hardware gate test:** The actual speaker-to-audio path cannot be automated. All unit tests mock `TTSClient` at the router/scheduler boundary. The MP3 cache write is testable by mocking `gTTS` and asserting the file is created. The actual cast and audio output is a runtime/hardware gate.

### Sampling Rate

- **Per task commit:** `cd backend && pytest tests/test_tts.py tests/test_brief.py tests/test_scheduler.py tests/test_settings.py -x`
- **Per wave merge:** `cd backend && pytest`
- **Phase gate:** Full suite green + manual speaker gate test before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_tts.py` — covers NOTIF-03, NOTIF-06, cache write test
- [ ] `backend/tests/test_brief.py` — extend existing file with `test_build_brief_speech_*` and `test_brief_calls_tts` / `test_brief_tts_failure_swallowed`
- [ ] `backend/tests/test_scheduler.py` — extend existing file with reminder-TTS tests
- [ ] `backend/tests/test_settings.py` — extend existing file with `test_get_tts_enabled`, `test_set_tts_enabled`
- [ ] Pre-generated MP3: `tts_cache/` directory with empty-brief phrase MP3 for gate test fallback
- [ ] Alembic migration `0004_add_tts_enabled.py` must exist before any test using `AppSettings.tts_enabled`

---

## Project Constraints (from CLAUDE.md)

- **PowerShell / Windows dev box** — all commands run in PowerShell on Windows; Pi target is Linux/bash.
- **No comments unless WHY is non-obvious** — naming carries the load.
- **No unsolicited refactors** — touch only files needed for this phase.
- **APScheduler 3.x only** — `AsyncIOScheduler` + `SQLAlchemyJobStore`. Jobs are sync/thread-pool.
- **Single uvicorn worker** — no multi-worker concerns for in-memory state.
- **Secrets never committed** — `tts_cache/`, `.env` are gitignored; `.env.example` documents new vars.
- **uv for Python env** — `uv pip install`, not pip directly.
- **GSD workflow** — all changes through `/gsd:execute-phase`.

---

## Sources

### Primary (HIGH confidence)

- [pychromecast official README (GitHub)](https://github.com/home-assistant-libs/pychromecast/blob/master/README.rst) — `get_listed_chromecasts`, `known_hosts`, `play_media` API
- [pychromecast media_example.py (GitHub)](https://github.com/home-assistant-libs/pychromecast/blob/master/examples/media_example.py) — complete working example with exact function calls
- [gTTS PyPI 2.5.4](https://pypi.org/project/gTTS/) — current version, `gTTS(text, lang).save(path)` API
- [FastAPI StaticFiles docs](https://fastapi.tiangolo.com/tutorial/static-files/) — `app.mount` + `StaticFiles`
- [starlette.concurrency.run_in_threadpool](https://www.starlette.io/) — blocking-in-async pattern; already used in `main.py` lifespan
- [Tailscale Funnel docs](https://tailscale.com/kb/1311/tailscale-funnel) — `--set-path`, `--bg`, ports 443/8443/10000

### Secondary (MEDIUM confidence)

- [pychromecast LAN IP media URL requirement](https://rinzewind.org/blog-en/2018/how-to-send-local-files-to-chromecast-with-python.html) — Chromecast uses Google DNS, not mDNS; verified by multiple community sources
- [hmac.compare_digest docs (Python stdlib)](https://docs.python.org/3/library/hmac.html#hmac.compare_digest) — constant-time secret comparison
- WebSearch result: IFTTT "Make a web request" action supports custom headers — verify against IFTTT UI during deployment

### Tertiary (LOW confidence)

- `time.sleep(3)` duration after `play_media()` before `stop_discovery()` — community heuristic; actual safe value depends on network conditions and device model. May need tuning.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — pychromecast 14.x and gTTS 2.5.x confirmed on PyPI; FastAPI StaticFiles is bundled.
- Architecture: HIGH — all patterns derived from existing codebase and official library examples.
- Pitfalls: MEDIUM-HIGH — LAN IP requirement verified by multiple community sources; first-cast sleep duration is LOW confidence heuristic.
- Validation: HIGH — mirrors existing pytest patterns in the repo.

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (pychromecast and gTTS are stable; IFTTT free tier policy could change)
