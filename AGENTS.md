<!-- GSD:project-start source:PROJECT.md -->
## Project

**My Secretary**

A self-hosted personal secretary running on a Raspberry Pi 5. It handles scheduling, task management, push notifications, recurring routines, and bidirectional Google Home voice integration. Accessible from anywhere via Tailscale VPN.

**Core Value:** One place to manage your schedule and tasks — reachable from any device, voice-controllable via Google Home, and proactive enough to push reminders before you have to think about them.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
### Infrastructure
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| nginx | latest stable (1.26.x) | Reverse proxy | Lower RAM than Caddy (C vs Go), which matters on Pi; handles HTTPS termination and static file serving. For Tailscale-only access, HTTPS is optional (Tailscale encrypts the tunnel), but useful for the local LAN. |
| Tailscale | latest | Remote access | Preferred over port forwarding; no open ports; use `tailscale serve` or `tailscale funnel` for optional HTTPS. |
| systemd | (OS-provided) | Process management | Standard on Raspberry Pi OS; no Docker overhead needed for a single-service personal project. |
### Python Environment
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
## Pi 5 Specific Notes
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-Codex-profile` -- do not edit manually.
<!-- GSD:profile-end -->
