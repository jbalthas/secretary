# Phase 16 Research

**Researched:** 2026-06-30
**Domain:** Backend (FastAPI/SQLAlchemy async ingest extension) + Frontend (React diff review UI)
**Confidence:** HIGH (all findings from direct repo reads, no external library research needed — pure pattern extension)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
See `.planning/phases/16-advisory-ingest-sync-review-ui/16-CONTEXT.md` "Locked (not discussed)" and D-01..D-12 in full — copied/applied throughout this document's sections rather than verbatim-pasted twice. Key locked items:
- `AdvisoryPayload` + `GoalAdjustment`/`MilestoneAdjustment`/`TaskCreation`; `payload_type` discriminator default `"standard"`; `rationale: str` required; `ConfigDict(extra="forbid")` everywhere; `TaskCreation` create-only.
- Goal match by `external_key`; milestone match by `(goal, title)`.
- Apply path: `await session.flush()` + shared `goal_key_to_id` map reused with `apply_import` (no fork); order goals → milestones → tasks.
- Idempotency: `advisory_id` via new `AdvisoryLog` (migration 0018, mirrors `UpdateLog`); new tasks carry stable advisory-derived `external_key`; `Task.external_key` UNIQUE guards re-confirm dupes.
- `AppSettings.last_advisory_at` stamped on confirm (0018 migration adds it).
- CI/grep guard: `grep -r "anthropic\|openai\|litellm" backend/app/` returns zero.
- PROMPT-01: regenerate `advisorPrompt.ts` `[SCHEMA BLOCK]` from `AdvisoryPayload.model_json_schema()`.

### Claude's Discretion
- Visual styling of new diff component, notes callout, staleness banner (follow existing CSS vars).
- Shape of `useAdvisory` hook (modeled on `useIngest`).
- Success-summary copy/format (D-08).
- Whether new diff component lives in `Advisor.tsx` or extracted component.

### Deferred Ideas (OUT OF SCOPE)
- File-upload for advisory paste box (paste-only, D-07).
- Partial-then-resume advisory apply (one-shot idempotency, D-05).
- Export/Import tabs or guided stepper (single linear page, D-06).
- Per-row accept flags / server-side subset filtering (client filters only, D-04).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADVISE-01 | Advisory payload schema + validation | Schemas section |
| ADVISE-02 | Preview with no DB writes | ingest_service reuse section (dry_run pattern) |
| ADVISE-03 | Field-level diff (entity/field/old/new/rationale) | Schemas section (EntityDiff extension) |
| ADVISE-04 | Diff review UI grouped by entity type | Frontend section |
| ADVISE-05 | Atomic confirm | ingest_service reuse section (session.begin()) |
| ADVISE-06 | Notes display-only, never persisted | Frontend section + Validation Architecture |
| ADVISE-07 | Per-row accept/reject (client-side) | Frontend section |
| ADVISE-08 | New-task creation reusing apply_import path | ingest_service reuse section |
| SYNC-01 | Single-page paste/preview/confirm loop | Frontend section |
| SYNC-02 | Last-sync + staleness banner | Frontend section + AdvisoryLog/AppSettings section |
| PROMPT-01 | Schema-block regen from model_json_schema() | PROMPT-01 section |
</phase_requirements>

## Backend: ingest_service reuse surface

**File:** `backend/app/services/ingest_service.py`

### `apply_import` (lines 211-251) — transaction shape to mirror
```python
async def apply_import(payload: IngestPayload, session: AsyncSession) -> IngestResult:
    created = {"goals": 0, "tasks": 0, "routines": 0, "habits": 0}
    updated = {"goals": 0, "tasks": 0, "routines": 0, "habits": 0}
    async with session.begin():
        goal_rows: list[tuple[str, Goal]] = []
        for g in payload.goals:
            row, was_created = await _upsert_goal(g, session)
            (created if was_created else updated)["goals"] += 1
            goal_rows.append((g.external_key, row))
        await session.flush()
        goal_key_to_id: dict[str, int] = {key: row.id for key, row in goal_rows}
        for t in payload.tasks:
            goal_id = goal_key_to_id.get(t.goal_key) if t.goal_key else None
            _, was_created = await _upsert_task(t, goal_id, session)
            ...
```
- Atomicity comes from `async with session.begin():` wrapping the whole apply — any exception inside rolls back everything. This satisfies success criterion 2 ("injecting a DB error mid-apply leaves zero changes persisted"). The new advisory apply function MUST use the same `async with session.begin():` wrapper so a mid-loop failure (e.g. duplicate `Task.external_key` IntegrityError on flush) rolls back goals + milestones + tasks together.
- `goal_key_to_id` is built **after `await session.flush()`** — only way new (uncommitted) `Goal.id` values exist before commit. Locked decision requires the advisory apply reuse this exact two-step (collect rows → flush → build dict), not a fresh re-query.
- `apply_import` takes `IngestPayload` (standard schema) — it is **not** generic over payload type. The advisory apply is a **new function** (e.g. `apply_advisory` in the same module) that handles goal/milestone adjustment logic itself, but for **new tasks** constructs `TaskImport`-shaped objects and calls the existing `_upsert_task` helper directly — this is the literal meaning of "reuses the apply_import task-creation path (no fork)": call `_upsert_task`, don't duplicate its body.

### `_upsert_task` (lines 62-89) — exact signature new-task creation reuses
```python
async def _upsert_task(t: TaskImport, goal_id: int | None, session: AsyncSession) -> tuple[Task, bool]:
```
- Selects by `Task.external_key` (UNIQUE); found → update fields in place (no dupe); not found → insert. This existing "select-by-external_key, branch" shape is exactly how `Task.external_key` UNIQUE guards re-confirm dupes: the advisory's new-task `external_key` must be **stable/deterministic** (derive from `advisory_id` + a per-item discriminator, e.g. `f"advisory-{advisory_id}-{index}"` or hash of title) so re-confirming the same advisory resolves to the same row via this lookup, not a fresh insert.
- `_upsert_task` only reads `t.external_key/.title/.description/.priority/.due_date/.list_name/.parent_list_name` off its argument — the advisory apply must construct a `TaskImport(...)` instance (or equivalent) from each `TaskCreation` item to call it. `TaskCreation` (locked: create-only, no `id`) supplies a subset of these fields; absent optional fields default to `None`/schema defaults.

### Idempotency pattern to mirror — `_apply_update` (lines 146-180), the `UpdateLog` precedent
```python
async def _apply_update(u: IntraDayUpdateImport, session: AsyncSession) -> None:
    if u.action == UpdateAction.reschedule:
        seen = await session.execute(select(UpdateLog).where(UpdateLog.update_id == u.update_id))
        if seen.scalar_one_or_none() is not None:
            return  # already applied
    ...
    session.add(UpdateLog(update_id=u.update_id))
```
"Seen before? return early; else apply + log" is the literal template for advisory-level idempotency: at the top of the new advisory apply function (before/inside `async with session.begin():`), `SELECT AdvisoryLog WHERE advisory_id == payload.advisory_id`; if found, return without re-applying (locked: "returns the original result, applies nothing new" — see Open Question on what counts as "the original result"). If not found, apply, then `session.add(AdvisoryLog(advisory_id=...))` inside the same transaction so the log insert commits atomically with the data changes.

### `dry_run_import` (lines 187-208) — preview pattern (no DB writes)
```python
async def dry_run_import(payload: IngestPayload, session: AsyncSession) -> IngestPreviewResult:
    goals = [EntityDiff(external_key=g.external_key, title=g.title,
              action="update" if await _exists(Goal, g.external_key, session) else "create")
             for g in payload.goals]
    ...
```
- Read-only `SELECT` via `_exists()` (line 182) — no `session.add`, `session.begin()`, or flush. The advisory preview follows the same shape: for each `GoalAdjustment`/`MilestoneAdjustment`, `SELECT` the existing row by `external_key` (or `(goal, title)` for milestones) to read **current field values** for the old→new diff, never writing. `TaskCreation` items are always `action="create"` (create-only schema — no existing-task match possible), but the **parent goal's** `external_key` must still resolve or the row is invalid (a 422 at validation time per success criterion 1, "references an unknown goal external_key").
- **Field-level diff** (ADVISE-03) is genuinely new: today's `EntityDiff` only carries `external_key/title/action`. The advisory preview needs per-field old/new values (see Schemas section) — `dry_run_import`'s per-item SELECT loop is reusable; the diff *row shape* it constructs is not.

### `_exists` helper (lines 182-184)
```python
async def _exists(model, external_key: str, session: AsyncSession) -> bool:
    result = await session.execute(select(model).where(model.external_key == external_key))
    return result.scalar_one_or_none() is not None
```
Generic over model — directly reusable for goal-existence checks (model=`Goal`). For `Milestone`, the locked match key is `(goal, title)` — a compound key `_exists` does not support; the advisory preview/apply needs a small new helper or inline query: `select(Milestone).where(Milestone.goal_id == goal_id, Milestone.title == m.title)`.

**Confidence: HIGH** — read directly from source; line numbers verified 2026-06-30.

## Backend: schemas & payload_type discriminator

**File:** `backend/app/schemas/ingest.py`

### Existing `IngestPayload` (lines 103-111) — where `payload_type` discriminator lands
```python
class IngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1.0", "1.1"]
    goals: list[GoalImport] = []
    tasks: list[TaskImport] = []
    routines: list[RoutineImport] = []
    habits: list[HabitImport] = []
    updates: list[IntraDayUpdateImport] = []
```
**No `payload_type` field exists today.** Backward-compat requirement (locked, roadmap gate) means the planner must add `payload_type: Literal["standard"] = "standard"` to `IngestPayload` itself (default preserves old payloads with zero `payload_type` key — Pydantic v2 defaults satisfy this automatically; no migration of existing test fixtures needed) — this is the "regression test required" item from ROADMAP.md. `AdvisoryPayload` is a **separate, sibling** Pydantic model (not a subclass union with `IngestPayload`) carrying `payload_type: Literal["advisory"]` — confirmed by `advisorPrompt.ts`'s example payload (`"payload_type": "advisory"`, see PROMPT-01 section). The two payload types hit **different routes** (`/ingest/confirm` for standard, a new `/advisory/confirm` for advisory) so a single discriminated union is not required for routing — but adding `payload_type` to `IngestPayload` as the locked decision states keeps both schemas symmetric and lets `/advisory/confirm` defensively reject a standard payload (or vice versa) with a clear 422 if mismatched.

### Field-by-field shape confirmed by `advisorPrompt.ts` (authoritative — this is the EXAMPLE PAYLOAD the prompt instructs the LLM to emit)
```json
{
  "payload_type": "advisory",
  "session_id": "copy-this-verbatim-from-the-brief-header",
  "goal_adjustments": [
    {"external_key": "...", "target_date": "2026-08-15", "priority_rank": 1, "rationale": "..."}
  ],
  "milestone_adjustments": [
    {"goal_external_key": "...", "title": "...", "target_date": "...", "done": false, "rationale": "..."}
  ],
  "new_tasks": [
    {"external_key": "...", "goal_external_key": "...", "title": "...", "priority": "high",
     "estimated_minutes": 90, "rationale": "..."}
  ],
  "notes": "..."
}
```
This means `AdvisoryPayload` field names are **already fixed** by the existing (Phase 15) prompt text, not free for the planner to invent: `goal_adjustments`, `milestone_adjustments`, `new_tasks`, `notes`, `session_id`, `payload_type`. An `advisory_id` field is required too (idempotency key, locked) — not shown in the example payload, meaning either (a) it must be added to the prompt's example/instructions in this phase's PROMPT-01 work, or (b) it is server-generated from a hash of payload content + session_id rather than LLM-supplied. **Open question** — flagged below; the prompt text as it stands does not mention `advisory_id` at all, so the planner must decide whether to add it to `ADVISOR_PROMPT`'s instructions (LLM supplies a UUID) or compute it server-side (e.g. SHA256 of canonicalized payload JSON). Given `rationale` and other fields are LLM-authored free text, a server-computed hash is more robust (no collision risk from LLM creativity) — but must be deterministic across whitespace/key-order so re-pasting identical content produces the identical hash. Recommend: **hash canonical JSON (sorted keys) of the full advisory payload** server-side as `advisory_id`, not LLM-supplied.

### Field types confirmed by prompt text and locked decisions
- `GoalAdjustment`: `external_key: str`, `target_date: date | None`, `priority_rank: int | None`, `rationale: str` (required). **`Goal.priority_rank` does not exist yet** on the `Goal` model (`backend/app/models/goal.py` lines 22-47 — confirmed via grep, no match) nor on the frontend `Goal` type (`frontend/src/types/goal.ts` lines 12-26). **Migration 0018 must add `priority_rank` to the `goals` table**, not just `AdvisoryLog`/`last_advisory_at` as CONTEXT.md's phrasing implies — this is a gap the planner must catch.
- `MilestoneAdjustment`: `goal_external_key: str`, `title: str` (match key, not editable per locked "title" being adjustable — re-read prompt: "Adjust a milestone's target_date, done... and title" — so title IS adjustable but match key is `(goal, title)` meaning a title rename can't also be the lookup key... actually rereading CONTEXT.md: "milestone match by (goal, title)" — so on a title-rename request the OLD title must be used for matching and `new_title` would need a separate field, or title is excluded from adjustable set in this phase. **Open question** flagged below — the prompt text says title is adjustable but the match key being `(goal, title)` creates ambiguity for rename. Recommend planner treat `title` as match-only (not adjustable) unless a `new_title` field is added — simpler, avoids match-key-mutation ambiguity, and ROADMAP's "Critical correctness gates" doesn't list title-rename as a gate.
- `TaskCreation`: `external_key` (locked: needed for idempotent re-confirm — likely server-derived, see above), `goal_external_key: str`, `title: str` (required), `description`, `due_date`, `priority: Literal["high","medium","low"]`, `estimated_minutes: int | None`, `rationale: str` (required). No `id` field (create-only, locked).

### `EntityDiff` (lines 119-122) — extend for field-level old→new
```python
class EntityDiff(BaseModel):
    external_key: str
    title: str
    action: Literal["create", "update"]
```
This is the shape the planner must extend (or create a sibling `AdvisoryEntityDiff`) to carry: `entity_type` (or rely on grouping at the result level like `IngestPreviewResult` already does with separate `goals`/`tasks`/`routines`/`habits` lists), a list of `field` changes each with `field: str`, `old: Any`, `new: Any`, plus `rationale: str` (per-row, not per-field — rationale belongs to the whole adjustment/creation, not each field). New tasks render as "add-rows" (no old value) — for those, `old` is absent/null for every field, consistent with `action="create"` in the existing pattern.

**Confidence: HIGH** for existing-code findings (direct read); **MEDIUM** for the `advisory_id` source recommendation (inferred, not in locked decisions — flagged as Open Question) and the milestone-title-adjustable-vs-match-key tension (also flagged).

## Backend: AdvisoryLog + migration 0018 (UpdateLog/AppSettings/Task template)

**File:** `backend/app/models/__init__.py`

### `UpdateLog` (lines 60-66) — exact template for `AdvisoryLog`
```python
class UpdateLog(Base):
    __tablename__ = "update_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    update_id: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```
`AdvisoryLog` should mirror this exactly: `id` PK, `advisory_id: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)` (or longer if hash-based — SHA256 hex is 64 chars, fits in 200), `created_at`. Consider also storing the **applied counts** (created/updated dict, JSON-serialized as text, or simple ints) on `AdvisoryLog` so a re-confirm can literally replay the stored result rather than recomputing — this directly resolves the Open Question above about "returns the original result." Recommend adding `result_json: Mapped[str] = mapped_column(Text, nullable=True)` to store the serialized `AdvisoryResult` so replay is exact.

### `AppSettings` (lines 43-57) — `last_advisory_at` addition point
```python
class AppSettings(Base):
    __tablename__ = "app_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    ...
    check_in_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
```
Add `last_advisory_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)` as the next column — confirmed `last_advisory_at` does **not exist yet** anywhere in `backend/` (grep returned zero matches), so this is a clean new-column addition, not a rename.

### `Task.external_key` (line 34) — UNIQUE constraint already present
```python
external_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True, index=True)
```
Already UNIQUE + indexed + nullable — no migration needed for this column itself; it's the existing guard rail the locked decision relies on for advisory new-task dedup.

### Goal model gap found — `priority_rank` missing
`backend/app/models/goal.py` `Goal` class (lines 22-47) has no `priority_rank` column. Migration 0018 must add it: `priority_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)`. This is a **scope gap** in CONTEXT.md's framing ("migration 0018 adds `last_advisory_at`") — the migration also needs `goals.priority_rank` and `AdvisoryLog` table creation, three changes total, not one.

### Migration file convention (from `migrations/versions/0017_add_goal_progress_snapshots.py` and `0015_add_checkin_and_update_log.py`)
```python
"""add goal progress snapshots"""
from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(...)
    op.create_index(...)

def downgrade():
    op.drop_index(...)
    op.drop_table(...)
```
Adding a column to an existing table uses `op.batch_alter_table(...)` (see 0015, lines 12-14) — required for SQLite ALTER TABLE compatibility (SQLite can't do all ALTER operations directly; Alembic's batch mode recreates the table). Migration 0018 (`backend/migrations/versions/0018_<description>.py`) needs:
1. `op.batch_alter_table("app_settings")` → add `last_advisory_at` column
2. `op.batch_alter_table("goals")` → add `priority_rank` column
3. `op.create_table("advisory_log", ...)` + `op.create_index(..., unique=True)` on `advisory_id`
- `revision = "0018"`, `down_revision = "0017"` (confirmed 0017 is HEAD — no later numbered migration exists; two non-numbered hash-named migrations `8f8f43ed5ce5_*` and `fb2466e21e43_init.py` are older/base, not after 0017).

**Confidence: HIGH** — direct reads of models, settings, and three migration files; `priority_rank` and `last_advisory_at` absence confirmed via grep (zero matches each).

## Backend: advisory routes (async preview/confirm/schema)

**File:** `backend/app/routers/ingest.py` — pattern to mirror in a new sibling router (e.g. `backend/app/routers/advisory.py`)

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.config import settings
from app.schemas.ingest import IngestPayload, IngestResult, IngestPreviewResult
from app.services import ingest_service

router = APIRouter(prefix=f"{settings.api_prefix}/ingest", tags=["ingest"])

@router.get("/schema")
async def get_schema():
    return IngestPayload.model_json_schema()

@router.post("/confirm", response_model=IngestResult)
async def confirm(payload: IngestPayload, session: AsyncSession = Depends(get_session)):
    return await ingest_service.apply_import(payload, session)

@router.post("/preview", response_model=IngestPreviewResult)
async def preview(payload: IngestPayload, session: AsyncSession = Depends(get_session)):
    return await ingest_service.dry_run_import(payload, session)
```
Three-route shape (`GET /schema`, `POST /confirm`, `POST /preview`) maps directly to advisory routes: `GET /api/v1/advisory/schema` → `AdvisoryPayload.model_json_schema()` (this is also the literal source PROMPT-01 regenerates `[SCHEMA BLOCK]` from — could even be the same call used at build/doc-gen time, not just runtime), `POST /api/v1/advisory/preview` → new `advisory_service.dry_run_advisory(...)`, `POST /api/v1/advisory/confirm` → new `advisory_service.apply_advisory(...)`. All routes are plain `async def` on FastAPI's automatic request-body validation (Pydantic model as the single typed param) — 422 surfacing is automatic/built-in, no manual try/except needed (confirmed: existing router has zero error handling, FastAPI's `RequestValidationError` handler does this globally). `get_session` (from `app.db`) is the same async session dependency — no new wiring needed, just import and depend on it identically.

New router must be registered in the FastAPI app (likely `backend/app/main.py` — not read this session, but the existing `ingest.router` registration point is the obvious place to add `advisory.router` alongside it; planner should grep `main.py` for `include_router` during planning).

**Confidence: HIGH** — direct read, 25-line file in full.

## Frontend: Advisor.tsx shell + richer diff + useAdvisory

**File:** `frontend/src/pages/Advisor.tsx` (88 lines, full read) — Phase 15 shell, extend in place per D-06

Current structure (top to bottom): page title "Sync" → **Advisor prompt** section (copy `ADVISOR_PROMPT` to clipboard) → **Advisory brief** section (fetch + copy bundle via `useExport().fetchBundle()`) → **Preview** section (shows `ex.bundle` text + `generated_at`/`session_id` from `useExport`) → **Snapshot** section (`triggerSnapshot()`). All sections are `<section style={{marginBottom: 24}}>` blocks using inline styles + CSS variables (`var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-secondary)`, `var(--destructive)`) and shared classes (`section-label`, `btn-save`, `btn-text-accent`, `prompt-block`). New sections append **after** the Snapshot section, in this order per D-06/D-09/D-10/D-11: page-header "Last advisor sync: N days ago" line (near `<h1 className="page-title">`), then below existing sections: **Paste advisory response** (`<textarea>` + "Run preview" button — mirrors `Ingest.tsx`'s input section but no file-upload per D-07), **notes callout** (accent-bordered card, rendered after a successful preview, before the diff), **staleness banner** (non-blocking, inline, shown alongside/above diff after preview), **diff sections** grouped Goals/Milestones/New tasks (richer than `DiffGroup`), **Confirm** button, **success summary** (D-08, replaces `navigate("/goals")` pattern — Ingest.tsx's `handleConfirm` calls `navigate("/goals")`; Advisor's must NOT do this, instead set local state showing a summary + `<Link to="/goals">`).

`useExport` (grep-confirmed, `frontend/src/hooks/useExport.ts` lines 10-11, 24-25, 56-57) already exposes `sessionId` and `generatedAt` state — these are the **same** `session_id`/`generated_at` values the advisory payload's staleness check needs (D-11: "computed from the echoed session_id + its paired generated_at carried back in the pasted reply"). Important nuance: the staleness check is NOT comparing the live `useExport().generatedAt` against now — it's comparing the **`generated_at` embedded in the pasted advisory reply's echoed `session_id`** against now. Since `session_id`/`generated_at` are only correlated client-side in Phase 15's stateless design (no server lookup, per D-11/D-12 inherited), and the advisory reply only echoes `session_id` (not `generated_at` — confirmed: `advisorPrompt.ts`'s example payload has `session_id` but no `generated_at` field), the staleness computation likely needs the **currently-displayed** `ex.generatedAt`/`ex.sessionId` (still in component state from the brief that was just copied) compared against the pasted reply's echoed `session_id` for a match, with staleness computed from `ex.generatedAt` if the IDs match. **Open question** flagged below — if the user pastes an advisory reply in a **fresh page load** (no `ex.bundle` fetched this session), there's no local `generatedAt` to compare against, so staleness can't be computed purely client-side without either (a) requiring the brief be re-fetched first, or (b) encoding `generated_at` directly in the advisory reply's `session_id` string itself (e.g. embed a timestamp in the ID format) so it's self-contained. Recommend planner re-check Phase 15's CONTEXT.md D-11/D-12 for whether `session_id` is timestamp-derived (if so, staleness is computable from the ID alone with zero extra round-trip).

### `Ingest.tsx` `DiffGroup` (lines 7-35) — starting point, NOT sufficient as-is
```tsx
function DiffGroup({ label, items }: { label: string; items: IngestEntityDiff[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 ...>{label}</h3>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {items.map((item) => (
          <div key={item.external_key} style={{ display: "flex", ... }}>
            <span>{item.title}</span>
            <span className={item.action === "create" ? "diff-badge diff-badge-create" : "diff-badge diff-badge-update"}>
              {item.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```
Per D-02, this is explicitly **too shallow** for the advisory diff (title + badge only). The new component (call it e.g. `AdvisoryDiffGroup`) needs, per row: entity label, **per-field** old→new pairs (not just a binary create/update badge), and the **rationale always visible as sub-text** (D-01 — never hidden). Visual conventions to reuse: `var(--surface)`/`var(--border)` container, `diff-badge*` CSS classes for the add/update distinction, but the row body needs restructuring to a multi-line layout (field rows nested under an entity header) rather than `DiffGroup`'s single-line flex row. New tasks render as pure "add-rows" — no `old` column, matching `action="create"` styling but for a `TaskCreation` shape, not `EntityDiff`.

### `Ingest.tsx` overall page-flow pattern (paste → preview → confirm → errors) — directly portable
- `<textarea>` bound to `rawJson` state, `JSON.parse` wrapped in try/catch with a `parseError` state for malformed JSON (separate from the 422 `ingest.errors` list) — same pattern works verbatim for the advisory paste box.
- `result && !nothingToImport` conditional gating of the Confirm button — advisory equivalent: gate on `previewResult` existing and at least one row being non-empty across goal/milestone/task adjustment groups.
- Validation Errors section (`ingest.errors.map(...)` rendered as `<li className="error-list-item">`) — directly reusable via `useAdvisory`'s own `errors` state (same `parse422` shape).

### `useIngest.ts` (84 lines, full read) — the model for `useAdvisory`
```ts
function parse422(detail: ValidationError[]): string[] {
  return detail.map((e) => `${e.loc.filter((p) => p !== "body").join(".")}: ${e.msg}`);
}
export function useIngest() {
  const [previewResult, setPreviewResult] = useState<IngestPreviewResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  async function preview(payload: unknown) { /* POST PREVIEW_URL, handle 200/422/other/network-catch */ }
  async function confirm(payload: unknown): Promise<boolean> { /* same shape, returns bool */ }
  function reset() { setPreviewResult(null); setErrors([]); }
  return { previewResult, errors, previewing, confirming, preview, confirm, reset };
}
```
`useAdvisory` should be a near-literal copy with URLs swapped to `/api/v1/advisory/preview` / `/api/v1/advisory/confirm`, `previewResult` typed as a new `AdvisoryPreviewResult` (richer diff shape, see Schemas section), and additional state for `notes: string | null`, `sessionId: string | null` echoed back from preview (or read from the pasted payload client-side before even hitting the network, since `session_id` is in the pasted JSON itself — no need to wait for the server response to know it). `confirm`'s return shape should carry the success-summary counts (D-08) — extend its resolved value from `boolean` to `AdvisoryResult | null` so the page can render "2 goals adjusted · 1 milestone · 1 new task" from the actual response rather than guessing.

### `frontend/src/types/goal.ts` (63 lines, full read) — types to extend
Existing `IngestEntityDiff`/`IngestPreviewResult` (lines 52-63) are the literal types to **not reuse directly** but model new ones on: add `AdvisoryFieldChange { field: string; old: unknown; new: unknown }`, `AdvisoryEntityDiff { external_key: string; title: string; action: "update" | "create"; rationale: string; fields: AdvisoryFieldChange[] }`, `AdvisoryPreviewResult { goals: AdvisoryEntityDiff[]; milestones: AdvisoryEntityDiff[]; new_tasks: AdvisoryEntityDiff[]; notes: string; session_id: string }`. Note existing `Goal` interface (lines 12-26) has **no `priority_rank` field** — must be added here too if the Goals page is expected to display/reflect the new field (success criterion 4 requires adjusted priority ranks "visible in the Goals view immediately after confirm" — so the frontend `Goal` type AND whatever Goals-page rendering exists need `priority_rank` wired through, likely out of strict Phase-16-UI scope for the Sync page itself but required for criterion 4 to be true end-to-end — flag for planner to confirm Goals page already renders arbitrary new Goal fields or needs a small addition).

**Confidence: HIGH** for direct reads of `Advisor.tsx`, `Ingest.tsx`, `useIngest.ts`, `goal.ts`, and grep of `useExport.ts`. **MEDIUM** for the staleness-computation mechanism (genuinely ambiguous from available files — flagged as Open Question, needs Phase 15 CONTEXT.md D-11/D-12 re-check during planning, not re-derived here per economy constraint).

## PROMPT-01: advisorPrompt.ts schema-block regen

**File:** `frontend/src/lib/advisorPrompt.ts` (82 lines, full read)

Line 1-2 comment is explicit and load-bearing:
```ts
// PROMPT-01: [SCHEMA BLOCK] is a placeholder. Phase 16 replaces it (one-line find-replace)
// with AdvisoryPayload.model_json_schema() output. Do not hand-write the schema.
```
The placeholder sits at line 37 (`[SCHEMA BLOCK]` alone after `JSON SCHEMA\nThe advisory response JSON schema:`). Mechanical task: once `AdvisoryPayload` (Pydantic model, backend) is finalized, call `AdvisoryPayload.model_json_schema()` (Python, e.g. via a small script or the `/api/v1/advisory/schema` route's actual runtime output — same JSON Schema source), serialize to a JSON string, and string-replace `[SCHEMA BLOCK]` in this file with that JSON (likely pretty-printed, embedded as a JS template literal — the whole `ADVISOR_PROMPT` is already a backtick template literal so embedding multi-line JSON is safe as long as no literal backtick or `${` appears in the schema, which Pydantic-generated JSON Schema never contains).

The EXAMPLE PAYLOAD block (lines 40-71) is the authoritative reference for `AdvisoryPayload` field names used throughout the Schemas section above — this file should be treated as a **spec**, not just prose, since it was evidently hand-written in Phase 15 anticipating this phase's schema. The planner's last task in this phase (per ROADMAP.md: "last plan...regenerates the schema block") should be a small, isolated task: write the schema-fetch + string-replace step, ideally as a one-off Python script (`backend/scripts/regen_advisor_schema.py` or similar, run once, output checked into `advisorPrompt.ts`) rather than a runtime fetch — the prompt text is static TS, not generated at request time, consistent with `ingestPrompt.ts`'s sibling pattern (not read this session, but referenced at `Ingest.tsx` line 4 as a static const import).

**Confidence: HIGH** — direct read, full file; mechanical task with clear existing instructions in the file's own header comment.

## Validation Architecture

### Test Framework
No backend or frontend test files were read this session (out of the economy budget — flag for planner/Wave-0 to confirm actual framework via a quick `ls backend/tests` / `package.json` "test" script check). Given the stack (FastAPI + pytest is near-universal for this stack; `CLAUDE.md`/STACK.md doesn't list a test framework explicitly), assume **pytest + pytest-asyncio** for backend (matches async SQLAlchemy session pattern) and **Vitest** (paired with Vite per STACK.md) for frontend, pending Wave-0 confirmation.

### Phase Requirements → Test Map

| Req / Criterion | Behavior | Test Type | Notes |
|------|----------|-----------|-------|
| Criterion 1 (validation) | Missing `rationale` on any adjustment/creation → 422 | unit | Pydantic model test: instantiate `GoalAdjustment(...)` without `rationale`, assert `ValidationError` |
| Criterion 1 (validation) | Unknown goal `external_key` referenced → 422 | integration | POST `/advisory/preview` or `/confirm` with payload referencing a non-existent goal key against a seeded test DB; assert 422 (this is a **runtime/DB-aware** check, not pure schema validation — must happen in the service/route layer, not just Pydantic, since Pydantic alone can't know what goals exist) |
| Criterion 1 (validation) | Forbidden ops rejected (create goal, change goal status/title/type, edit/complete/delete existing task) | unit | Schema-level: assert `AdvisoryPayload`/`GoalAdjustment` schema has no `status`/`title`/`type` fields and `extra="forbid"` rejects them if supplied; assert `TaskCreation` has no `id` field, so editing existing tasks is structurally impossible — test via `model_json_schema()` introspection or attempting to construct with forbidden keys and asserting `ValidationError` |
| Criterion 1 (preview, no writes) | Preview makes zero DB writes | integration | Call preview, then query DB row counts before/after — assert unchanged. Critical: must use a test DB session, not mock, to catch accidental `session.add`/`flush` |
| Criterion 2 (atomic rollback) | DB error mid-apply → zero changes persisted | integration | Inject a failure (e.g. monkeypatch `_upsert_task` or force a duplicate `external_key` IntegrityError partway through a multi-item advisory payload) and assert no goal/milestone/task rows were created — this is the most important test in the phase; must directly exercise the `async with session.begin():` rollback, not just assert "no exception leaked" |
| Criterion 3 (idempotent replay) | Re-confirming same `advisory_id` → original result, no dupes | integration | Confirm once, capture result; confirm again with identical payload; assert second result equals first AND row counts unchanged (no new goal/milestone/task rows, no duplicate `AdvisoryLog` row — UNIQUE constraint should raise/short-circuit before insert attempt) |
| Backward-compat (roadmap gate) | Existing `payload_type="standard"` payloads still validate | unit + regression | Take an existing `IngestPayload` test fixture (pre-Phase-16, if one exists) and assert it still validates after adding `payload_type` field with default; also assert a payload with `payload_type` omitted entirely defaults to `"standard"` |
| Criterion 4 (notes never persisted) | `notes` field never written to any entity | unit/integration | After a confirm with `notes` populated, query Goal/Milestone/Task rows and assert no column contains the notes text; also a static check — grep `apply_advisory`'s body to confirm `payload.notes` is read only for the response/preview, never assigned to a model field |
| Criterion 5 (staleness) | >7-day-old `session_id`/`generated_at` triggers non-blocking banner | frontend unit (component test) or manual | If `generated_at` is recoverable client-side (see Open Question above), a Vitest/RTL component test asserting the banner renders when `generated_at` is >7 days in the past, and confirm button remains enabled (non-blocking) |
| CI grep guard | `grep -r "anthropic\|openai\|litellm" backend/app/` → zero | shell/CI | Add as a CI step (likely in an existing GitHub Actions workflow or pre-commit — not located this session; flag for planner to find/add the CI config file) — trivial one-line check, can also be a fast pytest test shelling out to grep for redundancy |

### Sampling Rate
- **Per task commit:** targeted unit tests for the schema/service function just written (e.g. `pytest backend/tests/test_advisory_service.py -x` once created).
- **Per wave merge:** full backend test suite + the atomic-rollback and idempotent-replay integration tests specifically (these are the two highest-value correctness gates per ROADMAP.md).
- **Phase gate:** full suite green + CI grep guard green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Confirm actual test framework: `ls backend/tests`, check `backend/pyproject.toml`/`requirements*.txt` for `pytest`/`pytest-asyncio`; check `frontend/package.json` "test" script and devDependencies for Vitest vs other.
- [ ] `backend/tests/test_advisory_service.py` (or sibling to wherever `ingest_service` is tested, e.g. `test_ingest_service.py` if it exists — not located this session) — covers criteria 1-4.
- [ ] Locate existing CI config (GitHub Actions `.github/workflows/*.yml` not checked this session) to add the grep guard step, or confirm one doesn't exist yet and needs creating.
- [ ] Fixture/factory for seeding a test Goal with `external_key` + Milestones, reusable across preview/apply/idempotency tests.

## Open Questions

1. **Source of `advisory_id`** (idempotency key)
   - What we know: `AdvisoryLog.advisory_id` is locked as the idempotency key; `advisorPrompt.ts`'s EXAMPLE PAYLOAD has no `advisory_id` field.
   - What's unclear: whether the LLM is instructed to generate one (requires a prompt-text addition, fragile — LLM-generated IDs could collide or be non-deterministic across re-pastes of "the same" advisory) or the server computes one deterministically from payload content.
   - Recommendation: server computes `advisory_id` as a hash (e.g. SHA256) of canonicalized payload JSON (sorted keys, stable serialization) at preview/confirm time — guarantees re-pasting byte-identical content (the realistic "re-confirm" scenario per D-05) produces the same ID without relying on LLM compliance with an extra instruction.

2. **Staleness computation without a fresh brief fetch**
   - What we know: D-11 says staleness is computed from the echoed `session_id` + its paired `generated_at`, stateless, no server lookup.
   - What's unclear: the advisory reply JSON only echoes `session_id` (confirmed via `advisorPrompt.ts` example), not `generated_at` — so if the local `useExport` state (`ex.generatedAt`) isn't populated (e.g. user reloaded the page before pasting), there's nothing to compare against client-side.
   - Recommendation: planner should re-check Phase 15 CONTEXT.md D-11/D-12 (cited in canonical_refs, not re-read this session per economy budget) to see if `session_id` is itself timestamp-derived (e.g. a ULID or `{timestamp}-{random}` format) — if so, `generated_at` can be parsed out of `session_id` directly with zero dependency on live component state, which is more robust and matches "stateless" framing better than relying on in-memory state surviving a page reload.

3. **Milestone `title` adjustability vs. `(goal, title)` match key**
   - What we know: locked decisions say milestone match is by `(goal, title)`, and separately that `title` is one of the adjustable fields (per `advisorPrompt.ts` IN-SCOPE list: "Adjust a milestone's target_date, done... and title").
   - What's unclear: if `title` is both the match key and an adjustable field, a rename request is ambiguous (match old title, but what's the new value field called?).
   - Recommendation: treat `title` as match-only for this phase unless a separate `new_title` field is explicitly added to `MilestoneAdjustment` — simpler, and title-rename isn't listed in ROADMAP's "Critical correctness gates," suggesting it's not a hard requirement this phase, just permissive prompt language that may be aspirational/Phase-15-authored before full schema design.

4. **`Goal.priority_rank` and frontend `Goal.priority_rank` are new fields, not just `AdvisoryLog`**
   - What we know: confirmed via grep that `priority_rank` does not exist on `Goal` (backend model) or the frontend `Goal` type.
   - What's unclear: nothing — this is a confirmed gap, not an open question about the codebase, but it IS a planning gap: CONTEXT.md's migration-0018 framing only mentions `AdvisoryLog` + `AppSettings.last_advisory_at`, omitting `goals.priority_rank`.
   - Recommendation: planner must add `priority_rank` to migration 0018's scope explicitly, plus to `backend/app/models/goal.py` `Goal` class and `frontend/src/types/goal.ts` `Goal` interface, for success criterion 4 ("priority ranks... visible in the Goals view immediately after confirm") to be achievable at all.

## Sources

### Primary (HIGH confidence — direct repo reads, 2026-06-30)
- `backend/app/services/ingest_service.py` (full, 252 lines)
- `backend/app/schemas/ingest.py` (full, 130 lines)
- `backend/app/routers/ingest.py` (full, 25 lines)
- `backend/app/models/__init__.py` (relevant sections: Task, AppSettings, UpdateLog, Routine)
- `backend/app/models/goal.py` (lines 1-65: Goal, Milestone, GoalProgressSnapshot header)
- `backend/migrations/versions/0017_add_goal_progress_snapshots.py` (full)
- `backend/migrations/versions/0015_add_checkin_and_update_log.py` (full)
- `frontend/src/pages/Advisor.tsx` (full, 102 lines)
- `frontend/src/pages/Ingest.tsx` (full, 215 lines)
- `frontend/src/hooks/useIngest.ts` (full, 84 lines)
- `frontend/src/hooks/useExport.ts` (grep for session_id/generated_at fields)
- `frontend/src/types/goal.ts` (full, 63 lines)
- `frontend/src/lib/advisorPrompt.ts` (full, 81 lines)
- `.planning/phases/16-advisory-ingest-sync-review-ui/16-CONTEXT.md` (full)
- `.planning/ROADMAP.md` lines 324-345 (Phase 16 entry)
- `find` of `backend/` for migration files (confirms 0017 is HEAD)
- `grep` for `priority_rank` in `goal.py` (zero matches) and `last_advisory_at` in `backend/` (zero matches)

### Not consulted this session (flagged for Wave 0 / planner follow-up)
- `backend/app/main.py` (router registration point — not read, inferred)
- Existing test files / test framework config (not located — Wave 0 gap)
- CI config (`.github/workflows/*`) — not located — Wave 0 gap
- `frontend/src/lib/ingestPrompt.ts` (sibling to `advisorPrompt.ts`, referenced but not read)
- `.planning/phases/15-context-export-advisor-prompt/15-CONTEXT.md` (cited in canonical_refs for D-11/D-12 detail; not re-read this session per economy constraint — planner should read it directly for the staleness mechanism Open Question)

## Metadata

**Confidence breakdown:**
- Backend reuse surface (ingest_service): HIGH — full file read, line-numbered.
- Schemas / payload_type: HIGH for existing code, MEDIUM for `advisory_id` source and milestone-title ambiguity (both flagged as Open Questions, not locked decisions).
- AdvisoryLog / migration 0018: HIGH — direct reads + grep-confirmed gaps (`priority_rank`, `last_advisory_at` absence).
- Routes: HIGH — full 25-line file read.
- Frontend: HIGH for existing patterns, MEDIUM for staleness-computation mechanism (genuine ambiguity, deferred to Phase 15 CONTEXT.md re-check).
- Validation Architecture: MEDIUM — test framework inferred from stack, not confirmed (Wave 0 gap); test map derived directly from success criteria (HIGH confidence on what to test, MEDIUM on exact tooling).

**Research date:** 2026-06-30
**Valid until:** Stable — internal pattern extension, no external library churn risk; valid until codebase architecture changes or Phase 15's session_id format is clarified.
</content>
