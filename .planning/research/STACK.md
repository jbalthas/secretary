# Stack Research

**Project:** My Secretary (self-hosted personal assistant, Raspberry Pi 5)
**Researched:** 2026-06-12 (v1) / 2026-06-15 (v2.0 addendum)

---

## Recommended Stack

### Runtime & OS

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Raspberry Pi OS (Bookworm) | Debian 12 | Host OS | Stable, well-supported on Pi 5, 64-bit default |
| Python | 3.12 | Backend runtime | Ships via `deadsnakes` PPA or manual build on Bookworm; 3.11 is Bookworm default but 3.12 is current stable and fully Pi 5 compatible. Avoid 3.13 — Raspberry Pi OS Trixie isn't production-stable yet. |

### Backend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| FastAPI | 0.128.x | API framework | Async-native, automatic OpenAPI docs, Pydantic v2 built-in. Install with `fastapi[standard]` to include uvicorn. |
| Uvicorn | latest (via fastapi[standard]) | ASGI server | Standard pairing with FastAPI; single worker is fine for personal use |
| Pydantic | v2 (bundled with FastAPI 0.100+) | Validation/serialization | Required by FastAPI; v2 is significantly faster than v1 |
| SQLAlchemy | 2.0.x | ORM + async DB access | Use async engine (`create_async_engine`) + `AsyncSession`; pairs with aiosqlite |
| aiosqlite | 0.20.x | Async SQLite driver | Required for SQLAlchemy async with SQLite backend |
| Alembic | 1.13.x | Schema migrations | Even for personal projects, migrations prevent manual schema surgery |
| APScheduler | 3.11.x | Cron/interval jobs | **Use 3.x, not 4.x** — v4 is still alpha (`4.0.0a6`), explicitly not production-ready per maintainer. 3.11.2 is the latest stable. |

### Google Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| google-api-python-client | 2.x | Google Calendar API | Official Google client library |
| google-auth-oauthlib | 1.x | OAuth2 flow | Handles token refresh; store tokens in `.env`-managed file, not git |
| google-auth-httplib2 | 0.2.x | HTTP transport | Required dependency for google-api-python-client |

**Google Home → Pi (voice trigger):** IFTTT remains the pragmatic choice for "voice phrase → webhook". The native Google Home app still does not support outbound webhooks in routines without a third-party bridge. IFTTT free tier supports this use case (1 applet: Google Assistant trigger → Webhooks). Make (formerly Integromat) is a paid alternative with more flexibility but unnecessary here.

**Pi → Google Home (TTS announcements):** Use `pychromecast` + `gTTS`. Pattern: generate MP3 via gTTS, serve it from FastAPI on a local URL, cast the URL to the Chromecast device via pychromecast. Known issue: first-cast delay of 10-30s due to device wake; acceptable for a reminder use case. The `googlehomepush` wrapper library simplifies this but is less maintained — use pychromecast directly.

| Technology | Version | Purpose |
|------------|---------|---------|
| pychromecast | 14.x | Cast audio to Google Home |
| gTTS | 2.5.x | Generate TTS MP3 from text |

### Notifications

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| requests or httpx | httpx 0.27.x | Pushover API calls | Pushover has no official Python SDK; call the REST API directly. Use httpx (async) to stay consistent with FastAPI's async model. |

### Frontend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.2.x | UI framework | Current stable. React 19 adds Actions and `use()` — no breaking changes from 18 for a new project. |
| Vite | 8.x | Build tool + dev server | Current stable. Requires Node 20.19+ or 22.x. Oxc-based transforms in v8 = smaller installs, faster builds. |
| Node.js | 22 LTS | Frontend toolchain | Required for Vite 8; 22 is the active LTS line. Not installed on Pi — build on dev machine and `rsync` dist/ to Pi, or install Node on Pi for in-place builds. |

**Recommended pattern:** Build the React app on your dev machine, output to `dist/`, and serve `dist/` as static files from FastAPI (`app.mount("/", StaticFiles(directory="dist"), name="static")`). No Node.js needed on the Pi at runtime.

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| nginx | latest stable (1.26.x) | Reverse proxy | Lower RAM than Caddy (C vs Go), which matters on Pi; handles HTTPS termination and static file serving. For Tailscale-only access, HTTPS is optional (Tailscale encrypts the tunnel), but useful for the local LAN. |
| Tailscale | latest | Remote access | Preferred over port forwarding; no open ports; use `tailscale serve` or `tailscale funnel` for optional HTTPS. |
| systemd | (OS-provided) | Process management | Standard on Raspberry Pi OS; no Docker overhead needed for a single-service personal project. |

### Python Environment

Use `uv` (not pip/virtualenv) for dependency management. It's significantly faster and handles venv creation in one step. Install via `curl -LsSf https://astral.sh/uv/install.sh | sh`.

```
uv venv .venv
uv pip install fastapi[standard] sqlalchemy[asyncio] aiosqlite alembic apscheduler \
    google-api-python-client google-auth-oauthlib google-auth-httplib2 \
    pychromecast gTTS httpx
```

---

## v2.0 Stack Addendum — Ingest, Organize, Guide

> Everything below is additive to the v1 stack. The base stack (FastAPI, SQLAlchemy 2.0,
> Alembic, Pydantic v2, React 19 + Vite 8) is already in place and must not be replaced.
> No server-side LLM SDK is added in v2.0 — the LLM runs externally; the secretary only
> receives a structured JSON payload.

### (1) Import Contract — Versioned JSON Schema + Validation

**Decision: Reuse Pydantic v2. Do NOT add jsonschema.**

Pydantic v2 is already present (bundled with FastAPI). It covers every need for the import
contract without an additional dependency:

- `model_json_schema()` on a Pydantic `BaseModel` emits a JSON Schema Draft 2020-12
  document. Publish this as a static artifact (e.g., `GET /api/v1/ingest/schema`) so the
  user can paste it into any LLM's context.
- `model_validate_json()` / `model_validate()` validates the incoming payload against the
  Pydantic model at the endpoint, raising structured `ValidationError` with field-level
  messages that the UI can display.
- Versioning strategy: embed a `schema_version: Literal["1"]` field (a plain `str` literal)
  at the top level of the payload model. When v2 of the schema ships, fork to a
  `Literal["2"]` model and use a `Union` discriminated on `schema_version`. Pydantic v2's
  discriminated unions handle this cleanly without extra libraries. Bake the version field
  in from day one — retrofitting it later is painful.

**What NOT to add:** `jsonschema` (PyPI, 4.26.0) — it validates data against a raw JSON
Schema dict. Since Pydantic v2 both defines and validates the schema in a single model
class, `jsonschema` would be redundant and add ~6MB of dependencies. Similarly, do not add
`pydantic-discriminated` (third-party) — Pydantic v2 natively supports discriminated unions
via `Annotated[Union[...], Field(discriminator="schema_version")]`.

**What NOT to add:** Any Anthropic or OpenAI SDK — the LLM is external to the server.

**Confidence:** HIGH — Pydantic v2 JSON schema generation and discriminated unions are
official, documented, stable features. Verified against pydantic.dev docs.

### (2) Goals Entity — SQLAlchemy Model + Alembic Migration

**Decision: Reuse SQLAlchemy 2.0 + Alembic. No new dependencies.**

The Goals entity is a standard SQLAlchemy `DeclarativeBase` model alongside the existing
Task/Routine/CalendarEvent models. Key design decisions:

- **Goal → Task relationship:** `Task` gains a nullable `goal_id: Mapped[Optional[int]]`
  FK column pointing to `goals.id`. One goal can have many tasks. Use `lazy="selectin"`
  on the `relationship()` because async SQLAlchemy prohibits lazy-loading in an async
  context without `AsyncAttrs` or explicit `selectin` strategy.
- **Goal → Routine relationship:** Same FK pattern on `Routine.goal_id`. Routines support
  habits (daily workout, reading) that serve a goal.
- **Progress:** Progress is derived, not stored — compute it from the ratio of completed
  tasks linked to the goal. No separate progress table needed at this scale.
- **Migration:** Every new column and table goes through Alembic (`alembic revision
  --autogenerate`). Do NOT use `Base.metadata.create_all()` — existing policy.
- **Migration steps for v2.0:** (a) `goals` table, (b) `ADD COLUMN goal_id` on `tasks`,
  (c) `ADD COLUMN goal_id` on `routines`. Three separate migration files for rollback
  clarity.

**What NOT to add:** No separate graph or adjacency-list library for goal hierarchies —
a single `parent_goal_id` self-referential FK on `goals` covers the simple case if needed
later. Do not add it now; YAGNI.

**Confidence:** HIGH — SQLAlchemy 2.0 async M:1 relationships with `selectin` loading are
officially documented and stable. Alembic migration pattern is already used in the project.

### (3) Day Auto-Organize / Time-Blocking Planner

**Decision: Hand-rolled greedy interval-fill algorithm. No new scheduling library.**

The planner has a specific, bounded shape: calendar events are fixed blocks; tasks need to
be inserted into free slots; the result is a proposed schedule (list of time-blocks), not
committed until the user approves. This does not require a library:

**Algorithm (pure Python, O(n log n)):**

1. Load today's `CalendarEvent` rows from the DB (already synced, already sorted by
   `start_time`).
2. Build a sorted list of free intervals between events, bounded by a configurable day
   window (e.g., 08:00–20:00).
3. For each pending task with an estimated duration (from the Goal/Ingest payload), greedily
   assign it to the earliest free slot that fits.
4. Return a `ProposedSchedule` Pydantic model — a list of `TimeBlock` items (each tagged
   as `calendar_event`, `task`, or `free`) — without writing anything to the DB.
5. `POST /api/v1/schedule/approve` commits approved blocks (e.g., sets `task.scheduled_at`).

**Why not a library:**

- `PuLP` (linear programming): Solves optimal scheduling but is an ~8MB dependency with a
  C extension. Overkill — we do not need optimality, just a reasonable greedy fill.
- `timeboard`: Business calendar library focused on workshifts/payroll schedules. Wrong
  abstraction for free-slot insertion.
- `APScheduler`: Already present but for cron/reminder jobs, not day-planning.
- `ortools` (Google OR-Tools): Heavy C++ backed library. Massively overkill for one user's
  daily schedule.

**New field on Task required:** `estimated_minutes: Optional[int]` — added via Alembic
migration. Without duration estimates, the planner cannot place tasks. The ingest payload
should carry this field for tasks originating from LLM output.

**Confidence:** HIGH for hand-rolled approach — greedy interval-fill is a classic
O(n log n) algorithm with no external dependencies. The complexity here is product
design (handling overlaps, priorities, buffer time), not algorithmic difficulty.

### (4) Frontend Ingest Preview/Confirm UI

**Decision: Reuse React 19 + existing patterns. No new frontend library needed.**

The ingest UI has three states: (a) input (paste textarea + file upload), (b) preview
(structured diff view of what will be created), (c) confirm (POST to ingest endpoint).

**Input:** A `<textarea>` for paste and an `<input type="file" accept=".json">` with a
`FileReader` callback. Both funnel into the same `handlePayload(jsonString)` function.
No library needed — the File API is native.

**Validation feedback:** Call `POST /api/v1/ingest/validate` (dry-run, no DB writes) and
display the FastAPI/Pydantic `ValidationError` detail array as inline field errors. React
state is sufficient for this; no form library is needed given the UI is a single-page
wizard.

**Preview rendering:** Render the validated payload as a structured list: goals to create,
tasks to create (grouped by goal), routines to create. Use existing inline-style component
pattern from the project. No diff library needed — this is a "new items preview", not a
code diff.

**Confirm:** A single `POST /api/v1/ingest/confirm` with the validated payload. Disable
the button during submission. Show success/error result. React `useState` + `fetch` is
sufficient.

**Day-organize proposal view:** Display `ProposedSchedule` time-blocks in a vertical
timeline (divs with proportional heights, like the existing agenda view). An approve/reject
per-block interaction or a single "approve all" button. No calendar component library
needed for this scope.

**What NOT to add:**
- `react-hook-form` or `formik` — single-purpose wizard, not a form-heavy app.
- `react-query` or `tanstack-query` — the existing `fetch`-based hooks are sufficient;
  adding a data-fetching library mid-project for two new endpoints is not worth the churn.
- `react-dropzone` — the native `<input type="file">` plus a `dragover`/`drop` handler on
  a `<div>` is 20 lines and has no dependency weight.
- Any date-picker component — task scheduling for the day plan uses the proposed slots from
  the backend, not user-picked times.
- Any LLM client library — the LLM is external; the UI only handles the emitted payload.

**Confidence:** HIGH — all patterns are standard React 19, native browser APIs, and
existing project conventions. No novel frontend territory.

---

## v2.0 Installation Delta

No new Python packages are required. The existing `uv pip install` command covers all
v2.0 needs because Pydantic v2, SQLAlchemy 2.0, and Alembic are already installed.

The only code additions are:
- New Pydantic models (ingest contract, `ProposedSchedule`, `TimeBlock`)
- New SQLAlchemy models (`Goal`)
- New Alembic migration files (3 migrations)
- New FastAPI routes (`/ingest/*`, `/schedule/*`, `/goals/*`)
- New React components (IngestWizard, ProposedScheduleView, GoalList)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Scheduler | APScheduler 3.x | APScheduler 4.x | v4 is alpha, breaking API, no migration path, maintainer explicitly says not production-ready |
| Scheduler | APScheduler 3.x | Celery | Needs a broker (Redis/RabbitMQ) — total overkill for single-node personal use |
| Scheduler | APScheduler 3.x | `schedule` (PyPI) | No persistence, no cron expressions, too simple for routines that must survive reboots |
| ORM | SQLAlchemy 2.0 | raw aiosqlite | SQLAlchemy gives Alembic migrations and cleaner model definitions at minimal overhead for this scale |
| ORM | SQLAlchemy 2.0 | Tortoise ORM | Less mature, smaller ecosystem, no strong advantage over SA 2.0 |
| Database | SQLite | PostgreSQL | No justification for the ops overhead on a personal single-user Pi app |
| Reverse proxy | nginx | Caddy | Caddy uses more RAM (Go runtime) and auto-HTTPS is unnecessary if using Tailscale for all remote access |
| Reverse proxy | nginx | Traefik | Designed for container orchestration; excessive complexity here |
| Google Home voice → Pi | IFTTT | Custom Google Action | Building a Google Action requires a public HTTPS endpoint (or ngrok) and significant boilerplate for a personal-use phrase trigger |
| Google Home voice → Pi | IFTTT | Make (Integromat) | Paid for the webhook tier; IFTTT free tier is sufficient |
| Pi → Google Home TTS | pychromecast + gTTS | Home Assistant | Full Home Assistant stack is too heavy for this project; we'd import a dependency bigger than the project itself |
| Notifications | Pushover | ntfy (self-hosted) | Additional service to run and maintain; Pushover's $5 one-time fee eliminates that burden |
| Notifications | Pushover | Gotify | Same concern as ntfy; another daemon, more moving parts |
| Frontend | React + Vite | Next.js | SSR adds unnecessary complexity for a personal dashboard; React SPA served as static files is simpler to deploy on Pi |
| Frontend | React + Vite | SvelteKit | Would work fine, but React has better ecosystem for UI component libraries if needed later |
| Python env | uv | pip + venv | pip is slower; uv is now the standard recommendation for new Python projects |
| Python env | uv | Poetry | Poetry is slower than uv and adds lockfile complexity with no clear benefit here |
| JSON validation | Pydantic v2 (existing) | jsonschema 4.26.0 | Redundant — Pydantic v2 already validates and generates schema; jsonschema adds ~6MB for no benefit |
| JSON validation | Pydantic v2 (existing) | cerberus | Unmaintained since 2022; inferior to Pydantic v2 in every dimension |
| Day planner | Hand-rolled greedy | PuLP (LP solver) | 8MB C-extension dependency; optimal scheduling not needed for single-user day planning |
| Day planner | Hand-rolled greedy | ortools | Heavy C++ library; massive overkill |
| Day planner | Hand-rolled greedy | timeboard | Wrong abstraction (business calendar/workshifts, not free-slot insertion) |
| Frontend ingest | Native File API + textarea | react-dropzone | 20 lines of native code replaces the library for this use case |
| Frontend ingest | Existing fetch hooks | tanstack-query | Mid-project introduction for two endpoints adds churn without benefit |
| Server-side LLM | (none — external flow) | anthropic SDK | No server-side LLM in v2.0; user pastes LLM output into the secretary |

---

## What NOT to Add (Explicit v2.0 Blocklist)

| Avoid | Why |
|-------|-----|
| `anthropic` / `openai` Python SDK | LLM is external in v2.0; server never calls an LLM |
| `jsonschema` (PyPI) | Pydantic v2 covers schema generation and validation already |
| `PuLP` | LP solver is architectural overkill for greedy day planning |
| `ortools` | C++ solver, 50MB+, completely unnecessary |
| `react-hook-form` / `formik` | Single-page wizard; React state is sufficient |
| `tanstack-query` | Mid-project addition for two endpoints; existing fetch pattern is fine |
| `react-dropzone` | Native File API is sufficient |
| APScheduler 4.x | Alpha; explicitly not production-ready |
| Any goal "scoring" ML library | No ML in v2.0; progress is task-completion ratio |

---

## Pi 5 Specific Notes

**Architecture:** Pi 5 runs `aarch64` (arm64). All recommended libraries are pure Python or have aarch64 wheels on PyPI — no compilation surprises expected.

**Python version:** Raspberry Pi OS Bookworm ships Python 3.11. Install 3.12 via the deadsnakes PPA:
```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt install python3.12 python3.12-venv
```
Alternatively, `uv python install 3.12` installs a standalone Python 3.12 binary without touching the system Python.

**RAM:** Pi 5 has 4-8GB RAM. nginx + uvicorn + the full Python app stack will consume under 300MB at idle. No memory pressure for this workload.

**Storage:** Use a quality SD card or, ideally, boot from USB SSD. SQLite on SD card is fine for personal workloads (low write frequency), but SSD eliminates SD card wear concerns entirely.

**GPIO / hardware:** Not used in this project. No Pi-specific hardware libraries needed.

**Chromecast discovery:** pychromecast uses mDNS/Zeroconf for device discovery. This works on the local LAN. When accessing via Tailscale from a remote device, the Pi itself initiates the Chromecast cast (which is always local), so remote TTS still works correctly.

**Tailscale on Pi OS:** Install via `curl -fsSL https://tailscale.com/install.sh | sh`. For nginx + Tailscale, bind nginx to the Tailscale interface IP, not `0.0.0.0`, to avoid exposing the web UI to the broader LAN if desired.

**Systemd service:** Run uvicorn as a systemd service with `Restart=on-failure` and `RestartSec=5`. Do not run as root; create a dedicated `secretary` user.

---

## Confidence Levels

| Component | Confidence | Notes |
|-----------|------------|-------|
| FastAPI 0.128.x | HIGH | Version confirmed on PyPI; stable, actively maintained |
| Python 3.12 on Pi OS | HIGH | Multiple sources confirm installable; 3.11 is default, 3.12 available via deadsnakes |
| APScheduler 3.11.x (not 4.x) | HIGH | PyPI and docs confirm 4.x is alpha; 3.11.2 is latest stable |
| SQLAlchemy 2.0 async | HIGH | Official docs + multiple 2025-2026 articles confirm this as the recommended pattern |
| React 19 + Vite 8 | HIGH | Vite 8.0 release confirmed; React 19.2.1 confirmed stable |
| pychromecast + gTTS for TTS | MEDIUM | Works per community reports; known latency on first cast; library is maintained but not officially endorsed by Google |
| IFTTT for Google Home → Pi | MEDIUM | Free tier confirmed functional for webhook triggers; IFTTT has historically changed pricing/tiers — worth monitoring |
| Google Calendar OAuth2 | HIGH | Official Google library, stable API, standard OAuth2 flow |
| nginx on Pi 5 | HIGH | Battle-tested; no Pi 5 specific concerns |
| Tailscale | HIGH | Widely used on Pi OS; install script official |
| uv for Python env | HIGH | Current standard recommendation; Astral-maintained |
| Pydantic v2 for import contract | HIGH | model_json_schema + discriminated unions are official, stable v2 features; JSON Schema Draft 2020-12 compliant |
| SQLAlchemy M:1 Goals→Task/Routine | HIGH | Standard relationship pattern in SA 2.0 docs; selectin loading is the correct async strategy |
| Hand-rolled interval fill planner | HIGH | O(n log n) greedy algorithm; no novel CS; the complexity is product design, not implementation |
| Native File API for ingest UI | HIGH | Browser-standard; no library dependency; pattern used everywhere in 2026 React apps |

---

## Sources

- [FastAPI PyPI — version 0.128.x](https://pypi.org/project/fastapi/)
- [APScheduler 3.11.2 docs](https://apscheduler.readthedocs.io/en/3.x/)
- [APScheduler 4.0.0a1 PyPI — alpha warning](https://pypi.org/project/APScheduler/4.0.0a1/)
- [Vite 8.0 release](https://vite.dev/blog/announcing-vite8)
- [React versions](https://react.dev/versions)
- [Nginx vs Caddy 2026](https://privatedevops.com/articles/nginx-vs-caddy-2026-reverse-proxy-comparison)
- [Python 3.13 on Raspberry Pi](https://aruljohn.com/blog/python-raspberrypi/)
- [SQLAlchemy async FastAPI patterns](https://chaoticengineer.hashnode.dev/fastapi-sqlalchemy)
- [Google OAuth2 best practices](https://developers.google.com/identity/protocols/oauth2)
- [googlehomepush / pychromecast TTS](https://pypi.org/project/googlehomepush/)
- [Pydantic v2 JSON Schema docs](https://pydantic.dev/docs/validation/latest/concepts/json_schema/) — model_json_schema, TypeAdapter, Draft 2020-12 compliance confirmed
- [Pydantic v2 Discriminated Unions](https://docs.pydantic.dev/latest/concepts/unions/) — discriminator on Literal field confirmed
- [jsonschema 4.26.0 PyPI](https://pypi.org/project/jsonschema/) — version confirmed; ruled out as redundant
- [SQLAlchemy 2.0 Basic Relationship Patterns](https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html) — selectin async pattern confirmed
- [Pydantic v2 discriminated unions in FastAPI (2025)](https://uguraslim.com/blog/pydantic-v2-discriminated-unions-in-fastapi-modeling-polymor/) — schema versioning with Literal field confirmed as community best practice
