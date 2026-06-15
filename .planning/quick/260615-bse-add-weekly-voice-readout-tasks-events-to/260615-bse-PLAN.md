---
phase: quick-260615-bse
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/services/brief.py
  - backend/app/routers/webhooks.py
  - backend/tests/test_weekly_brief.py
  - .planning/quick/260615-bse-add-weekly-voice-readout-tasks-events-to/IFTTT-SETUP.md
autonomous: true
requirements: [NOTIF-06]
must_haves:
  truths:
    - "Posting to /api/v1/webhooks/brief?range=week triggers a 7-day spoken readout grouped by weekday"
    - "Posting to /api/v1/webhooks/brief (no range) behaves byte-for-byte as before (daily brief)"
    - "Weekly TTS is gated by get_tts_enabled() and never blocks the Pushover send"
    - "Bad webhook secret still returns 403 for both ranges"
    - "User has step-by-step IFTTT + Google Home setup docs for both daily and weekly triggers"
  artifacts:
    - path: "backend/app/services/brief.py"
      provides: "build_week_speech(), build_week_body(), send_weekly_brief()"
      contains: "def send_weekly_brief"
    - path: "backend/app/routers/webhooks.py"
      provides: "range query param routing day|week"
      contains: "range"
    - path: "backend/tests/test_weekly_brief.py"
      provides: "weekly builder + webhook range tests"
      contains: "def test_"
    - path: ".planning/quick/260615-bse-add-weekly-voice-readout-tasks-events-to/IFTTT-SETUP.md"
      provides: "IFTTT/Google Home setup steps for daily + weekly"
      contains: "X-Webhook-Secret"
  key_links:
    - from: "backend/app/routers/webhooks.py"
      to: "app.services.brief.send_weekly_brief"
      via: "run_in_threadpool when range==week"
      pattern: "send_weekly_brief"
    - from: "backend/app/services/brief.py"
      to: "app.services.tts_settings.get_tts_enabled"
      via: "_tts_settings.get_tts_enabled() gate in send_weekly_brief"
      pattern: "_tts_settings\\.get_tts_enabled"
---

<objective>
Add a WEEKLY voice readout (next 7 days, tasks + events grouped by weekday) to the existing Google Home TTS path, alongside the daily brief. Phase 6 already built the daily brief (build_brief_speech/body/send_daily_brief) and a secret-guarded webhook POST /api/v1/webhooks/brief. This plan mirrors those exactly for a weekly variant and routes to it via an optional `range` query param so the daily path is unchanged.

Purpose: Let the user say "read me this week" to Google Home and hear a 7-day agenda, while keeping the daily brief working identically.
Output: Weekly brief functions in brief.py, range-aware webhook, tests, and an IFTTT setup doc for both triggers.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@backend/app/services/brief.py
@backend/app/routers/webhooks.py
@backend/tests/test_tts.py
@backend/tests/conftest.py

<interfaces>
<!-- Contracts the executor needs. Use directly — no codebase exploration. -->

brief.py module-level (backend/app/services/brief.py):
```python
import app.services.tts_settings as _tts_settings   # patch seam: app.services.tts_settings.get_tts_enabled
from app.services.tts import TTSClient               # patch seam: app.services.brief.TTSClient (if needed)
from app.services.pushover import PushoverClient
_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)                      # PATCH SEAM for tests: app.services.brief._Session
```

Existing daily query pattern (REUSE for the per-day window):
```python
# tasks: incomplete, due_date within [day_start, day_end)
select(Task).where(
    Task.completed == False,
    Task.due_date.isnot(None),
    Task.due_date >= day_start_naive,
    Task.due_date < day_end_naive,
)
# events: non-cancelled, all-day-by-date OR timed within window
select(CalendarEvent).where(
    CalendarEvent.cancelled == False,
    or_(
        CalendarEvent.start_date == day_str,
        and_(CalendarEvent.start_dt >= day_start_naive, CalendarEvent.start_dt < day_end_naive),
    ),
)
```

Model fields:
- Task: title:str, completed:bool, due_date:datetime|None  (untimed sentinel = hour==0 and minute==0)
- CalendarEvent: title:str, start_dt:datetime|None, all_day:bool, start_date:str|None ("YYYY-MM-DD"), cancelled:bool

Daily sort/format rule to mirror:
- timed entries: (HH:MM, title) sorted by HH:MM; untimed appended after.
- body lines: "HH:MM title" then "• title" untimed; speech: titles joined ". " + trailing "."

config: settings.api_prefix == "/api/v1", settings.webhook_secret env WEBHOOK_SECRET.
Tailscale URL base: https://jb.taildb91c4.ts.net
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add weekly brief functions to brief.py</name>
  <files>backend/app/services/brief.py</files>
  <behavior>
    - build_week_body() returns a multi-day body: for each of today..today+6, if that day has any incomplete task (due_date in [day_start, day_start+1d)) or non-cancelled event, emit a weekday header line then that day's entries (timed "HH:MM title" sorted, then untimed "• title"). Skip days with no entries. If the whole week is empty, return "Nothing scheduled this week."
    - build_week_speech() returns a naturally-spoken string: "Good morning. This week. {Weekday}: {title}, {title}. {Weekday}: ...". Skip empty days. Each day's titles ordered timed-first (sorted by HH:MM, title only — drop the time text or keep light, prefer just titles per task spec example "standup at 9" is acceptable but plain title is fine; keep it simple: join titles with ", "). If the whole week is empty, return "Good morning. Nothing scheduled this week."
    - send_weekly_brief() mirrors send_daily_brief: build_week_body() in try/except -> "Could not load agenda." fallback; PushoverClient().send(title="This week", message=body, priority=0); then if _tts_settings.get_tts_enabled(): build_week_speech() (except -> "Good morning.") and TTSClient().speak(speech); outer try/except logs and swallows so TTS never blocks Pushover.
  </behavior>
  <action>
    Append three functions to backend/app/services/brief.py (do NOT touch the existing daily functions or module-level setup):

    1. Add a private helper `_day_entries(s, day_start_naive)` that runs the same task + event queries as the daily functions but windowed to [day_start_naive, day_start_naive + timedelta(days=1)), using day_str = day_start_naive.date().isoformat(). Return (timed: list[tuple[str,str]], untimed: list[str]) using the EXACT classification rules from build_brief_body (task untimed when due_date.hour==0 and minute==0; event untimed when all_day or start_dt is None). Sort timed by x[0] before returning. This helper takes an open session `s` so we open ONE session per build call and loop 7 days inside it (mirror the `with _Session() as s:` pattern).

    2. build_week_body() -> str: now = datetime.now(); today_start = now.replace(hour=0,minute=0,second=0,microsecond=0). Open `with _Session() as s:` and for i in range(7): day_start = today_start + timedelta(days=i); timed, untimed = _day_entries(s, day_start). If not (timed or untimed): continue. Append a header f"{day_start.strftime('%A')}:" then lines [f"{hm} {title}" for hm,title in timed] + [f"• {t}" for t in untimed]. Collect into a list of blocks; join blocks with "\n". If no blocks at all, return "Nothing scheduled this week."

    3. build_week_speech() -> str: same loop; for each non-empty day build f"{weekday}: " + ", ".join(titles) + "." where titles = [title for _,title in timed] + untimed. Prefix the joined day-strings with "Good morning. This week. ". If no days have entries, return "Good morning. Nothing scheduled this week."

    4. send_weekly_brief() -> None: copy send_daily_brief structure verbatim, swapping build_brief_body->build_week_body, title "Good morning"->"This week", build_brief_speech->build_week_speech. Keep the identical try/except nesting and the _tts_settings.get_tts_enabled() gate and the logging.getLogger(__name__).exception(...) swallow.

    Match existing style — no comments, no premature abstraction beyond the single _day_entries helper. Keep TTS sync (APScheduler thread-pool pattern).
  </action>
  <verify>
    <automated>cd backend; python -c "import ast,sys; ast.parse(open('app/services/brief.py').read()); print('ok')"</automated>
  </verify>
  <done>brief.py exports build_week_body, build_week_speech, send_weekly_brief; existing daily functions unchanged; module imports cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Add range param to the brief webhook</name>
  <files>backend/app/routers/webhooks.py</files>
  <action>
    Extend POST /api/v1/webhooks/brief to accept an optional `range` query param without changing the no-param daily behavior:

    - Import send_weekly_brief alongside send_daily_brief: `from app.services.brief import send_daily_brief, send_weekly_brief`.
    - Import Query: `from fastapi import APIRouter, Header, HTTPException, Query`.
    - Use a Literal-constrained query param so FastAPI returns 422 on invalid values:
      `from typing import Literal` then signature `async def trigger_brief(range: Literal["day", "week"] = Query(default="day"), x_webhook_secret: str = Header(default="")):`
    - Keep `_verify_secret(x_webhook_secret)` FIRST (secret check before any work).
    - After secret check: `if range == "week": await run_in_threadpool(send_weekly_brief)` else `await run_in_threadpool(send_daily_brief)`. Return {"status": "ok"}.

    The default-path (no range) must call send_daily_brief exactly as today so the existing daily applet is byte-for-byte unchanged. Do NOT rename the route or change the header name.
  </action>
  <verify>
    <automated>cd backend; python -c "import app.routers.webhooks as w; assert hasattr(w,'send_weekly_brief'); print('ok')"</automated>
  </verify>
  <done>Webhook accepts range=day|week (default day), routes week->send_weekly_brief, invalid range->422, secret guard unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Tests for weekly builders + webhook range, plus IFTTT doc</name>
  <files>backend/tests/test_weekly_brief.py, .planning/quick/260615-bse-add-weekly-voice-readout-tasks-events-to/IFTTT-SETUP.md</files>
  <behavior>
    - build_week_speech / build_week_body: with tasks+events seeded across multiple days, output groups by weekday header, skips empty days, and an empty week returns the "Nothing scheduled this week." / "Good morning. Nothing scheduled this week." fallbacks.
    - Webhook: range=week with correct secret calls send_weekly_brief (and NOT send_daily_brief); default (no range) calls send_daily_brief; wrong secret returns 403 and neither is called; invalid range value returns 422.
  </behavior>
  <action>
    Create backend/tests/test_weekly_brief.py mirroring backend/tests/test_tts.py conventions (sync TestClient, MemoryJobStore autouse fixture copied verbatim from test_tts.py so scheduler jobstore is isolated).

    CRITICAL test-isolation rules (from STATE.md + code review):
    - brief.py uses its OWN module-level `_Session` bound to the production DB, NOT app_db. For builder tests, seed data via a test sync session and patch `app.services.brief._Session` to it (mirror conftest fake_credentials_json which patches app.services.sync._Session). Build that session against TEST_DB_URL stripped of +aiosqlite, create_all, insert Task/CalendarEvent rows with controlled due_date/start_dt, clean up rows after.
    - Any test whose path depends on the flag must patch `app.services.tts_settings.get_tts_enabled` (return_value=True/False). Do NOT rely on DB default; conftest does not reset the settings row.

    Builder tests (call functions directly, patch brief._Session):
      * test_build_week_speech_groups_by_day: seed an event today at 09:00 and a task tomorrow at 00:00 (untimed); assert output contains today's weekday name and the event title, tomorrow's weekday name and the task title, and that empty days in between are absent.
      * test_build_week_body_groups_by_day: same seed; assert weekday header lines present and "09:00 " formatted timed line + "• " untimed line appear under the right days.
      * test_build_week_empty: with no rows seeded (clean window), assert build_week_speech() == "Good morning. Nothing scheduled this week." and build_week_body() == "Nothing scheduled this week."
      Use datetime.now() anchoring inside the test (compute today_start the same way brief does) so seeded rows land in the 7-day window deterministically; clean up all seeded rows in a finally/fixture.

    Webhook tests (mirror test_webhook_brief_* patch style):
      * test_webhook_range_week_routes_weekly: patch app.routers.webhooks.settings (webhook_secret="test-secret"), patch app.routers.webhooks.send_weekly_brief and app.routers.webhooks.send_daily_brief; POST with header X-Webhook-Secret + ?range=week; assert 200, send_weekly_brief called once, send_daily_brief NOT called.
      * test_webhook_range_default_routes_daily: same patches; POST with header, no range; assert 200, send_daily_brief called once, send_weekly_brief NOT called.
      * test_webhook_range_bad_secret: wrong secret + ?range=week; assert 403, neither called.
      * test_webhook_range_invalid_value: correct secret + ?range=month; assert 422 (FastAPI Literal validation); neither called.

    Then create IFTTT-SETUP.md (see Task spec item 4): a markdown doc the user can follow with TWO applets.
    Document, for BOTH daily and weekly:
      - Google Assistant "Say a simple phrase" trigger (suggest phrases: daily "read me today" / weekly "read me this week").
      - Action: Webhooks → "Make a web request".
        - Daily URL:  https://jb.taildb91c4.ts.net/api/v1/webhooks/brief
        - Weekly URL: https://jb.taildb91c4.ts.net/api/v1/webhooks/brief?range=week
        - Method: POST
        - Content Type: application/json (body can be empty {})
        - Add header: X-Webhook-Secret: <WEBHOOK_SECRET>  (value = the WEBHOOK_SECRET env var from backend .env; tell the user to paste the literal secret here).
      - Note: requires Tailscale funnel reachable from IFTTT (see STATE.md open question) — if IFTTT cannot reach the funnel, fall back to router port-forward.
      - Note: the daily applet is not yet set up; both are new.
  </action>
  <verify>
    <automated>cd backend; python -m pytest tests/test_weekly_brief.py -x -q</automated>
  </verify>
  <done>All weekly-brief tests pass; IFTTT-SETUP.md exists with both applets, full Tailscale URLs, POST method, and X-Webhook-Secret header instructions.</done>
</task>

</tasks>

<verification>
- `cd backend; python -m pytest tests/test_weekly_brief.py tests/test_tts.py -q` passes (weekly added, daily/webhook untouched).
- Daily webhook path (no range) still calls send_daily_brief — confirmed by test_webhook_range_default_routes_daily.
- IFTTT-SETUP.md present and contains both daily and weekly request configs.
</verification>

<success_criteria>
- build_week_body/build_week_speech/send_weekly_brief exist in brief.py, mirroring daily structure; daily functions byte-for-byte unchanged.
- POST /api/v1/webhooks/brief?range=week routes to send_weekly_brief; default routes to send_daily_brief; invalid range -> 422; secret guard intact (wrong/missing -> 403).
- Weekly TTS gated by get_tts_enabled() and best-effort (cannot block Pushover).
- New tests pass and follow the patch-seam + flag-patch isolation rules.
- User has IFTTT-SETUP.md with copy-paste setup for both triggers.
</success_criteria>

<output>
After completion, create `.planning/quick/260615-bse-add-weekly-voice-readout-tasks-events-to/260615-bse-SUMMARY.md`
</output>
