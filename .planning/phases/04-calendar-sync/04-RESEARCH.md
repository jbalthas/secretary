# Phase 4: Calendar Sync - Research

**Researched:** 2026-06-12
**Domain:** Google Calendar API OAuth2, incremental sync (syncToken), FastAPI integration
**Confidence:** HIGH

---

## Summary

Phase 4 wires Google Calendar read-only sync into the existing FastAPI + APScheduler stack. The work has three distinct sub-domains: (1) OAuth2 token acquisition and storage with auto-refresh, (2) incremental event sync via Google's syncToken strategy running on a 5-minute APScheduler job, and (3) surfacing synced events in the Today agenda view by replacing the PLACEHOLDER_EVENTS stub in `frontend/src/lib/agenda.ts`.

The most important risk for this phase is the **7-day refresh token expiry in Google's "Testing" publishing status**. Personal Gmail accounts cannot use the "Internal" user type (Workspace-only), so the OAuth app will be External + Testing. In that mode Google revokes the refresh token after exactly 7 days. The mitigation is to publish the app to "In production" status — no app review is required as long as there are fewer than 100 users (which is always true for a personal tool). The token expiry stops once the app is published. Failing to do this before first real use means the user will be re-prompted for OAuth every week.

**Primary recommendation:** Use `google-api-python-client` + `google-auth-oauthlib` + `google-auth-httplib2` as the stack (already listed in CLAUDE.md). Store credentials in `google_token.json` (gitignored). Run the OAuth consent flow through two FastAPI endpoints (`GET /auth/google` → redirect; `GET /auth/google/callback` → exchange + store). Sync events via APScheduler every 5 minutes. Store a `CalendarEvent` SQLite table and a `CalendarSync` settings row (sync_token, credentials JSON). Swap PLACEHOLDER_EVENTS in the frontend with a real `GET /api/v1/events/today` endpoint.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAL-01 | User completes Google OAuth flow in the web UI; tokens are stored and auto-refreshed | OAuth2 web server flow via FastAPI endpoints; credentials.to_json() stored in DB or file; google-auth auto-refreshes on API call |
| CAL-02 | App syncs Google Calendar events incrementally every 5 minutes (syncToken strategy) | APScheduler interval job; events().list(syncToken=) pattern; nextSyncToken persistence |
| CAL-03 | On HTTP 410 from Google, app falls back to full re-sync automatically | Catch HttpError 410 in sync job; clear stored syncToken; re-run full sync in same call |
| CAL-04 | App sends Pushover alert if Google OAuth token is revoked (invalid_grant) | Catch HttpError 401 / google.auth.exceptions.RefreshError with "invalid_grant"; call existing PushoverClient.send() |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| google-api-python-client | 2.x (latest 2.170.0) | Google Calendar API calls | Official Google client; already in CLAUDE.md stack |
| google-auth-oauthlib | 1.x (latest 1.2.1) | OAuth2 authorization flow | Handles state, PKCE, code exchange; pairs with google-api-python-client |
| google-auth-httplib2 | 0.2.x | HTTP transport adapter | Required dependency for google-api-python-client |
| google-auth | 2.x (pulled transitively) | Credential refresh, token management | Automatically refreshes expired access tokens before each API call |

All four are already listed as the recommended stack in CLAUDE.md.

### Supporting (already in pyproject.toml, no additions needed)
| Library | Version | Purpose |
|---------|---------|---------|
| APScheduler 3.11.x | already installed | 5-minute sync job |
| httpx 0.27.x | already installed | Pushover alert on token revocation |
| SQLAlchemy 2.0 + aiosqlite | already installed | Store CalendarEvent rows + sync state |
| Alembic | already installed | Migration for new tables |

### New packages to add
```
google-api-python-client>=2.0
google-auth-oauthlib>=1.0
google-auth-httplib2>=0.2
```

**Installation:**
```bash
uv add "google-api-python-client>=2.0" "google-auth-oauthlib>=1.0" "google-auth-httplib2>=0.2"
```

---

## Architecture Patterns

### Recommended Project Structure (additions only)
```
backend/app/
├── models/
│   ├── __init__.py          # add CalendarEvent, CalendarSync
│   └── calendar.py          # new: CalendarEvent + CalendarSync models
├── routers/
│   ├── tasks.py             # existing
│   ├── auth.py              # new: /auth/google, /auth/google/callback
│   └── events.py            # new: GET /api/v1/events/today
├── services/
│   ├── pushover.py          # existing
│   └── google_calendar.py   # new: build_service(), sync_events(), full_sync()
├── schemas/
│   ├── task.py              # existing
│   └── event.py             # new: CalendarEventOut schema
└── scheduler.py             # add calendar sync job

frontend/src/
├── lib/
│   └── agenda.ts            # swap PLACEHOLDER_EVENTS → fetch /api/v1/events/today
├── pages/
│   └── Settings.tsx         # new: "Connect Google Calendar" button + status
└── types/
    └── task.ts              # add CalendarEvent interface (or new event.ts)
```

### Pattern 1: OAuth2 Web Server Flow (FastAPI)

Two endpoints handle the entire OAuth dance. The redirect_uri must match exactly what is registered in Google Cloud Console.

```python
# Source: https://developers.google.com/identity/protocols/oauth2/web-server
from google_auth_oauthlib.flow import Flow

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

def build_flow(redirect_uri: str) -> Flow:
    return Flow.from_client_secrets_file(
        "client_secret.json",
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )

# GET /auth/google
@router.get("/auth/google")
async def google_auth(request: Request):
    flow = build_flow(redirect_uri=str(request.url_for("google_callback")))
    auth_url, state = flow.authorization_url(
        access_type="offline",    # required to get refresh_token
        prompt="consent",         # forces refresh_token on every consent
        include_granted_scopes="true",
    )
    request.session["oauth_state"] = state
    return RedirectResponse(auth_url)

# GET /auth/google/callback
@router.get("/auth/google/callback")
async def google_callback(request: Request, code: str, state: str, session: AsyncSession = Depends(get_session)):
    # verify state, exchange code, persist credentials
    flow = build_flow(redirect_uri=str(request.url_for("google_callback")))
    flow.fetch_token(code=code)
    creds = flow.credentials
    # store creds.to_json() in CalendarSync row
```

**Critical:** `prompt="consent"` forces Google to return a new refresh_token on every OAuth flow. Without it, Google only returns the refresh_token on first authorization. If the token is lost and the flow is re-run without `prompt="consent"`, no refresh_token is returned.

**Session middleware:** FastAPI does not include session middleware by default. Use `starlette.middleware.sessions.SessionMiddleware` with a secret key for state CSRF protection.

### Pattern 2: Incremental Sync with syncToken

```python
# Source: https://developers.google.com/workspace/calendar/api/guides/sync
from googleapiclient.errors import HttpError
import google.auth.exceptions

def sync_calendar(sync_state: CalendarSync):
    """Runs in APScheduler thread pool (sync function, not async)."""
    creds = credentials_from_json(sync_state.credentials_json)
    service = build("calendar", "v3", credentials=creds)

    try:
        if sync_state.sync_token:
            # Incremental sync
            result = service.events().list(
                calendarId="primary",
                syncToken=sync_state.sync_token,
                singleEvents=True,
            ).execute()
        else:
            # Full sync
            result = service.events().list(
                calendarId="primary",
                singleEvents=True,
                orderBy="startTime",
                timeMin=_week_ago_rfc3339(),
            ).execute()
    except HttpError as e:
        if e.status_code == 410:
            # syncToken invalid → clear and full re-sync
            sync_state.sync_token = None
            return sync_calendar(sync_state)  # recurse once
        if e.status_code in (401, 403):
            # Token revoked → Pushover alert
            _send_revocation_alert()
            return
        raise

    # handle pagination (nextPageToken) before storing nextSyncToken
    events = result.get("items", [])
    # upsert events into CalendarEvent table
    # store result["nextSyncToken"] → sync_state.sync_token
```

**Note on credential auto-refresh:** When `creds` is built from stored JSON with a valid refresh_token, `google-auth` automatically calls the token endpoint to get a fresh access_token before the first API call. The `RefreshError` with `invalid_grant` is raised if the refresh_token itself is revoked/expired — that is the signal for CAL-04.

### Pattern 3: Detecting Token Revocation (CAL-04)

```python
import google.auth.exceptions

try:
    service.events().list(...).execute()
except google.auth.exceptions.RefreshError as e:
    if "invalid_grant" in str(e):
        # Refresh token revoked — send Pushover alert
        PushoverClient().send(
            title="Calendar sync disconnected",
            message="Google Calendar token was revoked. Re-connect at /settings."
        )
        sync_state.credentials_json = None  # force re-auth
```

### Pattern 4: DB Models

Two new SQLAlchemy models:

```python
# CalendarSync: one row, singleton settings
class CalendarSync(Base):
    __tablename__ = "calendar_sync"
    id: Mapped[int] = mapped_column(primary_key=True)
    credentials_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    sync_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

# CalendarEvent: synced events cache
class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    google_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    start_dt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_dt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "YYYY-MM-DD" for all-day
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)  # status == "cancelled"
```

**Upsert pattern:** Use `insert(...).on_conflict_do_update(index_elements=["google_id"], ...)` (SQLite supports this via SQLAlchemy's `dialect.insert`). Cancelled events from incremental sync must be deleted/marked cancelled — Google sends them with `status="cancelled"`.

### Pattern 5: Frontend — Replacing PLACEHOLDER_EVENTS

`frontend/src/lib/agenda.ts` already exports `PLACEHOLDER_EVENTS` and it's a named export used only in `buildAgenda`. The swap is:

1. Add `GET /api/v1/events/today` backend endpoint returning `CalendarEvent[]` filtered to today.
2. In `Today.tsx`, add a `useCalendarEvents()` hook (same pattern as `useTasks()`).
3. Pass events into `buildAgenda(tasks, calendarEvents, now)` — update the function signature.
4. Remove `PLACEHOLDER_EVENTS` from agenda.ts (it was explicitly designed to be swapped: see STATE.md note "[02-05]: PLACEHOLDER_EVENTS named export for Phase 4 swap").

### Anti-Patterns to Avoid

- **Storing client_secret.json in git:** Put it in `.env` as a JSON string (GOOGLE_CLIENT_SECRETS_JSON) or reference the file path from env but gitignore the file.
- **Storing credentials_json in a plain file without gitignore:** Use the DB (already gitignored as SQLite) or a gitignored file path.
- **Running sync as async:** google-api-python-client is a sync library. APScheduler 3.x runs jobs in a thread pool. Keep the sync function sync (same pattern as PushoverClient.send — Phase 03 decision).
- **Not including `prompt="consent"`:** Without it, Google omits the refresh_token on re-authorization, making recovery from token loss impossible without manually revoking in Google Cloud Console.
- **Setting OAuth app to "Testing" permanently:** Refresh tokens expire in 7 days in Testing mode. Publish to "In production" (no review needed for <100 users) before first real use.
- **Not handling pagination in full sync:** `events().list()` may return a `nextPageToken`. Must loop until `nextPageToken` is absent, collecting all events, before storing `nextSyncToken`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token refresh | Manual HTTP call to token endpoint | google-auth Credentials object | Auto-refreshes before every API call; handles expiry math |
| OAuth state param | Random string in query param | `SessionMiddleware` + `flow.authorization_url()` | Proper CSRF protection |
| 410 full re-sync | Complex state machine | Single recursive call after clearing sync_token | Google's documented pattern is simple |
| Event pagination | Custom cursor logic | `nextPageToken` loop — 10 lines | Already part of the google-api-python-client response contract |

---

## Common Pitfalls

### Pitfall 1: Refresh Token Expires in 7 Days (Testing Mode)
**What goes wrong:** User connects calendar, it works for a week, then `invalid_grant` fires daily. CAL-04 Pushover alert fires every 5 minutes.
**Why it happens:** External OAuth apps in "Testing" publishing status get 7-day refresh token lifetime by design.
**How to avoid:** Before first real use, in Google Cloud Console → OAuth consent screen → publish to "In production". For a personal app with <100 users, no review is required. Users see an "unverified app" warning but can proceed.
**Warning signs:** `invalid_grant` errors exactly 7 days after initial OAuth completion.

### Pitfall 2: No Refresh Token on Re-authorization
**What goes wrong:** Re-running the OAuth flow returns no `refresh_token`, so `credentials_json` has no refresh capability.
**Why it happens:** Google only returns refresh_token on first authorization per user+app, unless `prompt=consent` forces re-consent.
**How to avoid:** Always pass `prompt="consent"` in `authorization_url()` call.
**Warning signs:** `creds.refresh_token` is `None` after the callback.

### Pitfall 3: Cancelled Events Not Handled
**What goes wrong:** Deleted Google Calendar events remain in the local DB and keep appearing in the agenda.
**Why it happens:** Incremental sync returns cancelled events with `status="cancelled"` instead of omitting them.
**How to avoid:** In the sync upsert, check `event.get("status") == "cancelled"` → mark `cancelled=True` or delete the row.

### Pitfall 4: All-Day Events Date Parsing
**What goes wrong:** All-day events have `start.date` (YYYY-MM-DD) not `start.dateTime`. Treating them as datetime events breaks sorting and display.
**Why it happens:** Google Calendar API returns two different structures for timed vs all-day events.
**How to avoid:** Check `event["start"].get("dateTime")` first; fall back to `event["start"].get("date")` for all-day. Store as `all_day=True` + `start_date` string column.

### Pitfall 5: SessionMiddleware Secret in Production
**What goes wrong:** Using a hardcoded or weak secret_key for SessionMiddleware leaks OAuth state.
**How to avoid:** Add `GOOGLE_SESSION_SECRET` to `.env` / Settings. Generate with `secrets.token_hex(32)`.

### Pitfall 6: APScheduler Sync Job Running Async Code
**What goes wrong:** Using `await` inside an APScheduler job crashes with "no running event loop" since jobs run in threads.
**Why it happens:** APScheduler 3.x with AsyncIOScheduler runs jobs in a thread pool for non-async functions.
**How to avoid:** Keep the calendar sync job fully synchronous, same as PushoverClient pattern from Phase 3. Use a sync SQLAlchemy session (not async) inside the job, or use `asyncio.run_coroutine_threadsafe()` with the running loop. The simpler path: use a separate sync engine for the scheduler job (same DB file, different engine).

---

## Code Examples

### Full Sync Loop with Pagination
```python
# Source: https://developers.google.com/workspace/calendar/api/guides/sync
def full_sync(service, calendar_id="primary"):
    events = []
    page_token = None
    while True:
        result = service.events().list(
            calendarId=calendar_id,
            singleEvents=True,
            orderBy="startTime",
            timeMin=_ninety_days_ago_rfc3339(),
            pageToken=page_token,
        ).execute()
        events.extend(result.get("items", []))
        page_token = result.get("nextPageToken")
        if not page_token:
            sync_token = result["nextSyncToken"]
            break
    return events, sync_token
```

### Catching 410 and RefreshError
```python
from googleapiclient.errors import HttpError
import google.auth.exceptions

try:
    result = service.events().list(
        calendarId="primary",
        syncToken=stored_sync_token,
    ).execute()
except HttpError as e:
    if e.status_code == 410:
        # Full re-sync required
        events, new_sync_token = full_sync(service)
        return events, new_sync_token
    raise
except google.auth.exceptions.RefreshError as e:
    if "invalid_grant" in str(e):
        PushoverClient().send("Calendar disconnected", "Re-connect at /settings")
    raise
```

### OAuth Credentials Round-Trip
```python
import json
from google.oauth2.credentials import Credentials

def credentials_to_json(creds: Credentials) -> str:
    return creds.to_json()  # built-in method

def credentials_from_json(json_str: str) -> Credentials:
    data = json.loads(json_str)
    return Credentials(
        token=data["token"],
        refresh_token=data["refresh_token"],
        token_uri=data["token_uri"],
        client_id=data["client_id"],
        client_secret=data["client_secret"],
        scopes=data["scopes"],
    )
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `InstalledAppFlow` (runs local server) | `Flow` with FastAPI callback endpoint | Standard for web server apps | No local port needed; integrates with existing FastAPI |
| Polling with `updatedMin` | syncToken incremental sync | Google's current recommendation | Much less bandwidth; proper deletion handling |
| Storing token.json in repo | Store credentials_json in DB or gitignored file | Security best practice | No credential leaks |

---

## Open Questions

1. **Publishing status before go-live**
   - What we know: External + Testing → 7-day expiry; External + In production + <100 users → no expiry, no review
   - What's unclear: Does the user's personal Gmail account own the Google Cloud project? (Assumed yes.)
   - Recommendation: Document publishing step explicitly in Wave 0 setup tasks

2. **Sync engine for APScheduler job**
   - What we know: APScheduler jobs run in threads; async SQLAlchemy session can't be used cross-thread safely
   - What's unclear: Whether to create a separate sync engine or use `asyncio.run_coroutine_threadsafe`
   - Recommendation: Create a lightweight sync SQLAlchemy session factory for scheduler jobs only (same pattern as Alembic's sync URL in env.py)

3. **client_secret.json storage**
   - What we know: Must not be in git
   - Recommendation: Store as `GOOGLE_CLIENT_SECRETS_JSON` env var (JSON string) or as a gitignored file at a path specified in settings

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Google Cloud project + OAuth credentials | CAL-01 | Manual setup required | — | No fallback — must be created before OAuth flow works |
| google-api-python-client (PyPI) | CAL-01–04 | Not yet installed | — | No alternative |
| google-auth-oauthlib (PyPI) | CAL-01 | Not yet installed | — | No alternative |
| google-auth-httplib2 (PyPI) | CAL-01–04 | Not yet installed | — | No alternative |

**Missing dependencies with no fallback:**
- Google Cloud project with Calendar API enabled + OAuth credentials (client_secret.json) — must be set up manually before running OAuth flow. This is a manual one-time step, not automatable.
- Three PyPI packages — add to pyproject.toml in Wave 0.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x |
| Config file | backend/pyproject.toml (implicit via pytest discovery) |
| Quick run command | `cd backend && uv run pytest tests/test_calendar.py -x` |
| Full suite command | `cd backend && uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAL-01 | OAuth callback stores credentials_json in DB | unit | `pytest tests/test_calendar.py::test_callback_stores_credentials -x` | ❌ Wave 0 |
| CAL-01 | Auth endpoint returns redirect to Google | unit | `pytest tests/test_calendar.py::test_auth_redirect -x` | ❌ Wave 0 |
| CAL-02 | Incremental sync job upserts events from API response | unit (mocked API) | `pytest tests/test_calendar.py::test_incremental_sync -x` | ❌ Wave 0 |
| CAL-02 | Today endpoint returns today's events from DB | unit | `pytest tests/test_calendar.py::test_events_today -x` | ❌ Wave 0 |
| CAL-03 | 410 response triggers full re-sync | unit (mocked HttpError) | `pytest tests/test_calendar.py::test_full_resync_on_410 -x` | ❌ Wave 0 |
| CAL-04 | invalid_grant triggers Pushover alert | unit (monkeypatch PushoverClient) | `pytest tests/test_calendar.py::test_pushover_on_invalid_grant -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/test_calendar.py -x`
- **Per wave merge:** `cd backend && uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_calendar.py` — all CAL-01 through CAL-04 tests
- [ ] No conftest changes needed — existing fixture pattern covers new tests

---

## Sources

### Primary (HIGH confidence)
- [Google Calendar Sync Guide](https://developers.google.com/workspace/calendar/api/guides/sync) — syncToken strategy, 410 handling, pagination
- [Google OAuth2 Web Server Guide](https://developers.google.com/identity/protocols/oauth2/web-server) — authorization URL, callback, token refresh, invalid_grant
- [google-auth-oauthlib docs](https://googleapis.dev/python/google-auth-oauthlib/latest/reference/google_auth_oauthlib.flow.html) — Flow class API

### Secondary (MEDIUM confidence)
- [Google Cloud: When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en) — personal use <100 users exemption
- [Nango: invalid_grant causes](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked/) — Testing mode 7-day expiry explanation
- [Google Cloud: Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en) — Testing mode user limits

### Tertiary (LOW confidence — training data cross-checked)
- google-auth-oauthlib `prompt="consent"` behavior — verified by multiple sources but exact current console UI may differ

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official Google libraries; already referenced in CLAUDE.md
- Architecture: HIGH — syncToken pattern from official docs; APScheduler threading pattern from Phase 3 decisions
- Pitfalls: HIGH — 7-day token expiry verified across multiple sources; all-day event parsing verified from API docs
- OAuth flow: HIGH — web server flow is well-documented official pattern

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (Google API surface is stable; OAuth policies change rarely)
