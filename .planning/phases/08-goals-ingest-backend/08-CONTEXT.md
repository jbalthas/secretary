# Phase 8: Goals + Ingest Backend - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend only. This phase delivers:
- **Goals, Milestones, and Habits as first-class DB entities** — new tables + ORM models, plus `goal_id` + `external_key` columns added to existing Task and Routine tables.
- **A versioned import contract** — `GET /api/v1/ingest/schema` returns the JSON schema generated from the Pydantic model, plus a documented LLM prompt that produces a compliant payload.
- **A validating, idempotent, transactional ingest endpoint** — `POST /api/v1/ingest/confirm` validates against the schema (HTTP 422 with field-level errors on mismatch), then writes goals → tasks → routines → habits in a single transaction with clean rollback on partial failure, matching entities on `external_key` so re-imports never duplicate.
- **Goal progress reporting + milestone/goal celebrations** — progress % computed live on read; milestone and goal completion fire TTS + Pushover via existing notification infrastructure.

**Explicitly out of scope (later phases):**
- No frontend/UI — Goals view, ingest paste/upload UI, dry-run preview UI are Phase 9 (GOAL-04, GOAL-05, INGEST-03, INGEST-05).
- No day auto-organize / scheduling — Phase 10 (PLAN-01, PLAN-02).
- No guidance surfacing (goal snapshot in brief, next-best-task, stall nudges) — Phase 11 (GUIDE-01/02/03).

**Phase requirements:** GOAL-01, GOAL-02, GOAL-03, GOAL-06, INGEST-01, INGEST-02, INGEST-04, INGEST-06, INGEST-07.

</domain>

<decisions>
## Implementation Decisions

### Goal progress formula (GOAL-02, GOAL-03)
- **D-01:** Progress is a **unified ratio** computed on read: `% = (completed linked tasks + done milestones) / (total linked tasks + total milestones)`. Every linked task and every milestone counts as one equal unit. This honors GOAL-02 (tasks drive progress) and GOAL-03 (milestone completion contributes to tracked progress) in a single number.
- **D-02:** Progress is **never stored** — always recalculated when a goal is read (matches milestone research). A goal with zero tasks and zero milestones reports 0% (guard against divide-by-zero).
- **D-03:** "Linked tasks" = tasks whose `goal_id` points at this goal. Habits (recurring tasks flagged `is_habit`) linked to the goal also count as task units in the ratio unless planning research surfaces a reason to exclude them — default: include them.

### Habit modeling (INGEST-07)
- **D-04:** A habit is **a `Task` row with `recurrence_cron` set + a new `is_habit` boolean flag = True**, and an optional `goal_id`. No separate Habit table, no extension of the Routine action enum. Reuses existing Task model, CRUD, and reminder scheduling.
- **D-05:** The `is_habit` flag is the only distinguisher between a habit and a plain recurring task. The ingest payload's `habits` array maps each entry onto a `Task` with `is_habit=True`.
- **D-06:** Streak tracking is **out of scope** — not in requirements. A habit is just a flagged recurring task in this phase. (Deferred — see Deferred Ideas.)

### Re-import / idempotency behavior (INGEST-04, INGEST-06)
- **D-07:** Match on `external_key` (nullable, unique, indexed), not title. `external_key` found → **update**; not found → **create** (upsert). Manually-created entities (no `external_key`) are never touched by ingest.
- **D-08:** On update, **preserve user-edited runtime fields** — never overwrite `completed`, `reminder_at`, or `enabled`. Update descriptive fields from the payload: `title`, `description`, `due_date`/`target_date`, `priority`, `recurrence_cron`, `goal_id` linkage. This keeps re-import safe after the user has manually completed a task or toggled a routine.
- **D-09:** Commit order is **goals → tasks → routines → habits** inside one transaction; injecting a failure mid-commit must leave **zero** new rows (verified by test). Tasks/routines/habits resolve their `goal_id` from goals upserted earlier in the same transaction (match the goal by its `external_key`).

### Celebrations (GOAL-06)
- **D-10:** Celebrate on **both** milestone completion **and** goal completion. Milestone completion fires when `milestone.done` flips False→True via the API. Goal completion fires when the goal's `status` transitions to `completed`.
- **D-11:** Both celebrations reuse the **existing** notification infrastructure — `PushoverClient.send()` and `TTSClient.speak()` — same call pattern as reminders/brief. No new notification transport.
- **D-12:** Message tone is **warm + specific** (names the entity):
  - Milestone → e.g. `Nice work — you completed "Practice chords" on your Learn Guitar goal.`
  - Goal → e.g. `Congratulations! You reached your goal: Learn Guitar.`
  - The Pushover title and TTS spoken text may differ slightly (title short, spoken text the full warm sentence); exact copy is Claude's discretion within this tone.

### Goal archive + status (GOAL-01)
- **D-13:** Goal has a **`status` enum: `active | archived | completed`**. One field carries both archive and completion state. Archiving sets `status=archived` (no hard delete — history preserved). Setting `status=completed` drives the goal celebration (D-10).
- **D-14:** Goal type is a fixed enum per GOAL-01: `career | life | health | learning | financial`.
- **D-15:** Goal fields: `title` (required), `type` (enum), `description`/context (optional), `target_date` (optional), `status` (default `active`), `external_key` (nullable/unique), timestamps. Milestones are a related table: `{title, target_date (optional), done (bool)}` linked to a goal.

### Claude's Discretion
- Exact celebration copy (within the warm+specific tone of D-12).
- Whether goal auto-completes at 100% progress or requires an explicit `status=completed` API action — **default to explicit** to avoid surprise celebrations, but planning research may revisit.
- Pydantic model structure / file layout for the ingest schema (router vs service split per ARCHITECTURE.md).
- How the documented LLM prompt is delivered (served by the schema endpoint, a static doc, or both).
- Migration internals beyond the agreed `0006`/`0007`/`0008` split.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ingest architecture & data model (PRIMARY — most decisions already made here)
- `.planning/research/ARCHITECTURE.md` — Ingest router/service split, `schema_version` as `Literal["1.0"]`, preview-then-commit flow, upsert/idempotency semantics, `external_key` nullable+unique+indexed model, the `0006`/`0007`/`0008` migration plan, and the file-touch map. §"Ingest: Router + Service Split…" and §"Upsert / idempotency semantics" are the core.
- `.planning/research/FEATURES.md` — Feature priorities, versioned-schema rationale, idempotency rationale, and the `milestones` array shape `{title, target_date, done}`.
- `.planning/research/PITFALLS.md` — Anti-patterns to avoid (notably: never add `external_key` as `NOT NULL` to existing tables — SQLite ALTER fails on non-empty DB).
- `.planning/research/STACK.md` — Stack/version constraints (SQLAlchemy 2.0 async, Alembic, Pydantic v2, FastAPI).

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Milestone v2.0 Requirements" — full text of INGEST-01/02/04/06/07 and GOAL-01/02/03/06.
- `.planning/ROADMAP.md` §"Phase 8" — phase goal + 5 success criteria (the verification target).

### Existing code to reuse / extend (read before modifying)
- `backend/app/models/__init__.py` — `Task`, `AppSettings`, `RoutineAction`, `Routine` ORM models; add `Goal` + `Milestone`, add `goal_id`/`external_key`/`is_habit` to `Task`, `goal_id`/`external_key` to `Routine`.
- `backend/app/db.py` — async engine, `Base`, `get_session` session pattern; WAL pragmas.
- `backend/app/routers/tasks.py` — router/CRUD pattern to mirror for goals/ingest.
- `backend/app/schemas/task.py`, `backend/app/schemas/routine.py` — Pydantic Create/Update/Read pattern.
- `backend/app/services/pushover.py` (`PushoverClient.send(title, message, priority)`) and `backend/app/services/tts.py` (`TTSClient.speak(text)`) — reuse verbatim for celebrations.
- `backend/app/services/brief.py` — example of a service using a sync engine + reusing Pushover/TTS; reference for the celebration trigger if it runs outside a request.
- `backend/migrations/versions/` — existing Alembic migration style (heads: `0005_add_done_to_calendar_events.py`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`PushoverClient` / `TTSClient`**: celebrations (D-11) call these directly — `PushoverClient().send(title, message)` and `TTSClient().speak(text)`. No new notification code.
- **`Task` model + tasks router**: habits (D-04) are Tasks with `is_habit=True`; reuse existing CRUD, reminder scheduling (`upsert_reminder`/`remove_reminder` in `app/scheduler.py`), and the `recurrence_cron` field.
- **Pydantic Create/Update/Read trio** (`schemas/task.py`): mirror this shape for `Goal`, `Milestone`, and the ingest payload models.
- **Async session pattern** (`db.py` `get_session`, `async with SessionLocal()`): the ingest transaction wraps all upserts in one `AsyncSession` and commits once.

### Established Patterns
- **SQLAlchemy 2.0 typed `Mapped[...]` columns** with `mapped_column`; enums via `SAEnum(PyEnum)` (see `Priority`, `RoutineAction`). Use the same for `GoalType` and `GoalStatus`.
- **Alembic numbered migrations** (`0006_…`, `0007_…`, `0008_…`). `external_key` columns must be **nullable** on the existing `tasks`/`routines` tables (PITFALLS anti-pattern 5).
- **API prefix** via `settings.api_prefix` (`/api/v1`); routers register with `prefix=f"{settings.api_prefix}/…"`.

### Integration Points
- New routers: `app/routers/goals.py` and `app/routers/ingest.py`, registered in `app/main.py`.
- New models: `Goal`, `Milestone` (new module or appended to `models/__init__.py`); `Task` gains `goal_id`, `external_key`, `is_habit`; `Routine` gains `goal_id`, `external_key`.
- New service: `app/services/ingest_service.py` (validation, dry-run diff scaffolding, transactional upsert). A celebration helper (e.g. `app/services/celebrate.py`) wraps Pushover+TTS for milestone/goal completion.

</code_context>

<specifics>
## Specific Ideas

- Celebration copy should name the entity and its parent goal (milestone) — "you completed X on your Y goal" — the warmth comes from specificity, not exclamation marks.
- The ingest endpoint's atomicity is a hard guarantee, not best-effort: a mid-commit failure must leave **zero** new rows (explicit test injecting failure required — it's success criterion #4).
- `external_key` examples from research: goal `"learn-guitar-2026"`, task `"learn-guitar-2026/practice-chords"` — slug-style, stable, LLM-produced.

</specifics>

<deferred>
## Deferred Ideas

- **Habit streak tracking** — counting consecutive completions, streak display. Out of scope for Phase 8; habit is just a flagged recurring task here. Revisit if a future phase wants habit analytics.
- **Goal auto-complete at 100% progress** — could auto-fire goal celebration when computed progress hits 100%. Defaulting to explicit `status=completed` for now to avoid surprise announcements.
- **Per-item ingest conflict report** (resolve title conflicts on re-import) — already in REQUIREMENTS backlog (P3).
- **Dry-run preview UI + paste/upload UI** — INGEST-03, INGEST-05 are Phase 9. The service layer may scaffold a dry-run diff function, but no endpoint/UI is required to land in Phase 8 (INGEST-03 is not a Phase 8 requirement).

</deferred>

---

*Phase: 08-goals-ingest-backend*
*Context gathered: 2026-06-15*
