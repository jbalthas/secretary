# Stack Research

**Project:** My Secretary (self-hosted personal assistant, Raspberry Pi 5)
**Researched:** 2026-06-29 (v2.2 "LLM Advisory Loop" addendum)
**Confidence:** HIGH

> Everything above the v2.2 section below remains in force. This addendum covers ONLY the four
> new capabilities in v2.2 and answers whether any of them require new dependencies.
> Short answer: none of the four features require a new runtime dependency.

---

## v2.2 Stack Addendum — LLM Advisory Loop

### Current dependency baseline (from pyproject.toml, confirmed live)

```
fastapi[standard]>=0.128,<0.129
sqlalchemy[asyncio]>=2.0,<2.1
aiosqlite>=0.20,<0.21
alembic>=1.13,<1.14
pydantic-settings>=2.0
apscheduler>=3.11,<4.0
httpx>=0.27
icalendar>=7.1,<8.0
recurring-ical-events>=3.8,<4.0
google-api-python-client>=2.0
google-auth-oauthlib>=1.0
google-auth-httplib2>=0.2
itsdangerous>=2.2.0
pychromecast==14.0.9
gTTS==2.5.4
rapidfuzz>=3.9,<4.0
```

Migration chain is currently at revision `0016`. Next migration must be `0017`.

---

### (A) Context Export — Markdown + JSON bundle from existing Pydantic/SQLAlchemy data

**Decision: stdlib only (`json`, `textwrap`, `datetime`). Zero new dependencies.**

**Confidence:** HIGH

The export bundle is a string assembly problem, not a templating problem. Every piece of data
comes from existing SQLAlchemy models already loaded in-process. The output format is
Markdown prose + fenced JSON blocks, which is just string concatenation:

- `json.dumps(payload, indent=2, default=str)` — serializes any dict with datetime fallback.
  `default=str` handles `date` and `datetime` objects without `jsonencoder` subclassing.
- `textwrap.dedent` — useful for multi-line Markdown sections; entirely optional.
- `datetime.date.today().isoformat()` — export timestamp.

**Pattern: a `export_service.py` module** with a synchronous build function (matching the
`brief.py` / `guidance_service.py` pattern already in the codebase):

```python
# app/services/export_service.py
import json
from datetime import date, datetime, timezone

async def build_context_bundle(session: AsyncSession) -> dict:
    """Returns {"markdown": str, "json_payload": dict}"""
    # 1. Query Goal + Milestone rows (lazy="selectin" already loads them)
    # 2. For each goal: compute_progress() from goal_service — already exists
    # 3. Pull recent ScheduledBlock completions for planned-vs-actual
    # 4. Pull recent UpdateLog entries for reschedule/drop history
    # Return Markdown str + structured dict
```

The Markdown section of the bundle has three blocks:
1. **Goals summary** — for each active goal: title, type, target_date, progress_pct,
   milestone status (done/total), and the most urgent pending task. This is identical to
   `brief.py`'s `build_brief_body()` goal section, extended with milestone detail.
2. **Planned-vs-actual (rolling 14 days)** — completed blocks vs scheduled blocks per goal,
   derived from `ScheduledBlock.completed` and `Task.completed_at`. No new table needed for
   this part; the data already exists.
3. **Momentum indicators** — task completion rate over last 7/14/30 days, habit streak.
   Pure SQL aggregates on the existing `tasks` table (no new columns needed for the basic
   version; the `progression_substrate` migration in section B provides richer history).

**JSON block in the export** is a clean dict (not the full DB schema) that the LLM can
reference alongside the Markdown prose. It contains the same data in structured form:
goals array with milestones and progress, plus the recent-history summary. Serialized with
`json.dumps(..., default=str)` — no custom encoder needed.

**FastAPI endpoint:** `GET /api/v1/export/context` returns
`{"markdown": "...", "json_payload": {...}}`. The frontend copies both sections to clipboard
or displays them in a `<pre>` block for manual paste into the LLM.

**What NOT to add:**
- `jinja2` — not needed; string f-expressions and `"\n".join(lines)` are sufficient for
  this volume of templating. Jinja is already NOT in the project and this is not a reason
  to add it.
- `markdown` (PyPI) — we are GENERATING Markdown text for output; we are not parsing or
  rendering it server-side. The output goes to the user's clipboard and then into an LLM.
- `tiktoken` (OpenAI tokenizer) — see section D for the stdlib alternative.

---

### (B) Progression Substrate — Historical progress/adherence in SQLite

**Decision: append-only event log (not snapshot table). Alembic migration `0017`.**

**Confidence:** HIGH

Two patterns exist for tracking history in SQLite at this scale:

**Option 1 — periodic snapshots:** A cron job fires (e.g., daily at midnight) and
inserts one row per goal recording its current `progress_pct`, `tasks_done`, `tasks_total`.

**Option 2 — append-only event log:** Write a row every time a meaningful state change
occurs: task completed, milestone ticked, task rescheduled, goal status changed.

**Recommendation: append-only event log.** Rationale for this project:

1. **Richer for the LLM.** The advisory export can surface "6 tasks completed this week,
   2 rescheduled, 1 dropped" from raw events. A daily snapshot gives you daily progress
   percentages but loses the "what actually happened" narrative.
2. **No APScheduler job required.** Snapshots need a scheduled writer; events are written
   in-band at the moment of change (inside `ingest_service._apply_update` and the goals
   update path). No new scheduler job.
3. **SQLite handles it.** At personal-project scale (tens of goals, hundreds of tasks),
   an event log grows at < 100 rows/week. A `LIMIT 500` query in the export covers months
   of history. SQLite with a `(goal_id, recorded_at)` composite index handles this trivially.
4. **Simpler to query for trends.** `GROUP BY strftime('%Y-%W', recorded_at)` gives weekly
   counts. Snapshots need interpolation to fill gaps.

**The one case where snapshots add value:** progress percentage at a point in time, useful
if you want a "progress chart" in the UI. The hybrid approach — log events now, add a
snapshot column later if a chart is needed — is preferable to over-engineering upfront.

**New SQLAlchemy model (`ProgressEvent`):**

```python
class EventKind(str, enum.Enum):
    task_completed = "task_completed"
    task_rescheduled = "task_rescheduled"
    task_dropped = "task_dropped"
    milestone_completed = "milestone_completed"
    goal_status_changed = "goal_status_changed"

class ProgressEvent(Base):
    __tablename__ = "progress_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("goals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[EventKind] = mapped_column(SAEnum(EventKind), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "task"|"milestone"
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entity_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # e.g. reschedule target
```

`meta_json` holds a small JSON string (stdlib `json.dumps`) for event-specific detail
(e.g., `{"rescheduled_to": "2026-07-05"}`). This avoids adding columns for every event type.

**Migration `0017`:**
```python
revision = "0017"
down_revision = "0016"

def upgrade():
    op.create_table(
        "progress_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("goal_id", sa.Integer(), sa.ForeignKey("goals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.Enum(..., name="eventkind"), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("entity_title", sa.String(255), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
    )
    op.create_index("ix_progress_events_goal_id", "progress_events", ["goal_id"])
    op.create_index("ix_progress_events_recorded_at", "progress_events", ["recorded_at"])
```

**Where events are written:**
- `ingest_service._apply_update` — already handles `done`, `reschedule`, `drop` actions.
  Add `session.add(ProgressEvent(...))` after each action branch. This is in-band and async.
- `ingest_service._upsert_goal` — when `existing.status` changes, log a
  `goal_status_changed` event.
- `ingest_service._upsert_milestone` (milestone reconciliation) — when `mi.done` flips True
  on an existing milestone, log `milestone_completed`.
- Direct task completion via the existing tasks router — add a thin `record_progress_event`
  call there too.

**What NOT to add:**
- `sqlalchemy-history` / `versionalchemy` — heavyweight audit-trail libraries designed for
  full-row versioning. Overkill; a simple append-only table is sufficient.
- `alembic-utils` — for creating functions/triggers. All event writing is application-level;
  no DB triggers needed.

---

### (C) Advisory Ingest Payload — Extending the existing ingest contract

**Decision: add `AdvisoryPayload` as a new discriminated-union branch on `schema_version`.
Pydantic v2 already supports this. Zero new dependencies.**

**Confidence:** HIGH

The current `IngestPayload` uses `schema_version: Literal["1.0", "1.1"]`. The cleanest
extension is to add `"2.0"` as a new literal that routes to an `AdvisoryPayload` model:

```python
# app/schemas/ingest.py (additions)

class AdvisoryGoalAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    rationale: str = Field(..., max_length=2000)  # LLM must explain every change
    new_target_date: date | None = None
    new_title: str | None = Field(None, max_length=255)
    new_description: str | None = Field(None, max_length=2000)
    new_milestones: list[MilestoneImport] = []  # reuse existing MilestoneImport

class AdvisoryTaskAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_key: str = Field(..., max_length=200)
    rationale: str = Field(..., max_length=2000)
    new_due_date: datetime | None = None
    new_priority: Priority | None = None
    new_title: str | None = Field(None, max_length=255)

class AdvisoryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["2.0"]
    advisor_summary: str = Field(..., max_length=4000)  # LLM's top-level advice
    goal_adjustments: list[AdvisoryGoalAdjustment] = []
    task_adjustments: list[AdvisoryTaskAdjustment] = []
    new_goals: list[GoalImport] = []       # reuse existing GoalImport
    new_tasks: list[TaskImport] = []       # reuse existing TaskImport
```

**Discriminated union** (Pydantic v2 native, no extra library):

```python
from typing import Annotated, Union
from pydantic import Field

AnyIngestPayload = Annotated[
    Union[IngestPayload, AdvisoryPayload],
    Field(discriminator="schema_version")
]
```

FastAPI accepts `AnyIngestPayload` as a body type. Pydantic v2 routes automatically based
on the `schema_version` value in the incoming JSON. `GET /api/v1/ingest/schema` should be
split into two endpoints or extended to return both schemas:

```python
@router.get("/schema")
async def get_schema():
    return IngestPayload.model_json_schema()

@router.get("/schema/advisory")
async def get_advisory_schema():
    return AdvisoryPayload.model_json_schema()
```

**`advisory_service.py`** — separate from `ingest_service.py`. Implements the advisory
dry-run and commit, with the same `validate → preview → confirm` flow already in the UI.
Key difference: advisory changes come with `rationale` fields that are stored in
`progress_events.meta_json` (logging "LLM suggested X because Y") and displayed in the
sync-review UI diff before the user confirms.

**What NOT to add:**
- `jsonpatch` (PyPI) — not needed; the diff is computed at the application layer by
  comparing advisory adjustments against current DB state, not as a JSON patch operation.
- `deepdiff` (PyPI) — same rationale; field-level comparison is straightforward with
  Pydantic model attributes.
- Any LLM SDK — the advisory payload is always user-pasted; the server never calls an LLM.

**Versioning contract:** When `AdvisoryPayload` is defined, update the existing
`GET /api/v1/ingest/schema` documentation comment and the advisor prompt doc to specify
`"schema_version": "2.0"`. The existing `"1.0"` / `"1.1"` contract is unchanged and
still accepted by the ingest endpoint.

---

### (D) Token-budget / size estimation using stdlib only

**Decision: character-count heuristic via `len()`. No tokenizer dependency.**

**Confidence:** HIGH

The goal is to warn the user if the export bundle may be too large to paste into an LLM
context window. The accurate answer requires a model-specific tokenizer (e.g., `tiktoken`
for GPT-4, `sentencepiece` for Claude). Both are runtime dependencies with C extensions.
Neither belongs on a Pi with a hard no-new-deps constraint.

**Stdlib heuristic — accurate enough:**

English prose and JSON average roughly 3.5–4.5 characters per token for GPT-4 / Claude
models. A conservative estimate of 4 chars/token gives a usable upper-bound warning:

```python
def estimate_tokens(text: str) -> int:
    """Conservative 4-chars-per-token heuristic for English + JSON mixed content."""
    return len(text) // 4

def token_budget_warning(text: str, limit: int = 100_000) -> str | None:
    estimated = estimate_tokens(text)
    if estimated > limit:
        return f"Export is approximately {estimated:,} tokens — may exceed some LLM context limits."
    return None
```

`len(text)` is a pure stdlib O(n) operation. At the scale of this export (< 50 goals,
14-day history), the bundle will be 5,000–20,000 characters — well under any 2026 LLM
context window (Claude 3.5: 200k tokens; GPT-4o: 128k tokens). The estimate is informational,
not a hard gate; no user should be blocked by it.

**Return estimate in the export endpoint response:**

```python
# GET /api/v1/export/context response
{
  "markdown": "...",
  "json_payload": {...},
  "estimated_tokens": 3842,
  "token_warning": null
}
```

**What NOT to add:**
- `tiktoken` — GPT-specific tokenizer, ~5MB wheel with Rust extension. Accurate but
  unnecessary when a ±20% heuristic is sufficient for a "heads up" warning.
- `sentencepiece` — Claude/LLaMA tokenizer; same concern. The heuristic is good enough.
- `transformers` (HuggingFace) — multi-hundred-MB package. Absolutely not.

---

### (E) Sync Review UI — Export → LLM → Advisory Ingest → Diff

**Decision: extend existing React + useIngest hook pattern. No new frontend dependencies.**

**Confidence:** HIGH

The sync review UI is a 3-step flow:

1. **Export:** Button triggers `GET /api/v1/export/context`. Response displays `markdown` in
   a `<pre>` block with a "Copy" button (`navigator.clipboard.writeText` — native browser
   API, no library). JSON payload displayed separately for reference.

2. **Advisory Ingest paste:** Reuse the existing `<textarea>` + JSON parse pattern from the
   current `IngestPage` / `useIngest` hook. The only difference is the endpoint:
   `POST /api/v1/ingest/preview` accepts `AdvisoryPayload` (schema_version `"2.0"`) and
   returns an `AdvisoryPreviewResult` (new Pydantic response model).

3. **Diff view:** Display each `goal_adjustment` and `task_adjustment` as a before/after
   card: current DB value vs. LLM-proposed value + `rationale`. This is a render of the
   `AdvisoryPreviewResult` returned by the preview endpoint — no client-side diff
   computation needed. The backend does the field comparison and returns structured diffs.

**New frontend types** (TypeScript interfaces only, zero new npm packages):

```typescript
interface AdvisoryGoalDiff {
  external_key: string;
  title: string;
  rationale: string;
  changes: { field: string; current: string | null; proposed: string | null }[];
}

interface AdvisoryPreviewResult {
  advisor_summary: string;
  goal_diffs: AdvisoryGoalDiff[];
  task_diffs: AdvisoryTaskDiff[];
  new_goals: EntityDiff[];
  new_tasks: EntityDiff[];
}
```

**Clipboard copy** — `navigator.clipboard.writeText(text)` is available in all modern
browsers on HTTPS (or localhost). No library needed.

**What NOT to add:**
- `react-diff-viewer` / `diff2html` — these are code-diff renderers. The advisory diff is
  structured data (field-by-field), not a text diff. Render it as a table or card list.
- `react-markdown` — the `advisor_summary` field is a short string, not a Markdown document
  that needs rendering. Display it in a `<p>` tag.
- Any copy-to-clipboard library — `navigator.clipboard` is sufficient.

---

## Installation Delta for v2.2

**Zero new dependencies. No changes to `pyproject.toml`.**

The only code additions are:

**Backend:**
- `app/models/__init__.py` — add `ProgressEvent`, `EventKind` (new model)
- `app/schemas/ingest.py` — add `AdvisoryGoalAdjustment`, `AdvisoryTaskAdjustment`,
  `AdvisoryPayload`, `AnyIngestPayload`, `AdvisoryPreviewResult`
- `app/services/export_service.py` — new file, async, queries existing models
- `app/services/advisory_service.py` — new file, advisory dry-run + commit
- `app/routers/export.py` — new file, `GET /api/v1/export/context`
- `app/routers/ingest.py` — extend to route `AdvisoryPayload` to advisory service
- `app/services/ingest_service.py` — add `session.add(ProgressEvent(...))` calls at
  done/reschedule/drop/milestone transitions
- `backend/migrations/versions/0017_add_progress_events.py` — new Alembic migration

**Frontend:**
- `src/pages/SyncReviewPage.tsx` — new page (export → paste → diff → confirm)
- `src/hooks/useContextExport.ts` — new hook for `GET /api/v1/export/context`
- `src/hooks/useAdvisoryIngest.ts` — new hook (thin wrapper over `useIngest` pattern)
- `src/components/AdvisoryDiffCard.tsx` — new component for before/after field display
- `src/types/advisory.ts` — new TypeScript interfaces

---

## What NOT to Add (v2.2 Explicit Blocklist)

| Avoid | Why | Notes |
|-------|-----|-------|
| `tiktoken` | Tokenizer accuracy not needed; 4-char heuristic is sufficient for a warning | Would need a Rust-extension wheel on aarch64 |
| `sentencepiece` | Same as tiktoken | C extension, unnecessary |
| `jinja2` | Markdown export is string assembly, not template rendering | Not in project; no reason to add it |
| `markdown` (PyPI) | We generate Markdown, not render it | LLM receives raw Markdown text |
| `jsonpatch` / `deepdiff` | Advisory diff is field-level comparison in Python, not JSON patch | Pydantic model attributes are sufficient |
| `sqlalchemy-history` | Full-row versioning library | Simple append-only event table is sufficient |
| `react-diff-viewer` | Code diff renderer | Advisory diff is structured data, not text diff |
| `react-markdown` | Markdown renderer | `advisor_summary` is a short string, use `<p>` |
| `navigator.clipboard` library | Copy-to-clipboard | Native browser API |
| Any LLM SDK | Server never calls an LLM | Hard constraint, locked since v2.0 |
| `APScheduler` job for snapshots | Events are written in-band at state changes | No new scheduler job needed |

---

## Integration Points

| Feature | Hooks Into | File(s) |
|---------|-----------|---------|
| Export service | `goal_service.compute_progress`, `ScheduledBlock`, `Task`, `UpdateLog`, new `ProgressEvent` | `export_service.py` |
| Progression event writes | `ingest_service._apply_update` (done/reschedule/drop), milestone reconciliation in `_upsert_goal`, goal status change in `_upsert_goal` | `ingest_service.py` |
| Advisory payload type | `IngestPayload` discriminated union in `schemas/ingest.py`; new `advisory_service.py` | `ingest.py` (schema + router) |
| Advisory schema endpoint | New `GET /api/v1/ingest/schema/advisory` alongside existing `GET /api/v1/ingest/schema` | `routers/ingest.py` |
| Token estimate | `len(bundle_text) // 4` in `export_service.py`, returned in export response | `export_service.py` |
| Alembic chain | `0016` → `0017` (progress_events table); no branching | `0017_add_progress_events.py` |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Stdlib for export bundle | HIGH | `json`, `datetime`, string ops — all stdlib, all in use in the project already |
| Append-only event log vs. snapshots | HIGH | Standard SQLite audit-log pattern; no novel architecture |
| Pydantic v2 discriminated union for AdvisoryPayload | HIGH | `Literal` + `Union` discriminated union is a documented, stable Pydantic v2 feature; already used in the project for `schema_version: Literal["1.0", "1.1"]` |
| 4-char/token heuristic | MEDIUM | ±20% accuracy; fine for a warning label, not for production billing; validated against known GPT-4 tokenization behavior |
| No new frontend deps for sync-review UI | HIGH | The export→paste→diff→confirm flow mirrors the existing ingest UI precisely; no novel interaction patterns |

---

## Sources

All findings based on direct inspection of the live codebase (`backend/pyproject.toml`,
`backend/app/schemas/ingest.py`, `backend/app/services/ingest_service.py`,
`backend/app/models/`, `backend/migrations/versions/0001–0016`). No speculative claims.

- Pydantic v2 discriminated unions (Literal discriminator): https://docs.pydantic.dev/latest/concepts/unions/#discriminated-unions
- Python `json.dumps` `default` parameter (stdlib): https://docs.python.org/3/library/json.html#json.JSONEncoder
- SQLite `strftime` group-by for time-series aggregation: https://www.sqlite.org/lang_datefunc.html
- Token-count heuristics (4 chars/token for English + JSON): based on known GPT-4 tokenizer
  behavior; Claude 3.5 is similar. No official source — flagged MEDIUM confidence.
- Alembic batch migration (SQLite ALTER TABLE workaround): https://alembic.sqlalchemy.org/en/latest/batch.html — already used in `0015`, `0016`.

---

*Stack research addendum for: My Secretary v2.2 "LLM Advisory Loop"*
*Researched: 2026-06-29*
