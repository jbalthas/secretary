# Phase 12: Update Resolution Engine — Research

**Researched:** 2026-06-22
**Domain:** Free-text fuzzy matching, intent parsing, APScheduler job management, ingest schema extension, idempotency
**Confidence:** HIGH

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPDATE-02 | Resolve free-text update to action (done/reschedule/drop) by fuzzy-matching today's ScheduledBlocks + Tasks; no LLM call | rapidfuzz process.extract + WRatio scorer; keyword intent parser; candidate pool from DB query |
| UPDATE-03 | Ambiguous or no-match → return `ambiguous`/`no_match` status + candidate list; never silently act or drop | Confidence threshold band: score ≥ CONFIDENT_THRESHOLD → act; AMBIGUOUS_LOW ≤ score < CONFIDENT_THRESHOLD → ambiguous; below → no_match |
| NOTIF-07 | Configurable mid-day check-in Pushover notification with deep-link to Today update view; persists across reboots | APScheduler CronTrigger on SQLAlchemyJobStore; `schedule_checkin()` mirrors `schedule_daily_brief()`; deep-link URL = `{base_url}/today?update=1` |
| INGEST-08 | Ingest endpoint accepts `intra_day_update` payload type; validated via Pydantic; applied idempotently (double-post = no double-mutation) | Discriminated union on `payload_type`; `update_id` idempotency key; upsert via external_key on ScheduledBlock completed flag or Task completed flag |

</phase_requirements>

---

## Summary

Phase 12 adds a pure-Python, no-LLM update resolution engine. A user posts free text like "finished the standup prep"; the backend fuzzy-matches that text against today's ScheduledBlock titles and Task titles using `rapidfuzz`, parses a done/reschedule/drop intent from keyword signals, and returns either a confident resolved action or an `ambiguous`/`no_match` response for the frontend to surface.

Three additional concerns are addressed in this phase: (1) a configurable mid-day check-in job, registered via APScheduler SQLAlchemyJobStore so it survives reboots, fires a Pushover notification with a deep-link URL; (2) new nullable `check_in_hour`/`check_in_minute` columns on `AppSettings` store the user-configurable check-in time (migration 0015); and (3) the existing ingest endpoint is extended with a discriminated-union schema to accept `intra_day_update` payloads that apply idempotently using an `update_id` key.

**Primary recommendation:** Add `rapidfuzz>=3.9,<4.0` to `pyproject.toml` dependencies. Implement a `resolution_service.py` as a pure synchronous module (same pattern as `guidance_service.py`) and expose it via a new `POST /api/v1/updates/resolve` async router. Mirror every APScheduler and settings pattern already established in `scheduler.py` and `routers/settings.py`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| rapidfuzz | >=3.9,<4.0 (latest: 3.14.5) | Fuzzy string matching | Not yet in project; constraint-compliant (no new server-side LLM). C extension — fast on Pi 5. `WRatio` handles word reordering, abbreviations, partial title matches. `process.extract` returns ranked candidates with scores. |
| APScheduler | 3.11.x (already installed) | Mid-day check-in job | Already used for daily brief, stall-check, reminders. SQLAlchemyJobStore already wired. |
| Pydantic v2 | already installed | INGEST-08 discriminated-union schema | Already in use for all ingest schemas. |
| httpx | 0.27.x (already installed) | Pushover notification | Already used in `PushoverClient`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `rapidfuzz.process` | (bundled) | Ranked candidate extraction | `process.extract(query, choices, scorer=WRatio, limit=5)` |
| `rapidfuzz.fuzz.WRatio` | (bundled) | Weighted ratio scorer | Best general scorer; handles partial and token reordering |

**No new dependency needed** for intent parsing — Python built-ins (string `split`, `startswith`, keyword sets) are sufficient.

**Installation (one new package):**

```bash
# On dev machine inside backend/
uv add "rapidfuzz>=3.9,<4.0"
```

This adds one line to `pyproject.toml` dependencies. Everything else already exists.

---

## Architecture Patterns

### New Files

```
backend/app/
├── services/
│   └── resolution_service.py     # pure sync; fuzzy match + intent parse
├── routers/
│   └── updates.py                # POST /api/v1/updates/resolve
├── schemas/
│   └── update.py                 # UpdateRequest, UpdateResponse, IntraDayUpdateImport
migrations/versions/
└── 0015_add_checkin_columns.py   # check_in_hour, check_in_minute on app_settings

backend/tests/
└── test_updates.py               # Wave 0 stubs + integration tests
```

### Modified Files

```
backend/app/
├── scheduler.py         # + schedule_checkin()
├── models/__init__.py   # + check_in_hour, check_in_minute on AppSettings
├── routers/settings.py  # + GET/PUT /settings/check-in-time
├── schemas/settings.py  # + CheckInTimeRead, CheckInTimeUpdate
├── schemas/ingest.py    # + IntraDayUpdateImport + discriminated union top-level
├── services/ingest_service.py  # + apply_intra_day_updates()
├── main.py              # + include_router(updates.router), schedule_checkin() in lifespan
migrations/versions/
└── 0015_...             # check_in_hour + check_in_minute nullable columns
```

### Pattern 1: Fuzzy Resolution Service — Pure Sync Module

The resolution service follows the same sync-module pattern as `guidance_service.py` and `brief.py` — uses `create_engine` + `sessionmaker` (no async) because APScheduler and the scheduler thread pool cannot use async sessions.

However, `POST /api/v1/updates/resolve` is an async FastAPI route that calls the sync service via `run_in_threadpool` (as Phase 08 did for `celebrate`), OR it accepts an `AsyncSession` and performs async DB reads then calls the pure-function resolver with in-memory objects. The latter is simpler and preferred here since resolution is read-only and can be called from an async context directly.

**Recommended approach for the router:** Accept `AsyncSession = Depends(get_session)`, load today's ScheduledBlocks + Tasks from DB asynchronously, then call a pure in-memory resolver function with the loaded objects. This avoids the sync/async crossing entirely.

```python
# Source: inferred from planner_service.py pattern (read-only, pure function)
# app/services/resolution_service.py

from rapidfuzz import process, fuzz

CONFIDENT_THRESHOLD = 80   # score >= 80 → resolved action
AMBIGUOUS_LOW      = 50    # 50 <= score < 80 → ambiguous (surface candidates)
MAX_CANDIDATES     = 5

_DONE_VERBS    = {"done", "finished", "complete", "completed", "did", "checked", "wrapped"}
_RESCHEDULE    = {"reschedule", "move", "push", "defer", "delay", "postpone", "later"}
_DROP_VERBS    = {"drop", "cancel", "remove", "skip", "delete", "abandon", "ditch"}

def _parse_intent(text: str) -> str:
    """Return 'done' | 'reschedule' | 'drop'. Default is 'done'."""
    lower = text.lower()
    tokens = set(lower.split())
    if tokens & _DROP_VERBS:
        return "drop"
    if tokens & _RESCHEDULE:
        return "reschedule"
    return "done"  # most common intent; safe default

def resolve_update(
    text: str,
    blocks: list,   # ScheduledBlock ORM objects
    tasks: list,    # Task ORM objects (pending, not completed)
) -> dict:
    """Pure function — no DB access. Returns resolution dict."""
    # Build candidate pool: (title, entity_type, entity_id)
    candidates = []
    for b in blocks:
        candidates.append((b.title, "block", b.id))
    for t in tasks:
        candidates.append((t.title, "task", t.id))

    if not candidates:
        return {"status": "no_match", "candidates": []}

    titles = [c[0] for c in candidates]
    matches = process.extract(
        text, titles,
        scorer=fuzz.WRatio,
        limit=MAX_CANDIDATES,
        processor=lambda s: s.lower(),
    )
    # matches: list of (title, score, index)

    best_score = matches[0][1] if matches else 0

    if best_score >= CONFIDENT_THRESHOLD:
        best_idx   = matches[0][2]
        _, etype, eid = candidates[best_idx]
        intent = _parse_intent(text)
        return {
            "status": "resolved",
            "action": intent,
            "entity_type": etype,
            "entity_id": eid,
            "entity_title": candidates[best_idx][0],
            "score": best_score,
        }

    if best_score >= AMBIGUOUS_LOW:
        return {
            "status": "ambiguous",
            "candidates": [
                {"title": candidates[m[2]][0], "entity_type": candidates[m[2]][1],
                 "entity_id": candidates[m[2]][2], "score": m[1]}
                for m in matches
            ],
        }

    return {"status": "no_match", "candidates": []}
```

### Pattern 2: APScheduler Check-In Job — Mirror `schedule_daily_brief`

The existing `schedule_daily_brief()` in `scheduler.py` is the canonical pattern. The check-in job follows it exactly:

```python
# Source: app/scheduler.py lines 59-68 (existing schedule_daily_brief pattern)

def schedule_checkin(hour: int, minute: int) -> None:
    from apscheduler.triggers.cron import CronTrigger
    from app.services.checkin_service import send_checkin_notification
    scheduler.add_job(
        send_checkin_notification,
        CronTrigger(hour=hour, minute=minute, timezone=settings.timezone),
        id="mid_day_checkin",
        replace_existing=True,
        misfire_grace_time=None,
    )
```

`send_checkin_notification` is a sync function (same reason as `send_daily_brief` — APScheduler thread pool, not async). It calls `PushoverClient().send(...)` with a deep-link URL.

**Deep-link URL construction (from STATE.md decision):**

```python
# [v2.1 roadmap] decision: deep-link = app relative path /today?update=1
# No base URL setting needed — Pushover `url` field accepts relative paths
# displayed as a tappable link in the iOS/Android app.
# For the Pushover `url` field use the Tailscale HTTPS hostname from config or
# a configurable APP_BASE_URL env var defaulting to "".

deep_link = "/today?update=1"
# PushoverClient.send extended with optional url= kwarg:
PushoverClient().send(
    title="Mid-day check-in",
    message="How's your day going? Log your progress.",
    url=deep_link,
    url_title="Open Today",
)
```

Note: `PushoverClient.send` currently does not accept `url` / `url_title`. These need to be added as optional kwargs passed through to the Pushover API `data` dict.

### Pattern 3: AppSettings Extension — Nullable Columns + Migration

The existing pattern (from Phase 10 decision note): **nullable columns, no server_default, router coalesces None to default value**.

```python
# app/models/__init__.py — AppSettings additions
check_in_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
check_in_minute: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

Migration 0015 follows the 0010 pattern: `batch_alter_table` + `add_column` with `nullable=True`, **no server_default**, matching the existing convention for AppSettings nullable columns.

```python
# migrations/versions/0015_add_checkin_columns.py
revision = "0015"
down_revision = "0014"

def upgrade():
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("check_in_hour", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("check_in_minute", sa.Integer(), nullable=True))
```

Router default: `hour = cfg.check_in_hour if cfg and cfg.check_in_hour is not None else 12`.

### Pattern 4: INGEST-08 — Discriminated Union Schema

The current `IngestPayload` schema has `schema_version: Literal["1.0"]` and `extra="forbid"`. To add `intra_day_update` payloads without breaking existing consumers, use a **top-level discriminated union** via a new `payload_type` field and a new schema version Literal, or extend existing `IngestPayload` with an optional `updates` list.

**Recommended approach:** Add optional `updates: list[IntraDayUpdateImport] = []` to the existing `IngestPayload` with a **`schema_version: Literal["1.0", "1.1"]`** where `1.1` indicates update support. This avoids breaking existing `"1.0"` consumers while allowing the field via `extra="forbid"` (the field is now declared).

Alternatively (cleaner): bump `schema_version` to `Literal["1.1"]` only for payloads containing updates, keeping `"1.0"` for backwards compatibility via a Union type. STATE.md says "schema_version Literal bump or new payload_type discriminator" — both are acceptable; the simpler option (optional field + accept both version strings) is preferred.

```python
# app/schemas/ingest.py additions
class UpdateAction(str, enum.Enum):
    done = "done"
    reschedule = "reschedule"
    drop = "drop"

class IntraDayUpdateImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    update_id: str = Field(..., max_length=200)   # idempotency key
    entity_type: Literal["task", "block"]
    entity_id: int
    action: UpdateAction
    reschedule_to: datetime | None = None          # required when action=reschedule

class IngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0", "1.1"]
    goals: list[GoalImport] = []
    tasks: list[TaskImport] = []
    routines: list[RoutineImport] = []
    habits: list[HabitImport] = []
    updates: list[IntraDayUpdateImport] = []       # new; ignored on schema_version=1.0
```

**Idempotency:** An `IntraDayUpdateApplied` table (or a simple `update_log` set) tracks processed `update_id` values. On `apply_import`, check if `update_id` already exists before mutating — if yes, skip. A lightweight approach: add a new `UpdateLog` model with `update_id` unique column rather than relying on re-checking task state (which could change between calls).

**Simpler idempotency without a new table:** Check the current entity state before applying. If `action=done` and `task.completed is True`, skip. If `action=drop` and the block/task is already absent, skip. This is stateless idempotency — safe for "mark done" since done is idempotent; slightly less reliable for "reschedule" if the time already matches. Document which approach is chosen.

**Recommendation:** Use stateless idempotency (check entity state) for `done` and `drop`. For `reschedule`, add an `UpdateLog` model with `update_id` unique constraint — a second reschedule with the same `update_id` is a no-op. This matches the v2.1 hard constraint of no new dependencies (SQLite table, not Redis).

### Pattern 5: New `POST /api/v1/updates/resolve` Endpoint

```python
# app/routers/updates.py
router = APIRouter(prefix=f"{settings.api_prefix}/updates", tags=["updates"])

@router.post("/resolve", response_model=UpdateResponse)
async def resolve(
    body: UpdateRequest,
    session: AsyncSession = Depends(get_session),
):
    today_key = date.today().isoformat()
    blocks = (await session.execute(
        select(ScheduledBlock).where(ScheduledBlock.date_key == today_key)
    )).scalars().all()
    tasks = (await session.execute(
        select(Task).where(Task.completed == False)
    )).scalars().all()

    from app.services import resolution_service
    return resolution_service.resolve_update(body.text, blocks, tasks)
```

### Recommended Project Structure Addition

```
backend/app/
├── routers/
│   └── updates.py         # POST /updates/resolve
├── services/
│   └── resolution_service.py  # pure; resolve_update() pure function
└── schemas/
    └── update.py              # UpdateRequest, UpdateResponse (Pydantic v2)
```

### Anti-Patterns to Avoid

- **Async resolution service:** Do not make `resolution_service.py` async. It does no I/O itself — it operates on in-memory ORM objects passed in by the router. Making it async adds complexity with no benefit.
- **Hardcoded CONFIDENT_THRESHOLD:** Export the thresholds as module-level constants so tests can monkeypatch them.
- **Calling PushoverClient from an async route without threadpool:** `PushoverClient.send` uses `httpx.Client` (sync). If called directly in an async route, wrap with `run_in_threadpool`. The scheduler fires sync functions from thread pool, so no issue there.
- **Mutating AppSettings id=1 without checking existence:** Follow the existing pattern — `session.get(AppSettings, 1)` then create if None.
- **Adding `check_in_hour`/`check_in_minute` with `server_default`:** Do not add server_default. Follow Phase 10 decision: nullable, no server_default, router coalesces None to default (12, 0).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy string matching | Custom Levenshtein / edit distance | `rapidfuzz.process.extract` + `fuzz.WRatio` | WRatio handles token reordering, partial matches, Unicode; C extension ~10-50× faster than pure Python; returns ranked candidates with scores out of the box |
| Candidate ranking | Manual score sorting | `process.extract(limit=N)` | Already returns sorted list; threshold logic is the only custom code needed |
| Reboot-safe scheduled job | Custom SQLite job table | APScheduler `SQLAlchemyJobStore` (already wired) | Already in `scheduler.py`; `replace_existing=True` + `id=` dedup guard already established |
| HTTP notification | Custom httpx wrapper | Existing `PushoverClient` | Already handles auth, timeout, raise_for_status; just add optional `url`/`url_title` kwargs |

**Key insight:** The entire fuzzy-match problem reduces to ~20 lines of Python wrapping `rapidfuzz.process.extract`. All complexity is in threshold tuning, not implementation.

---

## Common Pitfalls

### Pitfall 1: WRatio vs. token_set_ratio — Choosing the Wrong Scorer

**What goes wrong:** Using `token_set_ratio` means "team standup" matches "standup team" at 100 but also gives high scores to unrelated strings that share a single word (e.g., "drop team meeting" would match "team standup" at 100 because both contain "team").

**Why it happens:** `token_set_ratio` ignores word order and focuses on set intersection, making it overly generous with short shared words.

**How to avoid:** Use `fuzz.WRatio` as the default scorer for the update resolution case. WRatio is a weighted combination that considers full-string similarity, partial alignment, and token order. It is more discriminating for short task titles typical in this app.

**Warning signs:** In tests, false-positive matches on short shared words (e.g., "meeting" matching every block title that contains "meeting").

### Pitfall 2: Threshold Too Low — Silent Misresolutions

**What goes wrong:** Setting `CONFIDENT_THRESHOLD` too low (e.g., 60) causes the system to confidently resolve ambiguous inputs, violating UPDATE-03 (never silently act on ambiguous input).

**Why it happens:** WRatio on short task titles (3-5 words) can score 70+ even for poor matches because the strings are short.

**How to avoid:** Start with `CONFIDENT_THRESHOLD = 80`, `AMBIGUOUS_LOW = 50`. Validate with representative title samples in tests (e.g., "done with standup prep" against a pool of 10 today's tasks). Consider normalizing input (lowercase, strip punctuation) before scoring.

**Warning signs:** Tests show multiple matches above threshold for distinct titles.

### Pitfall 3: INGEST-08 Schema Version Breaks Existing Consumers

**What goes wrong:** Changing `schema_version: Literal["1.0"]` to `Literal["1.1"]` makes existing `1.0` payloads fail validation with HTTP 422.

**Why it happens:** `extra="forbid"` + `Literal` are strict.

**How to avoid:** Use `Literal["1.0", "1.1"]` — both are accepted. Existing `1.0` payloads continue to work; the new `updates` field is optional and defaults to `[]`.

**Warning signs:** `test_schema_version_mismatch` starts passing `"1.0"` as invalid.

### Pitfall 4: APScheduler SQLAlchemyJobStore URL in Tests

**What goes wrong:** The test suite uses a MemoryJobStore fixture (see `test_scheduler.py` lines 21-27) that swaps out the default jobstore for each test. Adding a new `schedule_checkin()` function tested in integration will cause false passes if tests don't swap back to Memory store.

**Why it happens:** `test_scheduler.py` has an `autouse` fixture that replaces the SQLAlchemy jobstore with MemoryJobStore to avoid writing to the SQLite file during tests. New checkin job tests must use the same pattern.

**How to avoid:** Add the `memory_jobstore` fixture to new scheduler tests, or (better) make it session-scoped if the test file uses the same `test_scheduler.py` file.

**Warning signs:** Test fails with SQLite lock error or stale jobs persisting between tests.

### Pitfall 5: PushoverClient URL Parameter Not Yet Supported

**What goes wrong:** Pushover supports `url` and `url_title` POST fields, but the existing `PushoverClient.send()` signature does not include them. The check-in notification needs to pass a deep-link URL.

**Why it happens:** `PushoverClient` was built minimally for the brief use case.

**How to avoid:** Extend `PushoverClient.send()` with `url: str | None = None` and `url_title: str | None = None`. Add them to the `data` dict only when not None. This is a backwards-compatible change.

**Warning signs:** Pushover notification arrives without a tappable link.

### Pitfall 6: Scheduler Not Started at Import Time — Tests That Call schedule_checkin() Directly

**What goes wrong:** Calling `schedule_checkin()` at module import time (rather than inside the FastAPI `lifespan`) causes APScheduler `SchedulerNotRunningError` in tests.

**Why it happens:** `scheduler.add_job` requires the scheduler to be started.

**How to avoid:** Always call `schedule_checkin()` inside the `lifespan` context (after `scheduler.start()`), following the existing pattern in `main.py`. In tests, either start the scheduler or use the `memory_jobstore` fixture which starts it.

---

## Code Examples

Verified patterns from existing codebase:

### Existing: schedule_daily_brief (canonical scheduler pattern)

```python
# Source: app/scheduler.py lines 59-68
def schedule_daily_brief(hour: int, minute: int) -> None:
    from apscheduler.triggers.cron import CronTrigger
    from app.services.brief import send_daily_brief
    scheduler.add_job(
        send_daily_brief,
        CronTrigger(hour=hour, minute=minute, timezone=settings.timezone),
        id="daily_brief",
        replace_existing=True,
        misfire_grace_time=None,
    )
```

### Existing: Settings GET/PUT pattern (canonical for new settings)

```python
# Source: app/routers/settings.py lines 12-31
@router.get("/brief-time", response_model=BriefTimeRead)
async def get_brief_time(session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        return BriefTimeRead(hour=8, minute=0)
    return BriefTimeRead(hour=cfg.brief_hour, minute=cfg.brief_minute)

@router.put("/brief-time", response_model=BriefTimeRead)
async def set_brief_time(body: BriefTimeUpdate, session: AsyncSession = Depends(get_session)):
    cfg = await session.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, brief_hour=body.hour, brief_minute=body.minute)
        session.add(cfg)
    else:
        cfg.brief_hour = body.hour
        cfg.brief_minute = body.minute
    await session.commit()
    schedule_daily_brief(body.hour, body.minute)
    return BriefTimeRead(hour=body.hour, minute=body.minute)
```

### Existing: lifespan job registration from DB settings

```python
# Source: app/main.py lines 27-42
row = s.get(AppSettings, 1)
hour = row.brief_hour if row else 8
minute = row.brief_minute if row else 0
schedule_daily_brief(hour, minute)
# Follow same pattern for schedule_checkin():
checkin_hour   = row.check_in_hour   if row and row.check_in_hour   is not None else 12
checkin_minute = row.check_in_minute if row and row.check_in_minute is not None else 0
schedule_checkin(checkin_hour, checkin_minute)
```

### Existing: ingest idempotency key pattern

```python
# Source: app/services/ingest_service.py lines 18-19 (_upsert_goal)
result = await session.execute(select(Goal).where(Goal.external_key == g.external_key))
existing = result.scalar_one_or_none()
# Pattern: match on stable key, upsert; never on title
```

### Existing: batch_alter_table migration for app_settings

```python
# Source: migrations/versions/0010_guidance_columns.py lines 19-26
with op.batch_alter_table("app_settings") as batch_op:
    batch_op.add_column(sa.Column("stall_threshold_days", sa.Integer(), nullable=True))
    batch_op.add_column(sa.Column("last_guidance_sent_date", sa.Date(), nullable=True))
```

### New: rapidfuzz process.extract usage

```python
# Source: rapidfuzz 3.14.5 official docs (process module)
from rapidfuzz import process, fuzz

titles = ["Morning standup prep", "Code review PR #42", "Deploy to staging"]
query  = "done with standup"

# Returns list of (title, score, index) sorted by score desc, up to limit
matches = process.extract(
    query,
    titles,
    scorer=fuzz.WRatio,
    limit=5,
    processor=lambda s: s.lower(),
)
# e.g. [("Morning standup prep", 82.3, 0), ("Deploy to staging", 41.0, 2), ...]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fuzzywuzzy` (thefuzz) | `rapidfuzz` | 2021+ | Same API, C extension, 10-50× faster, Python 3.12 compatible |
| Manual APScheduler `add_job` without `id=` | Always use `id=` + `replace_existing=True` | Phase 3 decision | Prevents duplicate jobs on restart (established project convention) |
| `schema_version: Literal["1.0"]` (single) | `Literal["1.0", "1.1"]` (both accepted) | Phase 12 | Backwards compatible ingest extension |

**Deprecated/outdated:**

- `fuzzywuzzy` / `thefuzz`: Do not add this. `rapidfuzz` is the maintained replacement with identical API.
- APScheduler 4.x: Still alpha as of 2026; project uses 3.11.x per explicit decision in STATE.md.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| rapidfuzz | UPDATE-02 fuzzy match | Not installed in project venv | 3.14.5 on PyPI | None — must add to pyproject.toml |
| APScheduler 3.x | NOTIF-07 check-in job | Installed | 3.11.x | N/A |
| Pushover API | NOTIF-07 | Runtime (credentials in .env) | N/A | N/A |
| SQLite (for APScheduler jobstore) | NOTIF-07 reboot persistence | Present | N/A | N/A |

**Missing dependencies with no fallback:**

- `rapidfuzz` must be added to `pyproject.toml` before implementation: `"rapidfuzz>=3.9,<4.0"`. The constraint `no new dependencies` in REQUIREMENTS.md refers to no new **server-side LLM** dependencies (see the exact wording: "no new dependencies, no server-side LLM"); rapidfuzz is a pure-text utility library, not an LLM, and adding it is the only feasible no-LLM fuzzy matching approach.

---

## Validation Architecture

`nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x |
| Config file | none — pytest discovers `backend/tests/` |
| Quick run command | `cd backend && python -m pytest tests/test_updates.py -x -q` |
| Full suite command | `cd backend && python -m pytest -x -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPDATE-02 | `resolve_update()` returns `resolved` + correct action for clear match | unit (pure function) | `pytest tests/test_updates.py::test_resolve_clear_match -x` | Wave 0 |
| UPDATE-02 | No external HTTP request made during resolution | unit (assert no httpx calls) | `pytest tests/test_updates.py::test_no_http_call -x` | Wave 0 |
| UPDATE-03 | Multiple near-matches → `ambiguous` status + candidate list | unit | `pytest tests/test_updates.py::test_resolve_ambiguous -x` | Wave 0 |
| UPDATE-03 | No candidates above AMBIGUOUS_LOW → `no_match` | unit | `pytest tests/test_updates.py::test_resolve_no_match -x` | Wave 0 |
| NOTIF-07 | `schedule_checkin()` registers job `"mid_day_checkin"` on scheduler | unit (MemoryJobStore fixture) | `pytest tests/test_updates.py::test_schedule_checkin_registers_job -x` | Wave 0 |
| NOTIF-07 | Check-in job target calls `PushoverClient.send` with `url` kwarg | unit (mock) | `pytest tests/test_updates.py::test_checkin_notification_includes_url -x` | Wave 0 |
| NOTIF-07 | GET/PUT `/api/v1/settings/check-in-time` round-trips | integration | `pytest tests/test_updates.py::test_checkin_time_settings_roundtrip -x` | Wave 0 |
| INGEST-08 | `POST /ingest/confirm` with `updates` list applies `done` action | integration | `pytest tests/test_updates.py::test_ingest_intra_day_update_applies -x` | Wave 0 |
| INGEST-08 | Posting same `update_id` twice produces no double-mutation | integration | `pytest tests/test_updates.py::test_ingest_update_idempotent -x` | Wave 0 |
| INGEST-08 | Payload with `schema_version: "1.0"` + empty `updates` still accepted | integration | `pytest tests/test_updates.py::test_ingest_v10_still_valid -x` | Wave 0 |

### How to Assert No LLM/HTTP Call (UPDATE-02)

Use `unittest.mock.patch` to patch `httpx.Client` at the module level. If resolution code ever instantiates an httpx Client during `resolve_update`, the test will record the call. Assert zero calls:

```python
# tests/test_updates.py
from unittest.mock import patch, MagicMock

def test_no_http_call():
    from app.services.resolution_service import resolve_update
    # build mock blocks/tasks in-memory (no DB needed for pure function)
    blocks = [SimpleNamespace(id=1, title="Morning standup prep")]
    tasks  = [SimpleNamespace(id=2, title="Review PR", completed=False)]

    with patch("httpx.Client") as mock_client:
        result = resolve_update("done with standup", blocks, tasks)

    mock_client.assert_not_called()  # zero HTTP calls during resolution
    assert result["status"] == "resolved"
```

### How to Test Reboot Persistence (NOTIF-07)

Reboot persistence is validated indirectly: verify the job is stored to the SQLAlchemyJobStore (not just in memory). In tests, swap to MemoryJobStore to test the scheduling logic, but add a separate integration test that:

1. Calls `schedule_checkin(12, 0)` with the real SQLAlchemy jobstore pointing at the test DB.
2. Queries `scheduler.get_job("mid_day_checkin")` to confirm it exists.
3. Shuts down and restarts the scheduler (creates a new `AsyncIOScheduler` with the same SQLAlchemy URL).
4. Asserts the job is re-loaded from the store.

This mirrors the pattern already validated for the daily brief in the existing acceptance criteria for Phase 3.

### How to Test Idempotency (INGEST-08)

```python
def test_ingest_update_idempotent():
    # First: create a task via the API
    task = client.post("/api/v1/tasks/", json={"title": "Deploy to staging"}).json()
    task_id = task["id"]

    payload = {
        "schema_version": "1.1",
        "updates": [{
            "update_id": "upd-001",
            "entity_type": "task",
            "entity_id": task_id,
            "action": "done",
        }],
    }
    r1 = client.post("/api/v1/ingest/confirm", json=payload)
    assert r1.status_code == 200

    task_after_first = client.get(f"/api/v1/tasks/{task_id}").json()
    assert task_after_first["completed"] is True

    # Second post: same update_id → no additional mutation
    r2 = client.post("/api/v1/ingest/confirm", json=payload)
    assert r2.status_code == 200

    task_after_second = client.get(f"/api/v1/tasks/{task_id}").json()
    assert task_after_second["completed"] is True  # same state, not double-mutated
    # For 'done', stateless idempotency: completed=True is idempotent.
    # For 'reschedule', test that the time has not changed on second post.
```

### Sampling Rate

- **Per task commit:** `cd backend && python -m pytest tests/test_updates.py -x -q`
- **Per wave merge:** `cd backend && python -m pytest -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_updates.py` — all 10 named tests above (all red until implementation)
- [ ] `app/schemas/update.py` — `UpdateRequest`, `UpdateResponse` Pydantic models (needed for test imports to resolve)
- [ ] `app/services/resolution_service.py` — stub with `resolve_update` signature only
- [ ] `rapidfuzz>=3.9,<4.0` added to `pyproject.toml` (tests that import it will error otherwise)

---

## Open Questions

1. **"No new dependencies" constraint interpretation**
   - What we know: REQUIREMENTS.md says "no new dependencies, no server-side LLM" for v2.1
   - What's unclear: Does "no new dependencies" mean zero new pip packages, or does it mean no LLM/heavyweight dependencies?
   - Recommendation: `rapidfuzz` is a lightweight C-extension string utility, not an LLM. The STATE.md explicitly calls out "no server-side LLM" as the core constraint. Proceed with adding `rapidfuzz`. If this is challenged, the only alternative is Python stdlib `difflib.SequenceMatcher` which is significantly less accurate but has zero dependencies. Flag in Wave 0 plan.

2. **Threshold values (CONFIDENT_THRESHOLD = 80, AMBIGUOUS_LOW = 50)**
   - What we know: These are reasonable starting values from community practice
   - What's unclear: Real-world title lengths in this app (short titles like "Review PR" score differently than "Morning standup preparation meeting")
   - Recommendation: Export as module-level constants; validate in test with a representative title pool of ~10 items. Allow adjustment without code change.

3. **INGEST-08 idempotency mechanism: stateless vs. UpdateLog table**
   - What we know: Stateless idempotency works for `done`/`drop` (applying twice leaves same state). For `reschedule`, applying twice with a different `reschedule_to` in the same payload would be a problem.
   - What's unclear: Whether INGEST-08 will be used for single `update_id` per apply or could send multiple different values.
   - Recommendation: Use stateless idempotency for `done`/`drop` (check entity state before applying). Add `UpdateLog(update_id unique)` only for `reschedule` to avoid conflicting re-schedules. Minimises schema complexity.

4. **Alembic HEAD confirmation**
   - What we know: STATE.md notes "Current Alembic HEAD: verify latest migration number before writing Phase 12 migrations (known: 0011+ from task-lists quick task)". Codebase shows migrations up to 0014.
   - What's unclear: Whether any un-committed migration exists between 0014 and the current DB state.
   - Recommendation: Wave 0 plan must run `alembic heads` on the Pi to confirm HEAD = 0014 before writing migration 0015. Migration chain: `0015` down_revision = `"0014"`.

---

## Sources

### Primary (HIGH confidence)

- Existing codebase: `app/scheduler.py` — APScheduler patterns, jobstore, id= convention
- Existing codebase: `app/services/guidance_service.py` — sync service pattern for APScheduler-fired jobs
- Existing codebase: `app/services/ingest_service.py` — idempotency via external_key upsert
- Existing codebase: `app/schemas/ingest.py` — IngestPayload structure, extra="forbid", Literal schema_version
- Existing codebase: `app/models/__init__.py` — AppSettings nullable column pattern
- Existing codebase: `app/main.py` — lifespan job registration from DB settings pattern
- Existing codebase: `app/services/pushover.py` — PushoverClient.send signature
- Existing codebase: `backend/pyproject.toml` — confirmed rapidfuzz NOT yet a dependency
- [rapidfuzz PyPI](https://pypi.org/project/RapidFuzz/) — confirmed 3.14.5 latest, available
- [rapidfuzz process docs](https://rapidfuzz.github.io/RapidFuzz/Usage/process.html) — extractOne/extract return types verified
- [rapidfuzz fuzz docs](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html) — WRatio, token_set_ratio, partial_ratio score range 0-100 confirmed

### Secondary (MEDIUM confidence)

- [STATE.md decisions] — `[v2.1 roadmap]` entries confirm deep-link URL format `/today?update=1`, INGEST-08 schema_version bump approach, no new migration needed if check-in stored in existing app_settings

### Tertiary (LOW confidence)

- Community threshold recommendations (CONFIDENT_THRESHOLD=80, AMBIGUOUS_LOW=50) — based on general rapidfuzz practice; needs validation with actual title data

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — rapidfuzz version confirmed on PyPI; all other libraries already in project
- Architecture: HIGH — all patterns derived from existing codebase; minimal inference
- Pitfalls: HIGH — specific to known codebase conventions (test jobstore pattern, nullable column pattern, PushoverClient limitation)
- Thresholds: MEDIUM — reasonable defaults; require empirical validation

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable libraries; rapidfuzz API is stable across 3.x)
