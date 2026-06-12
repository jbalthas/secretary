# Pitfalls Research: Personal Secretary on Pi 5

**Domain:** Self-hosted IoT + scheduling + calendar sync + voice announcements
**Researched:** 2026-06-12

---

## Critical (Will Break in Prod)

### 1. Google OAuth Refresh Token Revoked After 7 Days

**What goes wrong:** If your Google Cloud OAuth consent screen is set to "Testing" with user type "External", Google revokes all refresh tokens after 7 days. The app silently fails to sync Calendar events and any dependent features stop working without an obvious error in logs.

**Why it happens:** Google enforces a 7-day token lifetime for unverified/testing-mode apps to limit exposure. There is no warning — the next refresh attempt just returns `invalid_grant`.

**Consequences:** Calendar sync stops dead. All scheduled reminders derived from Calendar events stop firing. Pushover notifications for calendar items cease.

**Warning signs:**
- `invalid_grant` errors in logs
- Calendar last-synced timestamp stops advancing
- APScheduler jobs that should have been created from calendar events missing

**Prevention:**
- Publish the OAuth consent screen to "In production" immediately (even for personal use — you can self-authorize without full Google verification for a personal-use app with your own account only)
- Store the `token_expiry` and `refresh_token` in the DB; log every refresh attempt and result
- Build a health-check endpoint that validates the token is still valid
- Alert via Pushover if a token refresh fails

**Phase:** OAuth / Calendar Sync phase — must be addressed at first auth implementation, not deferred.

---

### 2. APScheduler Jobs Lost or Doubled on Restart

**What goes wrong:** Using the default in-memory job store means all scheduled jobs are gone after a Pi reboot (power cut, OS update, accidental restart). Conversely, using SQLAlchemy persistence without `replace_existing=True` (or equivalent conflict policy) causes jobs to be added again on each startup, leading to the same job firing multiple times per interval.

**Why it happens:** APScheduler has no auto-dedup logic for jobs added at startup. If you call `scheduler.add_job(...)` unconditionally in a startup hook, each restart stacks another copy of the job.

**Consequences:**
- Duplicate Pushover notifications
- Duplicate Google Home announcements
- Duplicate calendar sync polls
- On in-memory: zero jobs after any restart

**Warning signs:**
- Multiple identical Pushover notifications arriving seconds apart
- APScheduler job count in DB growing on each restart

**Prevention:**
- Use `SQLAlchemyJobStore` with a dedicated `jobs.sqlite` (separate from application data SQLite)
- Always add startup jobs with an explicit `id=` and `replace_existing=True`
- At startup, log all existing persisted jobs before adding new ones
- Set `max_instances=1` per job to prevent concurrent overlapping executions
- Never share the job store between two scheduler instances

**Phase:** Scheduler / Core infrastructure phase.

---

### 3. SQLite "Database Is Locked" Under Concurrent Access

**What goes wrong:** FastAPI handles async HTTP requests while APScheduler fires jobs on background threads. Both access the same SQLite file simultaneously. SQLite's default journal mode uses file-level locking; concurrent writers block each other and can raise `OperationalError: database is locked`.

**Why it happens:** SQLite defaults to DELETE journal mode. APScheduler's SQLAlchemyJobStore and FastAPI's SQLAlchemy session both write. On a Pi with slow SD card I/O, lock contention windows are larger than on SSD.

**Consequences:**
- Intermittent 500 errors on API requests during scheduled job execution
- APScheduler jobs that fail silently due to DB lock at fire time
- Very hard to reproduce in dev (fast local disk hides the race)

**Warning signs:**
- `OperationalError: database is locked` in logs
- Jobs that should have run showing no evidence of execution
- Errors only appearing under load or when multiple jobs fire close together

**Prevention:**
- Enable WAL mode immediately: `PRAGMA journal_mode=WAL` on connection open
- Set a busy timeout: `PRAGMA busy_timeout=5000` (5 seconds)
- Use separate SQLite files for app data and APScheduler job store
- Configure SQLAlchemy with `connect_args={"check_same_thread": False, "timeout": 30}`
- Keep write transactions short — read-heavy queries outside transactions

**Phase:** Core infrastructure phase — WAL mode must be set before any production traffic.

---

### 4. Tailscale Funnel Required for IFTTT Webhooks (Not Just Tailscale VPN)

**What goes wrong:** Tailscale VPN alone only creates a private overlay network. IFTTT webhooks originate from IFTTT's servers on the public internet and cannot reach a Tailscale-only (non-Funnel) node. The Pi is invisible to IFTTT unless you either (a) use Tailscale Funnel to expose a public HTTPS endpoint, or (b) open a port on your router.

**Why it happens:** Common misconception that "Tailscale = remote access = webhooks work." Tailscale Funnel is a separate feature that proxies public HTTPS to a tailnet node.

**Consequences:** All Google Home → IFTTT → Pi voice command webhooks silently fail. No error on the Pi side (it never receives the request).

**Warning signs:**
- IFTTT applet shows "success" but Pi receives nothing
- No corresponding HTTP log entry in nginx for the expected path

**Prevention:**
- Use `tailscale funnel 443` to expose the webhook endpoint publicly
- Scope the Funnel to only the webhook path (nginx location block restricts other paths)
- Validate IFTTT webhook with a shared secret in the request body or header
- Alternatively: use a router port-forward to the Pi on a dedicated port (simpler but less elegant)

**Phase:** Remote access / IFTTT integration phase.

---

## Likely (Common Mistakes)

### 5. gTTS Requires Internet + Fails Silently When Google Home Is Busy

**What goes wrong:** gTTS calls the Google Translate TTS API over the internet to generate audio. If the Pi has no internet (Tailscale-only network partition, ISP hiccup) the TTS generation fails. Separately, if the Google Home speaker is already playing music or audio, pychromecast's `play_media()` call will either fail silently or interrupt playback without a clean recovery path.

**Warning signs:**
- Announcements that sometimes work, sometimes don't, with no error logged
- pychromecast `player_state` stuck in `PLAYING` when you try to cast

**Prevention:**
- Wrap gTTS calls with retry logic and a local fallback (pre-generate common phrases as static MP3s)
- Check `cast.status.display_name` / `media_controller.status.player_state` before casting; queue or skip if device is busy
- Log all TTS failures to DB for post-mortem visibility
- Cache gTTS output by text hash to avoid redundant API calls and reduce failure surface

**Phase:** TTS / announcement phase.

---

### 6. pychromecast mDNS Discovery Fails After Pi Reboot

**What goes wrong:** pychromecast uses zeroconf/mDNS (multicast UDP port 5353) to discover Cast devices. After the Pi reboots, the network may not yet have settled; mDNS queries go unanswered and the device list comes back empty. Discovery can also fail if the Pi and Google Home are on different VLANs/subnets (mDNS is not routed).

**Warning signs:**
- `No devices found` on first boot
- Works after a manual retry a few minutes later
- Never works if Pi is on a separate IoT VLAN from the speaker

**Prevention:**
- Use `known_hosts` parameter to pass the Google Home's static IP directly, bypassing mDNS discovery entirely — assign a DHCP reservation to the Google Home
- Add a startup delay in the systemd service (`ExecStartPre=/bin/sleep 15`) or use `After=network-online.target` with `Wants=network-online.target`
- If on separate VLANs, either set up mDNS reflection (Avahi repeater) or use the static IP approach

**Phase:** TTS / announcement phase.

---

### 7. SD Card Wear from SQLite Writes

**What goes wrong:** Frequent small SQLite writes (APScheduler job updates, calendar sync timestamps, reminder state changes) cause write amplification on SD cards. SD cards have limited P/E cycle endurance and no hardware TRIM support equivalent to SSDs. A busy scheduler writing every minute can degrade a card in months.

**Warning signs:**
- Filesystem errors in `dmesg`
- Read-only remount events in journald
- SD card appearing corrupted after power loss

**Prevention:**
- Enable WAL mode (reduces write amplification by batching)
- Add `commit=600` to ext4 mount options in `/etc/fstab` for the data partition to reduce flush frequency
- Move the SQLite files to a USB SSD or USB thumb drive — Pi 5 boots from SD but can store app data on USB
- Enable `noatime` (already default on Pi OS) and consider `lazytime`
- Take weekly DB backups to a remote location via a cron job or APScheduler job

**Phase:** Infrastructure / deployment phase.

---

### 8. systemd Service Starts Before Network Is Ready

**What goes wrong:** FastAPI starts, APScheduler fires, and the first Google Calendar sync or Tailscale connection attempt happens before the network stack is fully up. The attempt fails and depending on retry logic, the app may mark the integration as failed and not retry until the next scheduled window (potentially hours later).

**Warning signs:**
- Services fail in journald on boot but work fine when restarted manually
- `Connection refused` or DNS resolution errors in logs within 5-10 seconds of boot

**Prevention:**
```ini
[Unit]
After=network-online.target time-sync.target tailscaled.service
Wants=network-online.target time-sync.target
```
- Also enable `systemd-networkd-wait-online` or equivalent
- Build startup retry logic with exponential backoff into the app's integration clients (don't assume boot-time network access)

**Phase:** Deployment / systemd hardening phase.

---

## Gotchas (Surprising Behavior)

### 9. Google Calendar Sync Token Invalidation

**What goes wrong:** Google Calendar incremental sync uses a `syncToken` to fetch only changed events. This token becomes invalid if: more than a certain period passes without a sync, you request a full sync, or Google invalidates it server-side (undocumented, happens occasionally). When the token is invalid, the API returns HTTP 410 Gone. Apps that don't handle 410 crash or silently stop syncing.

**Prevention:**
- Always catch HTTP 410 on calendar list/event syncs and fall back to a full re-sync
- Store the last successful sync timestamp alongside the token
- Log 410 events as a warning, not an error — they are expected and recoverable

**Phase:** Calendar sync phase — handle at first implementation.

---

### 10. IFTTT Webhook Latency Is Non-Deterministic (5–60+ Seconds)

**What goes wrong:** IFTTT processes webhook triggers asynchronously. "Hey Google, remind me to take meds" → IFTTT applet → Pi webhook can take anywhere from 2 seconds to over a minute depending on IFTTT queue depth. Your system cannot assume near-real-time delivery for time-sensitive commands.

**Warning signs:**
- Commands that work "eventually" but feel broken in interactive use
- Log timestamps showing 30-60 second gaps between voice command and Pi receipt

**Prevention:**
- Design IFTTT-triggered flows to be edge-triggered (set a flag, schedule an action) rather than time-critical operations
- For time-critical voice commands, consider using Google Home Routines that trigger a local Home Assistant webhook if you later expand the stack
- Show last-received timestamp in the React dashboard so the delay is visible

**Phase:** IFTTT integration phase — set expectations in design, not a bug to fix.

---

### 11. APScheduler AsyncIOScheduler vs BackgroundScheduler in FastAPI

**What goes wrong:** FastAPI is async. `BackgroundScheduler` runs jobs in threads separate from the event loop. If a job calls `async` functions (e.g., an async SQLAlchemy session), calling them from a thread context requires `asyncio.run()` or `loop.run_until_complete()` which breaks if the event loop is already running (which it is under uvicorn).

**Prevention:**
- Use `AsyncIOScheduler` with FastAPI to run jobs inside the event loop
- Or use `BackgroundScheduler` with strictly synchronous job functions (no `async def`, no `await`)
- Do not mix: never `await` inside a `BackgroundScheduler` job or call sync DB functions blocking the event loop from an `AsyncIOScheduler` job without `run_in_executor`

**Phase:** Core scheduler setup phase.

---

### 12. Pushover API Rate Limit (10,000 Messages/Month Free Tier)

**What goes wrong:** Misconfigured reminder logic (e.g., a job that fires every minute instead of once) can exhaust the free Pushover limit quickly. At 10,000/month the daily budget is ~333 messages — easy to blow through during debugging.

**Prevention:**
- Add a dedup check: store last-sent message hash + timestamp in DB; skip if identical message was sent within N minutes
- Use Pushover's priority -2 (no notification, stored only) during development/testing
- Monitor message count in the React dashboard

**Phase:** Notification phase.

---

## Phase Mapping

| Pitfall | Phase to Address |
|---------|-----------------|
| OAuth refresh token 7-day expiry | Phase: Google Auth setup — publish to Production immediately |
| APScheduler job duplication / loss | Phase: Core scheduler infrastructure |
| SQLite WAL mode / locking | Phase: Core infrastructure — before any writes |
| Tailscale Funnel for IFTTT webhooks | Phase: Remote access + IFTTT integration |
| gTTS internet dependency + busy speaker | Phase: TTS / voice announcement |
| pychromecast mDNS discovery | Phase: TTS / voice announcement |
| SD card wear | Phase: Deployment hardening |
| systemd startup ordering | Phase: Deployment / service setup |
| Calendar sync token 410 handling | Phase: Calendar sync implementation |
| IFTTT latency expectations | Phase: IFTTT design (accept, don't fix) |
| AsyncIOScheduler vs BackgroundScheduler | Phase: Core scheduler infrastructure |
| Pushover rate limit dedup | Phase: Notification implementation |

---

## Sources

- [Google OAuth invalid_grant and 7-day refresh token expiry](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked/)
- [APScheduler FAQ — duplicate jobs, persistence](https://apscheduler.readthedocs.io/en/3.x/faq.html)
- [APScheduler duplicate job issue #559](https://github.com/agronholm/apscheduler/issues/559)
- [SQLite WAL mode](https://blog.pecar.me/sqlite-wal/)
- [FastAPI + APScheduler SQLite OperationalError #499](https://github.com/agronholm/apscheduler/issues/499)
- [SQLite concurrency — abusing SQLite](https://blog.skypilot.co/abusing-sqlite-to-handle-concurrency/)
- [Tailscale Funnel docs](https://tailscale.com/kb/1213/webhooks)
- [pychromecast device discovery](https://github.com/home-assistant-libs/pychromecast/blob/master/pychromecast/discovery.py)
- [pychromecast mDNS zeroconf fix](https://community.home-assistant.io/t/solved-pychromecast-not-connecting-to-devices-zeroconf-issue/617646)
- [SD card wear on Raspberry Pi forums](https://forums.raspberrypi.com/viewtopic.php?t=298025)
- [Extending SD card life](https://domoticproject.com/extending-life-raspberry-pi-sd-card/)
- [Google Calendar push notifications reliability](https://developers.google.com/workspace/calendar/api/guides/push)
- [Engineering Google Calendar sync complexity](https://codexconversation.substack.com/p/engineering-google-calendar-sync)
- [IFTTT reliability improvements 2025](https://ifttt.com/explore/performance-reliability-improvements)
