# Phase 6: Google Home TTS - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Announce task reminders and the daily brief on the Google Home speaker **in addition to** the existing Pushover notifications. Add an ad-hoc `POST /api/v1/tts` endpoint with a web-UI trigger so the user can make the speaker say arbitrary text. Add a webhook endpoint so a Google Home morning routine (via IFTTT) can trigger the daily brief.

Pushover remains the source-of-truth channel; Google Home TTS is an additive, best-effort second channel. Voice *input* (Google Home → "add task") is out of scope (deferred to v2). Calendar/task logic is unchanged.

Covers requirements: **NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06**.

</domain>

<decisions>
## Implementation Decisions

> The user selected "You decide" for all gray areas. The decisions below are Claude's
> recommended defaults, grounded in existing codebase patterns and prior-phase decisions.
> They are LOCKED for planning unless the user overrides before `/gsd:plan-phase`.

### Announcement wording
- **D-01:** Task reminders are spoken as `"Reminder: {title}"`. If the task has a non-empty description, append it: `"Reminder: {title}. {description}"`. Priority is NOT read aloud.
- **D-02:** The daily brief uses a **separate spoken formatter** (`build_brief_speech()` or equivalent) — distinct from the Pushover text body produced by `build_brief_body()`. The spoken version: opens with `"Good morning."`, strips the `• ` bullet markers and `HH:MM` column formatting, and joins items into natural sentences separated by `". "`. When nothing is scheduled, it says `"Good morning. Nothing scheduled today."`
- **D-03:** Ad-hoc TTS (`POST /api/v1/tts`) speaks the exact text the user submits, verbatim — no wrapping phrase.

### Delivery & failure behavior
- **D-04:** TTS fires **alongside** Pushover at the same hook points (`scheduler.py::_send_reminder` for reminders, `services/brief.py::send_daily_brief` for the brief). Pushover is sent first/independently.
- **D-05:** TTS is **best-effort**: any cast/synthesis failure (speaker unreachable, gTTS offline, network error) is caught, logged, and swallowed. A TTS failure MUST NOT raise out of the reminder/brief job or block the Pushover send.
- **D-06:** No secondary "speaker unreachable" Pushover alert in v1 — Pushover already delivered the actual content, so a failure is non-critical.
- **D-07:** Add a single global **`tts_enabled`** boolean to `AppSettings` (default **true**), surfaced as a toggle in the Settings UI. When false, all Google Home announcements (reminders + brief) are skipped; Pushover is unaffected. Quiet hours / per-item toggles are deferred.

### Ad-hoc UI + device targeting
- **D-08:** Add a **"Google Home" card** to `frontend/src/pages/Settings.tsx`, mirroring the existing Daily Brief card pattern: a text input + a **"Speak"** button that calls `POST /api/v1/tts`, plus the `tts_enabled` toggle. Use the same `fetch`-based hook pattern as `useBriefSettings.ts`.
- **D-09:** Target speaker is configured in **`.env`** via new settings on `config.py` (e.g. `google_home_ip`, optional `google_home_name`). This matches the prior decision to use a static DHCP reservation + `known_hosts=[<ip>]`. Single device for v1; speaker groups are deferred.

### Endpoint security
- **D-10:** The **routine-trigger brief webhook** (NOTIF-06) requires a **shared-secret token** (env `webhook_secret`, checked via query param or header), because Google Home routines / IFTTT call it from **outside** the Tailscale boundary. Reject with 401/403 on mismatch.
- **D-11:** `POST /api/v1/tts` and the Settings UI calls stay protected by the **Tailscale network boundary only** — consistent with every other existing endpoint (the app has no per-request app auth). No extra token on `/api/v1/tts`.

### Claude's Discretion
- Exact module layout for the TTS/cast service (e.g. `services/tts.py` + `services/cast.py` vs combined) — follow the `PushoverClient` service shape.
- How generated MP3s are hosted so the Google Home can fetch them (static mount on FastAPI/nginx vs pychromecast media server) — **researcher to determine**; this is the main technical unknown.
- gTTS cache directory location and cache-key hashing scheme (decision already set: hash by text).
- Exact spoken phrasing of natural-language brief beyond D-02 (e.g. whether to expand "09:00" → "9 AM").
- Naming of the webhook route (e.g. `POST /api/v1/tts/brief` vs `POST /api/v1/webhooks/brief`).
- Settings-card visual styling (reuse existing `CARD_STYLE` / `SECTION_LABEL_STYLE`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs/ADRs exist — requirements are fully captured in the decisions above and the
roadmap. The references below are the in-repo files that define the patterns and integration
points this phase must follow.

### Integration / hook points (where TTS plugs in)
- `backend/app/scheduler.py` — `_send_reminder()` is where reminder TTS is added alongside Pushover; `schedule_daily_brief()` / `schedule_routine()` show the brief/routine job wiring.
- `backend/app/services/brief.py` — `send_daily_brief()` and `build_brief_body()`; the spoken formatter (D-02) lives here and reuses the same task/event query.

### Patterns to mirror
- `backend/app/services/pushover.py` — `PushoverClient.send()` is the canonical sync-`httpx`/blocking service shape to mirror for the cast/TTS service (APScheduler 3.x runs jobs in a thread pool, not async).
- `backend/app/routers/settings.py` — router + `AppSettings` get/put pattern to mirror for the `tts_enabled` setting and the TTS endpoints.
- `backend/app/config.py` — pydantic-settings `Settings` class; add `google_home_ip`, `webhook_secret`, etc. here.
- `backend/app/main.py` — `lifespan` startup + `app.include_router(...)`; register the new TTS router and any static MP3 mount here.
- `frontend/src/pages/Settings.tsx` + `frontend/src/hooks/useBriefSettings.ts` — card layout + fetch-hook pattern to mirror for the Google Home card and Speak action.

### Models / migrations
- `backend/app/models/__init__.py` (`AppSettings`) — add `tts_enabled` column; Alembic migration required (project uses Alembic, WAL mode).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PushoverClient` (`services/pushover.py`): direct template for a synchronous TTS/cast client.
- `AppSettings` get/put flow (`routers/settings.py`): template for the `tts_enabled` toggle endpoint and the Settings hook.
- Settings page card components (`pages/Settings.tsx`: `CARD_STYLE`, `SECTION_LABEL_STYLE`, Daily Brief card) and `useBriefSettings.ts`: directly reusable for the Google Home card + Speak button.
- `build_brief_body()` (`services/brief.py`): the spoken formatter reuses its task/event query and data shaping.

### Established Patterns
- Scheduler jobs run **synchronously in a thread pool** → TTS service must be blocking/sync, no `await`.
- Single uvicorn worker (avoids duplicate APScheduler fires) — safe to assume one process for any in-memory/media-server state.
- Services derive a sync DB URL by stripping `+aiosqlite` (`brief.py`, `scheduler.py`).
- Config via `pydantic-settings` reading `.env`; secrets never committed (add `.env.example` entries).
- API endpoints are unauthenticated at the app layer; security is the Tailscale boundary — which is why the externally-reachable webhook needs its own shared secret (D-10).

### Integration Points
- Reminder announce: inside/after `scheduler._send_reminder()`.
- Brief announce: inside/after `services.brief.send_daily_brief()` (also covers routine-triggered briefs, since routines call `send_daily_brief`).
- New router registered in `main.py`; MP3 hosting likely mounted in `main.py` / nginx.
- New `.env` keys consumed in `config.py`.

</code_context>

<specifics>
## Specific Ideas

- Pushover is the reliable channel; Google Home is an enhancement. Never let the speaker integration degrade or block notification delivery (D-05).
- Reuse the Daily Brief Settings card almost verbatim for the Google Home card to keep the UI consistent.

</specifics>

<risks>
## Live-Verification Risks (carried from STATE.md)

- **pychromecast device compatibility** — not yet verified against the user's specific Google Home/Nest device. Fallback noted in prior research: Home Assistant. This is a runtime/hardware risk, not a planning blocker; the gate test (`POST /api/v1/tts` → speaker speaks within 10s) is the verification.
- **gTTS requires internet** — mitigated by caching + pre-generated static MP3s for common phrases (prior decision).

</risks>

<deferred>
## Deferred Ideas

- Quiet hours / time-windowed muting of Google Home announcements — v2.
- Per-reminder or per-routine TTS opt-in (vs the single global toggle) — v2.
- Speaker groups / multi-device targeting — v2.
- "Speaker unreachable" failure alerting via Pushover — not needed in v1 (D-06).
- Voice *input* (Google Home → add task via IFTTT) — already deferred to v2 in REQUIREMENTS.md.

</deferred>

---

*Phase: 06-google-home-tts*
*Context gathered: 2026-06-14*
