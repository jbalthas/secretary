# Pitfalls Research

**Domain:** Human-mediated LLM advisory loop — context export, progression substrate, advisory ingest, sync-review UI — added to My Secretary (FastAPI async + SQLAlchemy 2.0 async + Alembic + SQLite, React/Vite, APScheduler 3.x, single user, Raspberry Pi 5)
**Researched:** 2026-06-29
**Confidence:** HIGH — grounded in existing codebase (`ingest_service.py`, `guidance_service.py`, `brief.py`, `config.py`, `schemas/ingest.py`, `models/goal.py`) and accumulated STATE.md decisions

---

## Critical Pitfalls

### Pitfall 1: Bloated Context Export — Token Budget Violated at Generation Time

**What goes wrong:**
The export endpoint naively serializes everything: all active goals with full description text, every milestone, every linked task with notes, every ScheduledBlock for the past 90 days, the full update history, calendar events. The resulting bundle is 15,000+ tokens. The user pastes it into an external LLM, consumes most of the context window just on history noise, and the LLM's advice is diluted or the paste is truncated mid-JSON.

**Why it happens:**
"Rich context" reads as "more is better." The ingest payload already serializes full description strings via Pydantic; it's tempting to reuse the same serialization for export without a token-budget lens.

**How to avoid:**
- Define explicit token-budget tiers in the export builder: goal titles + type + status + target_date + progress_pct = always included; description = included only if non-null and under 200 chars; linked tasks = top-5 by priority/due_date only; milestones = undone ones only; history = last 30 days max, summarized (counts, not full rows). Never export calendar event bodies.
- Compute estimated token count at export time (`len(output) // 4`) and surface it in the UI: "~3,200 tokens" before the user copies.
- Provide a "compact" mode flag: `?format=compact` strips descriptions entirely and caps history to 14 days. Default to compact; full is opt-in.

**Warning signs:**
- Export endpoint reuses `GoalRead` / full task serializers without a trimming layer
- No character/token count shown in the export UI
- Descriptions are always included regardless of length
- `ScheduledBlock` history is fetched without a date range `WHERE` clause

**Phase to address:** Export phase (Phase 14). Token budget must be a first-class design constraint at the schema level before any serialization code is written.

---

### Pitfall 2: Non-Deterministic Export Ordering Makes Diffs Noisy

**What goes wrong:**
The user exports context on Monday, takes LLM advice, ingests on Tuesday, then exports again on Wednesday to start another loop. Goal order changes between exports (SQLAlchemy returns rows in insertion order by default, but new goals inserted between sessions change relative position). The LLM now sees a "different" context even though nothing of substance changed, producing false suggestions about changed priorities.

**Why it happens:**
SQLAlchemy `select(Goal)` without an `ORDER BY` clause returns rows in SQLite's default rowid order, which is stable within a session but can drift if rows are deleted and re-inserted (external_key upserts in ingest). Milestone ordering within a goal has the same problem.

**How to avoid:**
- Every query in the export builder must use a stable `ORDER BY`: goals by `created_at ASC`; milestones by `goal_id, id ASC`; tasks by `priority DESC, due_date ASC NULLS LAST`; snapshots by `snapshot_date ASC`.
- Export JSON must use sorted keys at serialization: `json.dumps(data, sort_keys=True)`.
- Write a regression test: export twice in a row without any data change; assert byte-for-byte identical output.

**Warning signs:**
- Export queries lack `ORDER BY`
- Milestone list order changes between two otherwise identical exports
- No determinism test in the export test suite

**Phase to address:** Export phase (Phase 14). Add `ORDER BY` to every export query before writing any snapshot/diff logic.

---

### Pitfall 3: Export Leaks Secrets or PII

**What goes wrong:**
Calendar event titles are included in the export bundle because they look like useful context ("Team sync with Acme Corp"). The user pastes this into a consumer LLM (ChatGPT, Claude.ai). The event title contains a client name, salary negotiation detail, or personal medical appointment. The export also includes `google_client_secrets_json` references from Settings if a naive serializer walks the config object.

**Why it happens:**
The export builder uses ORM model serialization that includes all columns. Settings is a Pydantic model from `config.py`; if any export helper accidentally includes it, secrets leak. Calendar event bodies are stored in SQLite and look like "useful context."

**How to avoid:**
- Define an explicit export allowlist per entity type. Never serialize: `google_client_secrets_json`, `webhook_secret`, `pushover_api_token`, `pushover_user_key`, `outlook_ics_url`, `google_oauth_redirect_uri`. Create a `ExportSettings` Pydantic model that explicitly includes only `timezone` and `work_hours` — never derive it from the full `Settings` object.
- For calendar events: include event title and date only, never description/attendees. Add a comment in the export builder: `# calendar event body is never exported — may contain PII`.
- Regression test: assert the serialized export string contains none of the known secret field names (`pushover_api_token`, `webhook_secret`, etc.).

**Warning signs:**
- Export builder imports `app.config.settings` and serializes it
- Calendar event `description` field appears in the export schema
- No explicit export allowlist in the export Pydantic models

**Phase to address:** Export phase (Phase 14). Allowlist must be the first thing defined, before any other export logic.

---

### Pitfall 4: Stale Export — User Pastes Outdated Context Into LLM

**What goes wrong:**
User exports at 9 AM, gets distracted, pastes into LLM at 4 PM after completing three tasks and getting a new calendar invite. The LLM advises based on stale data. Worse: the user ingests the advisory response, which includes "reschedule task X to Thursday" — but task X was already marked done at 11 AM. The advisory ingest applies changes to an entity that no longer needs them.

**Why it happens:**
The export is a point-in-time snapshot with no staleness signal. The advisory ingest validates entity existence but not entity state at time of ingest vs. time of export.

**How to avoid:**
- Embed an `exported_at` ISO-8601 timestamp at the top of every export bundle (both the Markdown header and the JSON envelope).
- The advisory ingest payload must echo back the `exported_at` value from the bundle. The ingest endpoint compares `exported_at` to the actual `updated_at` of every referenced entity. If an entity was updated after `exported_at`, surface a field-level warning in the dry-run diff: "Task 'Write RFC' was marked done after this export — advisory action may be stale."
- Do not block ingest on staleness — warn only (the user decides). But the warning must be visible in the preview UI.

**Warning signs:**
- No `exported_at` field in the export JSON envelope
- Advisory ingest payload schema has no `exported_at` echo field
- Ingest dry-run does not compare entity `updated_at` vs. `exported_at`

**Phase to address:** Export phase (Phase 14) for `exported_at` stamp; Advisory ingest phase for the staleness check in the dry-run.

---

### Pitfall 5: LLM Invents external_keys That Don't Exist

**What goes wrong:**
The advisory payload instructs "reschedule goal `eng-lead-2027`" but no goal with that external_key exists in the DB. Or the LLM invents a milestone external_key because milestones in the current system have no external_key (they are matched by title — see `_upsert_goal` in `ingest_service.py`). The ingest silently skips the unknown key or, worse, creates a ghost entity.

**Why it happens:**
The LLM generates external_keys from its training context about the export format, not from the actual keys present in the export. If the export bundle uses different slugging than what the LLM expects, it invents plausible-sounding slugs. Milestones currently have no external_key column at all — they are matched by title, which the LLM may not know.

**How to avoid:**
- Advisory ingest must validate every `external_key` reference against the DB before applying any action. On unknown key: return a field-level error in the preview, not a silent skip.
- Milestone advisory actions must reference milestone by `id` (surface IDs in the export bundle, even if display is by title) or by exact title string with strict case-sensitive matching. Fuzzy milestone matching is forbidden.
- In the export bundle, explicitly list which external_keys are valid for each entity type: `"valid_goal_keys": ["eng-lead-2027", "health-q3"]`. The advisor prompt must instruct the LLM to only reference keys from this list.

**Warning signs:**
- Advisory ingest resolves goal references by title substring match rather than exact external_key
- Export bundle does not include `valid_goal_keys` / `valid_task_keys` allowlist
- Milestones are referenced by advisory without a stable identifier (not just title)

**Phase to address:** Advisory ingest phase. Validation of external_key references must be the first thing the dry-run does, before any field-level diff is shown.

---

### Pitfall 6: LLM "Adjusts" History It Shouldn't Touch

**What goes wrong:**
The advisory payload includes `"mark_milestone_undone": true` on a milestone already marked `done=True` — perhaps the LLM thought it was re-planning. Or the advisory sets `completed=false` on a task the user marked done. Or the advisory sets `progress_pct` back to 30% when the user is at 70%. These are destructive changes to historical facts that should be immutable.

**Why it happens:**
The LLM sees the current state in the export and, interpreting it as a plan-to-optimize, proposes changes to any field it can reach. The advisory ingest schema for v2.0 was designed for forward-only changes (new milestones, updated target dates) but the new advisory payload type might unintentionally open fields that should be locked.

**How to avoid:**
- Define an explicit "advisory-immutable" field list in the ingest service and enforce it: `completed`, `completed_at`, `created_at`, milestone `done` (can only go true→false if explicitly confirmed), `progress_pct` (if ever stored). The advisory ingest schema must not include these fields at all — omission from the schema is stronger than a runtime check.
- Map this directly to the existing `# NEVER overwrite completed or reminder_at (D-08)` guard in `ingest_service.py`. The advisory payload adds `target_date`, `rationale`, and milestone `done=true` (forward only); it never adds `completed=false`, `done=false`, or timestamp reversals.
- In the dry-run preview, if the advisory attempts to touch an immutable field, show a hard error (not a warning), block the apply button for that entity, and show what the LLM tried to change.

**Warning signs:**
- Advisory ingest Pydantic model includes `completed`, `done` (without a `True`-only validator), or `completed_at`
- No explicit list of advisory-immutable fields in the ingest service or a comment referencing D-08
- Dry-run diff shows completed tasks being "un-done"

**Phase to address:** Advisory ingest schema design (first plan of the advisory ingest phase). Immutable field exclusions must be in the Pydantic model before any apply logic.

---

### Pitfall 7: schema_version Mismatch Silently Accepts Wrong Payload

**What goes wrong:**
The advisory ingest adds a new `payload_type: "advisory"` discriminator (extending the existing `schema_version: Literal["1.0", "1.1"]` in `IngestPayload`). The user pastes a v1.1 regular ingest payload (from months ago) into the advisory ingest UI. The existing `IngestPayload` model accepts it without error. Goals get re-ingested as regular updates rather than advisory actions, overwriting user edits without the advisory diff/rationale flow.

**Why it happens:**
The existing `IngestPayload` already accepts `schema_version: Literal["1.0", "1.1"]`. Adding a new advisory payload type via a separate Pydantic discriminated union is the right pattern, but if the endpoint falls back to the base `IngestPayload` on validation failure, the wrong model silently handles the payload.

**How to avoid:**
- Advisory ingest must use a separate `AdvisoryPayload` Pydantic model with `payload_type: Literal["advisory"]` as a required field. A payload without this field must return a 422 with the message "payload_type must be 'advisory' for the advisory ingest endpoint."
- The advisory endpoint is a separate route (`POST /api/v1/ingest/advisory`) from the existing `POST /api/v1/ingest`. They share validation helpers but have completely separate Pydantic models and service functions.
- The existing `IngestPayload` gets `payload_type: Literal["regular"] = "regular"` added so it is also self-identifying, enabling future union dispatch if needed.

**Warning signs:**
- Advisory ingest reuses `IngestPayload` with an optional `payload_type` field (optional = it can be omitted and the wrong path runs)
- A single `/ingest` endpoint handles both advisory and regular payloads via `if payload.payload_type == "advisory"`
- Test: paste a v1.1 regular payload to the advisory endpoint; expect 422, get 200

**Phase to address:** Advisory ingest phase. Separate endpoint and model before any other advisory logic.

---

### Pitfall 8: Partial Advisory Application With No Undo Path

**What goes wrong:**
The advisory payload proposes 4 goal target_date changes, 2 new milestones, and 3 task reprioritizations. The user approves. The ingest writes 3 goal changes and 2 milestones, then hits a DB error on the 4th goal. The apply is not atomic. The user now has a half-applied advisory with no way to reverse the 3 already-applied changes except manual editing.

**Why it happens:**
The existing `apply_import` in `ingest_service.py` wraps everything in `async with session.begin()` — this is correct and prevents partial commits at the DB level. But if the advisory ingest service is written separately and omits the outer transaction, or if the advisory applies some changes outside SQLAlchemy (e.g., APScheduler job updates), the atomicity breaks.

**How to avoid:**
- Reuse the same `async with session.begin()` + `await session.flush()` pattern from `apply_import`. All advisory changes — goal updates, milestone additions, task reprioritizations — must be inside a single SQLAlchemy transaction.
- APScheduler job side effects (e.g., if advisory reschedules a routine's cron) must be deferred until after `session.commit()` confirms success, not done inside the transaction body.
- Write a test: inject a DB error after the 2nd advisory change; assert 0 changes persisted (rollback test, same pattern as the existing ingest rollback test).

**Warning signs:**
- Advisory ingest service uses multiple `await session.commit()` calls
- Scheduler updates happen inside the SQLAlchemy transaction body
- No rollback test for advisory ingest

**Phase to address:** Advisory ingest phase. Transaction wrapping must be in the first plan, not added later.

---

### Pitfall 9: Advisory Ingest Applied Twice (Idempotency Missing for Advisory)

**What goes wrong:**
User pastes the advisory JSON, previews it, clicks Apply. Result looks good. User accidentally pastes and applies the same JSON again an hour later (or refreshes the page and re-submits). The second apply tries to set the same target dates again (harmless for dates) but also tries to add milestones that were already added in the first apply — creating duplicate milestones with the same title under the same goal.

**Why it happens:**
The existing `_upsert_goal` matches milestones by title (`existing_titles = {m.title: m for m in existing.milestones}`) and skips already-existing titles — this partially saves the milestone case. But if the advisory creates new milestones with titles not present at first apply time (which were then added), a re-apply creates duplicates. More critically, the advisory has no `advisory_id` concept for deduplication at the envelope level.

**How to avoid:**
- Advisory payload envelope must include an `advisory_id: str` (UUID or hash of the exported_at + content). The ingest endpoint checks for an existing `AdvisoryLog` row with that `advisory_id` before any writes. If found, return the original result (idempotent, no re-apply).
- Create an `AdvisoryLog` table (single row per apply): `id, advisory_id, applied_at, exported_at, summary_json`. This also provides an audit trail for the sync review UI.
- The existing `UpdateLog` table for intra-day updates is the model for this: same pattern, same idempotency guarantee.

**Warning signs:**
- No `advisory_id` field in the advisory envelope schema
- No `AdvisoryLog` table in the migration chain
- Re-applying the same advisory creates new milestone rows

**Phase to address:** Advisory ingest phase (schema). `advisory_id` and `AdvisoryLog` must be in the first migration, before the apply endpoint.

---

### Pitfall 10: Double-Counting Against Live `progress_pct`

**What goes wrong:**
The progression substrate takes daily snapshots of `progress_pct` per goal to build trend data. But `progress_pct` in this system is always computed live (`compute_progress` in `goal_service.py`; `_compute_progress_sync` in `brief.py`) and is never stored. The snapshot job calls `compute_progress(goal.id, session)` for each active goal. This is correct. However, if the advisory ingest also updates milestone `done=True` as part of its apply, and the snapshot job runs within the same minute, the snapshot captures the new state — but the advisory may be applied out of order on the LLM's recommendation (e.g., "mark milestone done as of last Tuesday"). The snapshot now shows a jump that looks like a single-day improvement but was a retrospective edit.

**Why it happens:**
`progress_pct` is never stored, so every read reflects the current DB state. A retrospective advisory change silently rewrites apparent history without flagging the snapshot as adjusted.

**How to avoid:**
- Snapshots are forward-only: the snapshot job records what `progress_pct` is at the time of the snapshot, not a retroactively computed value. Never backfill snapshot rows to reflect a past advisory change.
- Advisory ingest must not include retroactive `done=True` on milestones for dates in the past — only current-state changes are permitted. The advisory Pydantic model must not include a `done_as_of` date parameter.
- When the advisory sets milestone `done=True`, the snapshot taken on the next scheduled job reflects the new state going forward. The audit trail in `AdvisoryLog` is the explanation for any jump.

**Warning signs:**
- Snapshot job uses a `?as_of_date=` backdating parameter
- Advisory milestone model includes a `done_date` or `effective_date` field
- The snapshot table has an `is_adjusted` boolean (sign that retrospective editing was attempted)

**Phase to address:** Progression substrate phase (migration + snapshot job). Establish the forward-only snapshot invariant in the job code before the advisory ingest is built.

---

### Pitfall 11: Snapshot Job Timezone Bug (os.environ TZ Is the Single Source)

**What goes wrong:**
The snapshot job runs daily at 23:00 via APScheduler. The job determines "today's date" using `datetime.now().date()`. On the Pi, `os.environ["TZ"]` is set to `Europe/London`. In summer (BST, UTC+1), `datetime.now()` at 23:00 system time is 22:00 UTC. The snapshot is stamped `2026-07-15`. But in winter (GMT, UTC+0), `datetime.now()` at 23:00 is 23:00 UTC — same. This seems fine. The edge case: if the job fires at 23:30 and the Pi's TZ is not set (defaults to UTC), the snapshot for a user in BST is stamped with yesterday's UTC date instead of today's local date, silently building a trend dataset with 1-day-off date keys.

**Why it happens:**
`datetime.now()` without `tz=` returns naive local time based on `os.environ["TZ"]`. The existing codebase established this pattern deliberately at Phase 10: `local_tz from os.environ TZ (default UTC)`. But the snapshot job uses a different approach than `brief.py` — `brief.py` uses `datetime.now()` (naive, relying on TZ env), while the planner and tomorrow-brief use `datetime.now(local_tz)` (tz-aware). An inconsistency here produces wrong date keys.

**How to avoid:**
- The snapshot job must use the same timezone derivation as `brief.py` and `guidance_service.py`: `datetime.now()` (relying on Pi's TZ env) for the date key. Do NOT use `datetime.now(timezone.utc).date()` for the snapshot date — this will produce UTC dates even when the Pi is configured for BST.
- At snapshot job startup, log the resolved local date alongside the UTC date: `_log.info("snapshot date=%s (utc=%s)", local_date, utc_date)`. This makes timezone mismatches immediately visible in logs.
- Write a test: mock `os.environ["TZ"] = "Europe/London"`, set UTC time to 23:30 in summer, assert snapshot date key is the correct local date (not UTC date).

**Warning signs:**
- Snapshot job uses `datetime.now(timezone.utc).date()` for its date key
- No timezone logging at snapshot job execution
- `os.environ["TZ"]` not set in the test environment for the snapshot job test

**Phase to address:** Progression substrate phase. The snapshot job's date derivation must be established in the first plan and covered by a test that explicitly sets TZ.

---

### Pitfall 12: Unbounded Snapshot Table Growth on the Pi

**What goes wrong:**
The snapshot job runs daily for every active goal. 5 active goals × 365 days = 1,825 rows per year. This is fine. But if `ScheduledBlock` history is also snapshotted (plan adherence tracking), the count multiplies: 5 goals × 8 tasks per day × 365 = 14,600 rows/year. After 3 years, the table has 40k+ rows and `SELECT * FROM goal_progress_snapshots WHERE goal_id=? ORDER BY snapshot_date` starts to feel slow on SQLite on the Pi.

**Why it happens:**
Pi SD card / SSD is cheap but SQLite full table scans on large tables are slow without an index. "Personal project" scale sounds safe but adherence tracking is a multiplier on row count.

**How to avoid:**
- Design the snapshot table with a `(goal_id, snapshot_date)` composite index (unique). This makes point-lookup and range queries fast.
- Separate tables for different granularities: `goal_progress_snapshots (goal_id, snapshot_date, progress_pct)` stays small. `plan_adherence_log (date_key, tasks_completed, tasks_planned, blocks_completed, blocks_planned)` is aggregated per day (not per task/block), keeping it to 1 row per day.
- Add a retention policy: a cleanup job that deletes `goal_progress_snapshots` older than 2 years (730 rows per goal is the ceiling). Run monthly via APScheduler with `id="snapshot_cleanup"` + `replace_existing=True`.
- The retention job is a 5-line function; skipping it now means a SQLite migration later.

**Warning signs:**
- No index on `(goal_id, snapshot_date)`
- No retention policy or cleanup job
- Plan adherence snapshot stores one row per task/block instead of one aggregate row per day

**Phase to address:** Progression substrate phase (migration). Index and retention job in the same migration that creates the snapshot table.

---

### Pitfall 13: Nullable Column Migration Fails on Existing Rows

**What goes wrong:**
A new column is added to the `goals` table for the advisory loop — for example, `last_advisory_at TIMESTAMP` or `advisory_notes TEXT`. The Alembic migration uses `batch_alter_table` (required for SQLite) and adds the column as `NOT NULL` with no `server_default`. On the Pi, the existing 8 goal rows fail the `NOT NULL` constraint and `alembic upgrade head` aborts. The Pi is now stuck with a partially-migrated DB.

**Why it happens:**
This exact pattern is documented in STATE.md from Phase 10-01: "Migration 0009 adds work-hours columns as nullable (no server_default) to avoid NOT NULL failure on existing app_settings id=1." And from Phase 08: "batch_alter_table required for SQLite ALTER on existing tables." A new phase author can repeat this mistake if the lesson is not front-of-mind.

**How to avoid:**
- Every new column added to an existing table MUST be nullable (no `server_default` required) or have an explicit `server_default=''` / `server_default='0'`. Never `nullable=False` without a `server_default` for columns added to populated tables.
- New tables added in v2.2 migrations (e.g., `goal_progress_snapshots`, `advisory_log`) are fine with `NOT NULL` constraints because they start empty.
- The Alembic migration checklist (from the existing PITFALLS.md Pitfall 14 pattern) applies here: after every new column, run `alembic upgrade head` on a copy of the prod DB before deploying to Pi.

**Warning signs:**
- A new column on `goals`, `tasks`, `milestones`, or `app_settings` is `nullable=False` without `server_default`
- Migration uses `op.add_column` without wrapping in `op.batch_alter_table` for SQLite
- No test that runs the migration against a DB seeded with pre-existing rows

**Phase to address:** Every phase that adds columns to existing tables. Check in every migration review.

---

### Pitfall 14: User Accepts a Bad Advisory Suggestion With No Rationale Shown

**What goes wrong:**
The advisory payload arrives with `"adjust target_date": "2027-03-01"` for a goal whose current target is `"2026-09-01"`. The sync review UI shows the diff ("target_date: 2026-09-01 → 2027-03-01") but not why the LLM proposed it. The user clicks Apply without reading the rationale. Later they wonder why their deadline slipped and have no record of what the LLM's reasoning was.

**Why it happens:**
Rationale is treated as optional metadata in the advisory schema, not as a required field surfaced prominently in the UI. The advisory Pydantic model has `rationale: str | None = None` and the UI renders it in a collapsed accordion the user never opens.

**How to avoid:**
- `rationale: str` is required in the `AdvisoryAction` Pydantic model — not optional. If the LLM emits an advisory action with no rationale, the payload fails validation with a field-level error, not a silent default.
- In the sync review UI, rationale text is always visible alongside each proposed change (not hidden in a collapsible). The Apply button for a specific entity is only enabled after the rationale is rendered (not gated on user click — just visually co-located so the user reads it).
- The `AdvisoryLog.summary_json` field stores the full rationale for every applied action, creating an audit trail the user can review later.

**Warning signs:**
- `AdvisoryAction.rationale` is `str | None`
- Rationale is rendered in a collapsed section or tooltip only
- `AdvisoryLog` stores a count of changes but not the rationale text

**Phase to address:** Advisory ingest schema (Pydantic model) + sync review UI phase. Required field in the model; prominent rendering in the UI.

---

### Pitfall 15: No Granular Reject — "Apply All or Nothing" Feels Unsafe

**What goes wrong:**
The advisory payload proposes 5 changes. The user agrees with 4 but disagrees with 1 (the LLM suggests pushing the goal deadline from September to December; the user knows something the LLM doesn't). The sync review UI only has "Apply All" and "Reject All" buttons. The user rejects everything to avoid the one bad change, losing 4 good ones.

**Why it happens:**
Partial-apply is harder to implement than all-or-nothing. The temptation is to ship "Apply All / Reject All" and promise selective apply "later." But in practice, one bad LLM suggestion always exists, and the user learns to distrust the advisory loop entirely.

**How to avoid:**
- Each proposed advisory action has its own "Accept" / "Reject" toggle in the sync review UI. The Apply button submits only the accepted subset.
- The advisory ingest endpoint accepts a list of accepted action IDs: `{"apply": ["action-uuid-1", "action-uuid-3"]}`. The backend applies only those, skips rejected ones. This is a simple filter on the advisory actions list — not complex partial-transaction logic.
- "Reject All" is a quick shortcut. "Accept All" is also a shortcut. Default state is all-accepted (the user must explicitly deselect to reject).

**Warning signs:**
- Sync review UI has only "Apply All" / "Cancel" buttons
- Advisory ingest endpoint has no `apply` filter parameter
- Each action does not have a stable `action_id` in the advisory payload

**Phase to address:** Sync review UI phase. Per-action accept/reject must be in the first UI plan — retrofitting it after "Apply All" ships is a UX rewrite.

---

### Pitfall 16: Scope Creep Toward a Server-Side LLM Call

**What goes wrong:**
During the advisory ingest phase, the temptation arises to "just call the LLM API directly" when the user submits their update text — eliminating the copy-paste step. A helper function appears in `ingest_service.py` that calls `httpx.post("https://api.anthropic.com/...")`. Or a new `llm_client.py` module appears. Both introduce a hard dependency and an API key management problem (the Pi must now store an LLM API key), and violate the HARD CONSTRAINT locked since v2.0.

**Why it happens:**
The copy-paste workflow feels clunky once the advisory loop is working. The LLM API call looks like a 10-line addition. The constraint feels arbitrary in the moment.

**How to avoid:**
- The constraint is codified in `PROJECT.md`: "no server-side LLM." Treat it as a build-system rule: any PR adding `anthropic`, `openai`, `litellm`, or similar as a dep fails review.
- If a future milestone changes this constraint, it requires an explicit architectural decision recorded in `PROJECT.md` Key Decisions, not a quiet addition.
- The `backend/app/` tree must have zero imports of LLM client libraries. Add a comment at the top of `ingest_service.py`: `# No LLM calls in this module — server is LLM-agnostic by design (see PROJECT.md).`
- Warning: the advisor prompt doc (a plaintext/Markdown file) is the correct place to encode LLM interaction — it is documentation, not code.

**Warning signs:**
- Any import of `anthropic`, `openai`, `httpx` with an LLM API URL, or `litellm` in `backend/app/`
- A new `llm_client.py` or `ai_service.py` file in the services directory
- A new environment variable named `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` appears in `.env.example`

**Phase to address:** Every phase. Specifically: advisory ingest phase is the highest-risk moment for this drift.

---

### Pitfall 17: Async-in-Threadpool Deadlock in Snapshot or Export Service (Known Hard-Won Lesson)

**What goes wrong:**
The progression snapshot job is added to APScheduler. The job function is written as `async def take_snapshot(goal_id)` and calls `await session.execute(...)`. APScheduler 3.x runs jobs in a thread pool. The async function is scheduled directly. This deadlocks or raises `MissingGreenlet` because there is no running event loop in the thread.

This is the exact failure mode recorded in STATE.md: `guidance_service.py must be SYNC (same create_engine+sessionmaker pattern as brief.py) — async-in-thread-pool deadlocks under APScheduler`.

**Why it happens:**
A new phase author sees the `AsyncSession` pattern used everywhere in FastAPI routes and uses it in the APScheduler job, not realizing the scheduler runs outside the FastAPI event loop. The `MissingGreenlet` error is confusing and takes time to diagnose.

**How to avoid:**
- Snapshot job and export service (if called from a scheduler job) MUST be synchronous: use `create_engine` (not `create_async_engine`) and `sessionmaker` (not `async_sessionmaker`). Follow the exact pattern in `brief.py` and `guidance_service.py`: `_sync_url = app_settings.database_url.replace("+aiosqlite", "")`.
- The export endpoint (FastAPI route) is fine as async — it uses `AsyncSession` from `get_session`. Only APScheduler job targets must be sync.
- The test for the snapshot job must run it directly (not via `run_in_threadpool`) to catch any accidental `await` calls.

**Warning signs:**
- APScheduler job target function is `async def`
- Snapshot service imports `AsyncSession` or `create_async_engine`
- `MissingGreenlet` in the server logs after adding the snapshot job

**Phase to address:** Progression substrate phase (snapshot job). Establish sync pattern before writing any job logic.

---

### Pitfall 18: Advisory Ingest Drops goal_key References Silently

**What goes wrong:**
The advisory payload includes task changes with a `goal_key` that references a goal being updated in the same payload. The apply logic processes tasks before flushing goal PKs (or doesn't flush at all), so `goal_key_to_id.get(t.goal_key)` returns `None` and the task's `goal_id` is set to `None` — silently unlinking the task from its goal.

This is the exact flush-before-FK-resolve pattern documented in `ingest_service.py`: `# Flush so new Goal rows get DB-assigned .id values within this transaction`. The advisory ingest service, written separately, may omit the flush.

**How to avoid:**
- Advisory ingest must follow the same 5-phase commit pattern as `apply_import`: (1) upsert goals, (2) `await session.flush()`, (3) build `goal_key_to_id` map, (4) apply task/milestone changes using that map. Do not skip the flush step.
- Extract the flush + goal_key_to_id resolution into a shared helper reused by both `apply_import` and the advisory apply function.

**Warning signs:**
- Advisory apply function does not call `await session.flush()` after goal updates
- Tasks in the advisory result have `goal_id=None` when they should be linked
- No test for the cross-entity advisory case (task advisory referencing a goal also updated in the same payload)

**Phase to address:** Advisory ingest phase. The flush pattern must be in the first plan.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Export reuses full `GoalRead` serializer | No new code | Leaks PII fields, inflates token count, includes `progress_pct` in export (which will double-count in future computations) | Never — export needs its own model |
| Advisory `rationale` is optional | LLM can skip it without error | User applies changes with no explanation; no audit trail | Never — required field |
| "Apply All / Reject All" only | Simpler UI | User rejects good suggestions to avoid one bad one; loop trust erodes | Never for v2.2 |
| Snapshot job written as `async def` | Familiar pattern | Deadlocks under APScheduler 3.x (known lesson — STATE.md) | Never for APScheduler jobs |
| `advisory_id` omitted from payload | Simpler schema | Same advisory applied twice creates duplicate milestones | Never — idempotency is a Day 1 requirement |
| Snapshot table has no index on `(goal_id, snapshot_date)` | Faster migration | Slow trend queries as data accumulates on Pi | OK in dev; never in production migration |
| Nullable `rationale` on `AdvisoryLog` rows | Flexible storage | Future diff UI has to handle `None` rationale everywhere | Never — store empty string as minimum |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| APScheduler 3.x + snapshot job | Write `async def take_snapshot(...)` with `await` | Sync function using `create_engine` + `sessionmaker`; same pattern as `brief.py` |
| Export + `GoalRead` schema | Reuse `GoalRead` which includes `progress_pct: int` computed live | Separate `GoalExport` model with only the fields the LLM needs; no computed fields |
| Advisory ingest + existing `IngestPayload` | Use the same Pydantic model with an added `payload_type` field | Separate `AdvisoryPayload` model; separate route; no shared model |
| SQLAlchemy async session + advisory apply | Apply goal updates and task updates in one shot without flush | Flush after goal upserts, then build `goal_key_to_id` map — same pattern as `apply_import` |
| Milestone advisory reference | Reference milestones by title substring | Reference by `id` (surfaced in export) or exact title; no fuzzy match |
| Pushover notifications from advisory | Fire Pushover inside the advisory apply transaction | Fire Pushover after `session.commit()` confirms success |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Snapshot job calls `compute_progress` per goal per run | CPU spike at 23:00; slow if many goals | Batch: fetch all active goals + all task counts in 2 aggregate queries, not N per-goal queries | > 20 active goals |
| Export fetches `ScheduledBlock` history with no date filter | Export is slow; huge JSON payload | `WHERE date_key >= (today - 30 days)` always; no unbounded history fetch | > 90 days of blocks |
| Trend UI fetches all snapshot rows per goal for chart | Chart render slow | `LIMIT 90` in the snapshot query; front-end only needs 90 data points | > 180 snapshot rows per goal |
| Advisory dry-run does N existence checks for each action | Preview is slow for 10+ advisory actions | Batch the `external_key IN (...)` existence check into a single `WHERE external_key IN (...)` query | > 20 advisory actions |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Export endpoint unauthenticated | Context bundle including goal descriptions available to any Tailscale node | Reuse existing `WEBHOOK_SECRET` header pattern or rely on Tailscale ACL (document the access model) |
| Export includes `Settings` object fields | Pushover keys, webhook secret, Google OAuth client secret leak into clipboard | Explicit allowlist Pydantic model `ExportSettings`; test that serialized output contains no known secret field names |
| Advisory ingest endpoint unauthenticated | Arbitrary goal/task changes can be applied by anyone on the Tailscale network | Same authentication as the existing ingest endpoint |
| `rationale` text stored in `AdvisoryLog` without length cap | Very long rationale string could bloat SQLite row | `rationale: str = Field(..., max_length=2000)` in the advisory Pydantic model |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Diff shows raw JSON field names | User sees `target_date` not "Target Date" — technical jargon | Human-readable field labels in the diff component: `field_labels = {"target_date": "Target Date", "list_name": "List"}` |
| No "copy to clipboard" button on export | User must manually select all text; easy to miss the closing `}` | One-click "Copy Export" button; use `navigator.clipboard.writeText(json)` |
| Apply button active before user has reviewed any item | User clicks Apply before reading any rationale | Track which advisory items have been rendered (scroll into view or accordion expanded); soft-warn if applying with unreviewed items |
| Sync review page shows raw `exported_at` UTC timestamp | Confusing to read | Display as local time: "Exported today at 9:23 AM" |
| No confirmation after advisory applied successfully | User unsure if it worked | Show a summary toast: "4 changes applied: 2 goals updated, 2 milestones added" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Export determinism:** Export same data twice; assert byte-for-byte identical JSON (same field order, same entity order)
- [ ] **Export token budget:** Log estimated token count during export; assert it is under 6,000 tokens for a typical 5-goal dataset
- [ ] **Export no-secrets:** Assert serialized export contains none of: `pushover_api_token`, `webhook_secret`, `google_client_secrets_json`, `outlook_ics_url`
- [ ] **Advisory schema version guard:** POST a v1.1 regular ingest payload to `/ingest/advisory`; expect 422 with `payload_type` error
- [ ] **Advisory idempotency:** Apply same advisory twice; assert milestone count unchanged after second apply
- [ ] **Advisory immutability:** Advisory payload with `completed=false` on a done task; assert 422 validation error (field not in schema)
- [ ] **Advisory rollback:** Inject a DB error after 2nd advisory action; assert 0 actions persisted
- [ ] **Granular reject:** Apply advisory with actions 1, 3 selected and 2, 4 rejected; assert only actions 1, 3 are reflected in DB
- [ ] **Snapshot timezone:** With `TZ=Europe/London` at 23:30 BST, assert snapshot `date_key` is the correct local date
- [ ] **Snapshot sync safety:** Snapshot job function has no `async def` or `await`; assert `asyncio.get_event_loop()` is not called inside it
- [ ] **Nullable migration:** Run migration against a DB seeded with 5 existing goal rows; assert `alembic upgrade head` succeeds with no error
- [ ] **No LLM imports:** `grep -r "anthropic\|openai\|litellm" backend/app/` returns zero results

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bloated export consumed full LLM context | LOW | Switch to `?format=compact`; no DB changes needed |
| Advisory applied with wrong external_keys (LLM hallucinated) | MEDIUM | Check `AdvisoryLog.summary_json` to see what was applied; manually revert the 1-2 affected goal/task fields via UI; add `external_key` validation to ingest before next use |
| History modified by advisory (milestone un-done) | MEDIUM | `UPDATE milestones SET done=TRUE WHERE id=?` via SQLite CLI; enforce immutable field schema before next deploy |
| Duplicate milestones from re-applied advisory | LOW | `DELETE FROM milestones WHERE id IN (SELECT MAX(id) FROM milestones GROUP BY goal_id, title HAVING COUNT(*) > 1)`; add `advisory_id` idempotency before next use |
| Snapshot timezone wrong (UTC vs. local) | MEDIUM | Backfill is impractical; truncate the snapshot table and restart from today; fix the TZ bug first |
| Advisory applied partially (no transaction) | MEDIUM | Inspect `AdvisoryLog`; manually revert applied changes; wrap apply in `session.begin()` before re-enabling |
| Async snapshot job deadlock | LOW | Remove the job via `scheduler.remove_job("snapshot")`; rewrite as sync; restart |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Bloated export / token budget violated | Phase 14 (Export) | Assert < 6,000 tokens for 5-goal dataset; compact mode exists |
| Non-deterministic export ordering | Phase 14 (Export) | Test: two identical exports are byte-for-byte equal |
| Export leaks secrets/PII | Phase 14 (Export) | Test: no known secret field names in serialized output |
| Stale export / no exported_at | Phase 14 (Export) | Assert `exported_at` in JSON envelope; advisory ingest echoes it back |
| LLM invents external_keys | Advisory ingest phase | Test: advisory with unknown external_key returns 422 field error |
| LLM adjusts history (immutable fields) | Advisory ingest schema | Test: payload with `completed=false` rejected at Pydantic validation |
| schema_version / payload_type mismatch | Advisory ingest phase | Test: v1.1 payload to advisory endpoint returns 422 |
| Partial advisory apply (no transaction) | Advisory ingest phase | Test: inject DB error mid-apply; assert 0 rows persisted |
| Advisory applied twice (no idempotency) | Advisory ingest schema | Test: apply same advisory twice; assert no duplicate milestones |
| Double-counting against live progress_pct | Progression substrate phase | Snapshot job: forward-only; no backdating parameter |
| Snapshot timezone bug | Progression substrate phase | Test: TZ=Europe/London set; snapshot date_key is local date |
| Unbounded snapshot table growth | Progression substrate phase | Migration includes index + retention job |
| Nullable column migration failure | Every phase with new columns | Test: run migration on seeded DB; no error |
| No rationale shown / rationale optional | Advisory ingest schema + sync UI | Rationale field is `str` (required); rendered inline in UI |
| No granular reject | Sync review UI phase | Test: partial apply with accept list; only accepted actions in DB |
| Scope creep to server-side LLM | Every advisory phase | CI check: `grep -r "anthropic\|openai" backend/app/` returns zero |
| Async snapshot deadlock | Progression substrate phase | Snapshot job is `def` (not `async def`); passes sync-pattern test |
| goal_key flush omission | Advisory ingest phase | Test: advisory with task referencing updated goal in same payload; task retains goal_id |

---

## Sources

- Existing `ingest_service.py` — `_upsert_goal`, `apply_import`, `_apply_update` idempotency patterns
- Existing `guidance_service.py` — sync sessionmaker pattern (APScheduler job safety)
- Existing `brief.py` — `datetime.now()` TZ pattern, `_compute_progress_sync`
- Existing `config.py` — secret fields that must never appear in exports
- Existing `schemas/ingest.py` — `extra="forbid"`, `Literal` schema_version, `UpdateLog` idempotency
- STATE.md — Phase 10-01 nullable column lesson; Phase 08 `lazy=selectin` + `batch_alter_table` lessons; v2.0 roadmap sync-in-threadpool deadlock lesson; v2.0 flush-before-FK-resolve pattern
- PROJECT.md — HARD CONSTRAINT: no server-side LLM, no new deps, minimize token cost

---
*Pitfalls research for: My Secretary v2.2 — LLM Advisory Loop (export, progression substrate, advisory ingest, sync review UI)*
*Researched: 2026-06-29*
