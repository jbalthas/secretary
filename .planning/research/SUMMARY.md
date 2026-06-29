# Research Summary -- v2.2 "LLM Advisory Loop"

**Project:** My Secretary
**Domain:** Human-in-the-loop LLM advisory loop for a self-hosted personal secretary (FastAPI + SQLAlchemy 2.0 async + Alembic + SQLite + React 19 + APScheduler 3.x, Raspberry Pi 5)
**Researched:** 2026-06-29
**Confidence:** HIGH -- all four researchers worked from direct codebase inspection, not speculation

---

## Executive Summary

v2.2 closes the outbound half of the LLM loop that v2.0 opened. The existing ingest contract (versioned JSON payload -> preview -> confirm) handles the inbound direction for raw entity creation; v2.2 adds a context-export endpoint that bundles goals, milestones, progress trends, and planned-vs-actual adherence into a copy-pasteable Markdown + JSON brief for an external LLM, then extends the ingest contract with an advisory payload type so the LLM can push back adjusted timelines, re-prioritized milestones, and new tasks -- each with required rationale the user reviews before anything lands. The critical architectural boundary: the Pi never calls an LLM. The user is the transport layer (copy out, paste in). This is a hard, locked constraint, and the top regression risk for the entire milestone is the temptation to add a server-side LLM call once the copy-paste workflow feels clunky.

All four researchers converge on a three-phase delivery shape -- progression substrate first, context export second, advisory ingest and sync UI third -- because each phase depends on the previous one accumulating data and validating assumptions before writing the next layer. The zero-new-dependencies constraint holds across all five feature areas: stdlib (json, datetime, len()), Pydantic v2 discriminated unions, and existing React patterns cover every requirement. Two Alembic migrations are needed (0017: goal_progress_snapshots table; 0018: advisory_rationale column on goals plus AdvisoryLog table); everything else is additive service and schema code on top of existing patterns.

The critical pitfalls fall into three clusters: snapshot-job async/sync confusion (write the job as sync or it deadlocks under APScheduler 3.x, a lesson hard-won in Phases 10-13); export token budget and PII leakage (the export must use an explicit allowlist model, never serialize full GoalRead, and cap history to 14-30 days); and advisory-ingest safety (rationale is required not optional, extra=forbid blocks undocumented fields, advisory_id + AdvisoryLog provide idempotency, and the session.flush() + goal-key-to-id map must not be omitted or tasks silently unlink). The scope-creep risk -- adding a server-side LLM call -- must be treated as a build-system rule, not a design guideline.

---

## Reconciled Decisions

These four tensions were surfaced across the research files. One recommendation is selected; the runner-up is noted.

### 1. Advisory Payload Discriminator: payload_type vs schema_version: "2.0"

**Recommendation: `payload_type: Literal["standard"] = "standard"` on IngestPayload, and `payload_type: Literal["advisory"]` as a required field on AdvisoryPayload.**

ARCHITECTURE wins over STACK. A payload_type field separates intent (standard entity creation vs. advisory adjustment) from format version (schema_version covers the data schema). Bumping schema_version to "2.0" (STACK proposal) conflates the two concerns: it forces apply_import to branch on a version number, creating a mapping table inside service logic rather than resolving the type at the Pydantic validation boundary. With payload_type as the discriminator, Pydantic resolves the model before any service code runs.

Backward-compat guarantee: adding `payload_type: Literal["standard"] = "standard"` with a default means all existing payloads (which omit payload_type) continue to validate as IngestPayload. A regression test must confirm this before shipping.

Runner-up: schema_version: "2.0" (STACK). Would work technically, but requires service-layer branching on version.

### 2. Advisory Scope: Goal-Layer Only (Explicit Anti-Feature)

**Recommendation: Advisory payload writes only to Goal.target_date, Goal.priority_rank, Milestone.target_date, Milestone.done (forward-only, true only), and Milestone.title. Task fields, goal status, goal title, goal type, and goal creation are explicitly excluded from the schema.**

FEATURES boundary is the MVP contract. Confirmed and locked. The Pydantic model enforces this via omission -- if a field is not in AdvisoryGoalAdjustment or AdvisoryMilestoneAdjustment, the LLM cannot set it (extra="forbid" raises a 422 before any service code runs). Goal creation, task scheduling, and status transitions are user-controlled actions that the LLM can suggest in the notes field but never execute.

Implication for requirements scoping: any requirement touching task due dates, goal archiving, or goal creation via the advisory payload is out of scope for v2.2.

### 3. Service Split: Reuse _upsert_* vs New advisory_service.py

**Recommendation: Keep _apply_advisory() and _dry_run_advisory() in ingest_service.py, not in a new advisory_service.py. For new_goals and new_tasks in the advisory payload, call the existing _upsert_goal() and _upsert_task() directly.**

ARCHITECTURE wins over STACK. Two reasons: (1) the advisory apply function is a thin orchestrator around existing upsert functions -- a separate file adds a module boundary around 30-40 lines; (2) keeping advisory paths alongside standard paths means the session.flush() + goal-key map pattern is in one place and cannot be accidentally omitted.

PITFALLS is the decisive data point: omitting await session.flush() after goal upserts before building the goal_key_to_id map silently sets task.goal_id = None for tasks referencing goals created in the same advisory payload. Extract a shared _flush_and_build_goal_map(session, goal_imports) helper, called by both apply_import and _apply_advisory, to prevent this drift.

### 4. tasks_slipped_week and the UpdateLog.goal_id Gap

The UpdateLog table currently has no goal_id column. Per-goal slippage ratio requires it. FEATURES flagged this and deferred it to the after-validation tier.

**Recommendation: Do not add goal_id to UpdateLog in Phase 14 or 15.** The export bundle computes tasks_slipped_30d as a global count until this migration is warranted. If the first real advisory session reveals per-goal slippage is materially useful, add the column after Phase 16. Doing it speculatively adds migration risk for an unvalidated metric.

---
## Key Findings

### Recommended Stack

Zero new dependencies for all five v2.2 features. Alembic HEAD is **0016**; next migrations are 0017 and 0018.

**Core additions (code only, no new packages):**
- export_service.py -- async, route-only, calls goal_service.compute_progress() directly
- snapshot_service.py -- SYNC (APScheduler), create_engine + sessionmaker, inline _compute_progress_sync
- AdvisoryPayload Pydantic model -- payload_type: Literal["advisory"], extra="forbid", rationale required
- _apply_advisory() / _dry_run_advisory() in ingest_service.py -- thin orchestrators over existing _upsert_*
- Migration 0017 (goal_progress_snapshots) + Migration 0018 (advisory_rationale on goals + advisory_log table)
- Sync.tsx page -- reuses useIngest hook; new useExport hook
- advisorPrompt.ts -- sibling to ingestPrompt.ts

**Hard blocklist (must not add):**
- tiktoken / sentencepiece / transformers -- len(text) // 4 heuristic is sufficient
- jinja2 / markdown (PyPI) -- string concatenation, no template engine
- jsonpatch / deepdiff -- field-level Pydantic comparison, no JSON patch library
- sqlalchemy-history -- simple append-only table or nullable column
- react-diff-viewer / react-markdown -- structured diff cards, not text diff
- Any LLM SDK (anthropic, openai, litellm) -- server never calls an LLM

### Expected Features

**Must have (v2.2 launch gate):**
- Progression substrate: goal_progress_snapshots table (migration 0017) + nightly APScheduler job (sync, idempotent via UNIQUE index on (goal_id, snapshotted_on))
- Context export: GET /api/v1/export/bundle returning {bundle, markdown, estimated_tokens} with active goals, milestones, top-5 linked tasks, 14-day planned-vs-actual block aggregate, 7-day calendar load (counts only, no titles), stalled goals, trend array + velocity label
- Advisory payload: AdvisoryPayload with payload_type: Literal["advisory"], GoalAdjustment, MilestoneAdjustment, required rationale on every item, top-level notes, session_id, advisory_id (idempotency)
- Advisory dry-run: POST /api/v1/ingest/preview with advisory path returns before/after diffs with rationale inline
- Advisory confirm: POST /api/v1/ingest/confirm with advisory path -- atomic session.begin(), stamps AppSettings.last_advisory_at, creates AdvisoryLog row, fires Pushover on success
- Sync review page /sync: export panel (copy button), advisor prompt copy button, JSON textarea, preview diff, confirm, notes display
- Advisor prompt (advisorPrompt.ts): role framing, scope/out-of-scope list, auto-generated schema block, example payload

**Should have (v2.2.x -- after first advisory session):**
- Per-row accept/reject toggles in the diff (client sends filtered accepted list to confirm)
- Stale session warning (compare session_id in payload vs. current export; warn not block)
- Last synced N days ago display on Sync page (reads last_advisory_at)
- On-demand snapshot trigger (POST /api/v1/export/snapshot)

**Defer (v2.3+):**
- Progress sparkline chart in Goals UI (cosmetic; export already surfaces trend array)
- Pushover time-to-sync nudge (add only after cadence is established)
- Advisory-proposed goal creation (use notes field; goal creation is user-controlled)
- Per-goal slippage ratio in export (needs UpdateLog.goal_id migration; validate need first)

**Confirmed anti-features (schema-enforced, not just policy):**
- Advisory task-field changes (planner domain)
- Advisory goal status / title / type changes (user-controlled via UI)
- Autonomous advisory apply without preview/confirm gate (trust violation, locked since v2.0)
- Full task history dump in export (token noise; aggregate counts only)
- Calendar event titles in export (PII risk; counts only)
- progress_pct stored as canonical value (always computed live; snapshots are historical copies only)

### Architecture Approach

v2.2 is a strict extension of the existing FastAPI + SQLAlchemy async + APScheduler architecture. The most important boundary: export service is async (route-only), snapshot service is sync (APScheduler-only). Advisory ingest extends ingest_service.py with two new internal functions rather than a new module, preserving co-location of the session.flush() + goal-key map pattern.

**Major components:**
1. export_service.py (ASYNC) -- aggregates Goals, Milestones, Tasks, ScheduledBlocks, GoalProgressSnapshots into ExportBundle; renders Markdown; no new DB tables
2. snapshot_service.py (SYNC) -- nightly APScheduler job; writes GoalProgressSnapshot rows; idempotent; uses sync engine (same pattern as brief.py)
3. ingest_service._apply_advisory() / _dry_run_advisory() (ASYNC) -- extends existing preview/confirm flow; reuses _upsert_goal, _upsert_task; adds AdvisoryLog write on confirm
4. Sync.tsx (NEW PAGE) -- export panel + advisory ingest panel; reuses useIngest hook; new useExport hook

### Critical Pitfalls

1. **Async snapshot job deadlock** -- async def take_daily_snapshot() + AsyncSession = MissingGreenlet under APScheduler 3.x. Mitigation: sync function, create_engine, sessionmaker. Pattern already in brief.py and guidance_service.py.

2. **Export token budget and PII leakage** -- reusing GoalRead inflates tokens and leaks secret fields. Mitigation: separate GoalExport allowlist model; cap block history to 14 days; surface len()//4 estimate in UI before copy; regression test asserting no secret field names in serialized output.

3. **session.flush() + goal-key map omission** -- tasks referencing goals in the same advisory payload get goal_id = None if flush is skipped. Mitigation: extract shared _flush_and_build_goal_map() helper used by both apply_import and _apply_advisory.

4. **Scope creep to server-side LLM** -- copy-paste workflow will feel clunky once working; a llm_client.py looks like 10 lines. Mitigation: CI grep for anthropic/openai/litellm in backend/app/ must return zero.

5. **Optional rationale** -- rationale: str | None allows the LLM to omit it. Mitigation: rationale: str = Field(..., max_length=2000) -- required, non-nullable, rendered inline in diff UI.

---
## Implications for Roadmap

All four researchers converge on this sequence with no disagreement on ordering.

### Phase 14: Progression Substrate

**Rationale:** No frontend dependency; accumulates history data while Phases 15-16 are built. Every nightly snapshot adds trend data that Phase 15 exports. Zero risk to existing functionality.

**Delivers:** Migration 0017 (goal_progress_snapshots + UNIQUE index on (goal_id, snapshotted_on)); models/snapshot.py; snapshot_service.py (SYNC, nightly, idempotent); APScheduler registration with monthly retention cleanup job.

**Avoids:** Async-in-threadpool deadlock; snapshot timezone bug; unbounded table growth (retention job + index in same migration); double-counting against live progress_pct (forward-only invariant established here).

**Research flag:** Standard patterns -- no /gsd:research-phase needed. Follows exact brief.py / guidance_service.py pattern.
---

### Phase 15: Context Export + Advisor Prompt

**Rationale:** Export stands alone from advisory ingest. Delivering it first lets Jack run the full advisory loop manually -- copy bundle, paste to LLM, receive advisory JSON -- to validate the bundle structure and LLM output format before building the schema that validates it.

**Delivers:** export_service.py (async, route-only, GoalExport allowlist model, render_markdown()); routers/export.py (GET /api/v1/export/bundle); types/export.ts; hooks/useExport.ts; /sync route + Sync page export panel + copy button; lib/advisorPrompt.ts with placeholder schema block (updated at end of Phase 16).

**Uses:** goal_service.compute_progress() (unchanged); guidance_service.get_stalled_goals() (unchanged); GoalProgressSnapshot rows from Phase 14; ScheduledBlock, Task (existing).

**Avoids:** Token budget violation (explicit GoalExport model, 14-day cap, len()//4 estimate); PII leakage (allowlist model; no secret fields; calendar counts only); non-deterministic ordering (stable ORDER BY on every query).

**Research flag:** Standard patterns -- no /gsd:research-phase needed.
---

### Phase 16: Advisory Ingest + Sync Review UI

**Rationale:** Advisory ingest schema is finalized against observed LLM output from Phase 15 manual validation. Sync page advisory panel depends on both export hook (Phase 15) and advisory ingest endpoints (this phase). advisorPrompt.ts schema block is updated from AdvisoryPayload.model_json_schema() at the end of this phase.

**Delivers:** Migration 0018 (advisory_rationale TEXT NULL on goals + advisory_log table); schema extension (payload_type default on IngestPayload; AdvisoryPayload, GoalAdjustment, MilestoneAdjustment; EntityDiff.rationale optional); GoalRead.advisory_rationale additive field; _dry_run_advisory() + _apply_advisory() + shared _flush_and_build_goal_map() helper; GET /api/v1/ingest/schema/advisory endpoint; Sync page advisory panel (textarea + diff + confirm + notes); advisory rationale in Goals detail view; backward-compat regression test.

**Avoids:** session.flush() omission (shared helper); partial apply (single session.begin()); double-apply (advisory_id + AdvisoryLog); LLM inventing external_keys (validate all keys before diff); optional rationale (required field + inline rendering); history mutation (immutable fields excluded from schema); nullable column migration failure (batch_alter_table + nullable column).

**Research flag:** No /gsd:research-phase needed, but Phase plan must explicitly address: session.flush() pattern, advisory_id idempotency scheme, backward-compat regression test, AdvisoryLog schema, and scope guard (no LLM imports CI check).

---

### Phase Ordering Rationale

- Phase 14 before 15: export trend section requires snapshot rows; gracefully emits velocity no_data without them, but the trend is the key differentiator
- Phase 15 before 16: advisory ingest schema finalized against observed LLM output; advisorPrompt.ts schema block auto-generated from Phase 16 Pydantic models
- All three in same milestone: tight dependency chain; splitting across milestones is impractical
- Frontend deferred to Phase 15/16: no UI needed until data pipeline and schema contract are validated
---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct pyproject.toml + source inspection; zero-new-deps claim verified against live files |
| Features | HIGH | Codebase examined directly; MVP boundary validated against existing schema constraints; HITL patterns verified from multiple published sources |
| Architecture | HIGH | Verified against live source modules; sync/async boundary documented from actual guidance_service.py + brief.py; migration chain verified from Alembic version files |
| Pitfalls | HIGH | Grounded in existing codebase and accumulated STATE.md lessons from Phases 8-13 |

**Overall confidence: HIGH**

### Gaps to Address

- **UpdateLog.goal_id migration:** Per-goal slippage ratio requires this column. Value is unvalidated. Defer and revisit after first advisory session.
- **AdvisoryLog migration placement:** Decide whether AdvisoryLog goes in migration 0018 alongside advisory_rationale on goals, or as separate 0019. Recommendation: combine into 0018.
- **session_id vs advisory_id naming:** session_id = export fingerprint for stale-session detection; advisory_id = idempotency key for AdvisoryLog. Both fields, different purposes. Clarify in Phase 15/16 requirements.
- **Advisor prompt schema block timing:** advisorPrompt.ts delivered in Phase 15 with placeholder. Plan a one-line update at end of Phase 16 from AdvisoryPayload.model_json_schema().
---

## Sources

### Primary (HIGH confidence -- direct codebase inspection)
- backend/app/schemas/ingest.py -- confirmed schema_version Literal, extra=forbid, discriminated union patterns
- backend/app/services/ingest_service.py -- _upsert_goal, apply_import, session.flush() + goal-key map pattern
- backend/app/services/brief.py -- sync engine pattern for APScheduler, _compute_progress_sync, datetime.now() TZ pattern
- backend/app/services/guidance_service.py -- confirmed sync engine pattern, get_stalled_goals() reuse point
- backend/app/services/goal_service.py -- compute_progress() function (async, route-only)
- backend/app/models/__init__.py -- confirmed Task, Goal, Milestone, AppSettings, UpdateLog column inventory
- backend/migrations/versions/0016_add_checkin_enabled.py -- confirmed Alembic HEAD = 0016
- frontend/src/pages/Ingest.tsx + frontend/src/hooks/useIngest.ts -- confirmed reuse pattern for Sync page

### Secondary (HIGH confidence -- official docs)
- Pydantic v2 discriminated unions: https://docs.pydantic.dev/latest/concepts/unions/#discriminated-unions
- Alembic batch migration (SQLite ALTER TABLE): https://alembic.sqlalchemy.org/en/latest/batch.html
- SQLite strftime: https://www.sqlite.org/lang_datefunc.html
- Python json.dumps: https://docs.python.org/3/library/json.html#json.JSONEncoder

### Secondary (MEDIUM confidence -- multiple sources agree)
- Human-in-the-Loop Agentic Workflows (Orkes): https://orkes.io/blog/human-in-the-loop/
- AI HITL Production Oversight (Redis): https://redis.io/blog/ai-human-in-the-loop/
- Context Engineering reducing LLM tokens: https://www.tokenoptimize.dev/guides/context-engineering-reduce-token-usage
- The Maximum Effective Context Window (arXiv): https://arxiv.org/pdf/2509.21361
- G-Research code review LLM patterns: https://www.gresearch.com/news/building-a-code-review-tool-the-llm-patterns-that-actually-work/

### Tertiary (MEDIUM confidence -- heuristic)
- 4-chars-per-token heuristic for English + JSON -- validated against known GPT-4 behavior; +/-20% accuracy; sufficient for a warning label

---

*Research completed: 2026-06-29*
*Ready for roadmap: yes*