# Quick Task 260615-bse — Summary

**Description:** Add weekly voice readout (tasks + events) to the Google Home TTS path, alongside the existing daily brief.
**Date:** 2026-06-15
**Status:** Complete (code + tests green; live hardware/IFTTT gate pending — see below)

## What changed

### 1. `backend/app/services/brief.py` — weekly brief builders
- `_day_entries(s, day_start_naive)` — shared helper returning `(timed, untimed)` for a single day, reusing the exact daily query/sort/classification rules (incomplete tasks with `due_date` in the day window + non-cancelled calendar events; `00:00` = untimed).
- `build_week_body()` — Pushover-formatted 7-day agenda (today → today+6), grouped by weekday, empty days skipped. Falls back to `"Nothing scheduled this week."`.
- `build_week_speech()` — spoken form: `"Good morning. This week. Monday: ... Tuesday: ..."`, empty days skipped. Falls back to `"Good morning. Nothing scheduled this week."`.
- `send_weekly_brief()` — mirrors `send_daily_brief()` exactly: Pushover (title "This week") always fires; TTS gated on `_tts_settings.get_tts_enabled()`, best-effort, never blocks Pushover.

### 2. `backend/app/routers/webhooks.py` — range param
- `POST /api/v1/webhooks/brief` gained `range: Literal["day","week"] = Query(default="day")`.
- `range=week` → `send_weekly_brief`; default/`day` → `send_daily_brief` (existing daily path byte-for-byte unchanged). Invalid values auto-422 via the `Literal`. `X-Webhook-Secret` hmac guard intact.

### 3. `backend/tests/test_weekly_brief.py` — 7 tests
- Builder grouping (speech + body), empty-week fallback — each patches `app.services.brief._Session` to a test session (critical: `brief.py` binds its own module-level `_Session` to the prod DB, not the conftest-patched one).
- Webhook routing: `range=week` → weekly, default → daily, bad secret → 403, invalid range → 422.

### 4. `IFTTT-SETUP.md` — setup doc for both triggers
Step-by-step IFTTT applets (daily + weekly) → Google Assistant phrase → Webhooks POST with `X-Webhook-Secret`. Documents the **Tailscale Funnel** prerequisite (IFTTT is cloud-based and can't reach a tailnet-only `*.ts.net` URL) and the open question on Funnel↔IFTTT reachability.

## Test results
`uv run pytest` → **60 passed, 1 failed**. The single failure (`test_calendar.py::test_callback_stores_credentials`) is the documented pre-existing OAuth-callback defect, unrelated to this task. All 7 new tests pass.

## Commits
- `33c8722` feat: add weekly brief functions to brief.py
- `81ff8b4` feat: add range param to brief webhook
- `4fabd1f` test: weekly brief + webhook range tests, IFTTT setup doc

## Pending human gate
- Create the two IFTTT applets per `IFTTT-SETUP.md`.
- Enable Tailscale Funnel on the Pi and confirm IFTTT can reach the webhook publicly (open question from STATE.md).
- Redeploy to Pi (`git pull && cd backend && uv run alembic upgrade head && sudo systemctl restart secretary` — no migration this task, but harmless) and confirm the Nest Mini speaks the weekly readout.
