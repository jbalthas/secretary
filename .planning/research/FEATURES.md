# Feature Research — v2.2 "LLM Advisory Loop"

**Domain:** Human-in-the-loop LLM advisory loop for a self-hosted personal secretary (solo, Pi, career/engineering growth)
**Researched:** 2026-06-29
**Confidence:** HIGH (codebase examined directly; advisory-loop patterns verified from multiple sources; no new deps means feasible scope is narrow and clear)

> This file covers v2.2 net-new features ONLY. Features shipped in v2.0 (goals/milestones/ingest/planner/guidance) and v2.1 (mid-day check-in, update resolution, intra-day ingest) are treated as stable dependencies and are not re-specced.
>
> Hard constraints (locked since v2.0, cannot be changed here):
> - No new Python/npm dependencies
> - No server-side LLM — user manually pastes context out and pastes JSON back
> - Minimize token cost (compact representations, no noise)
> - Single user (Jack), Pi 5, engineering/career growth as north star

---

## Category 1: Context Export ("Brief for the LLM")

The outbound half of the loop. A single action produces a copy-pasteable bundle (Markdown with embedded JSON) that briefs an external LLM on the current state of goals, progress, and momentum.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One-tap export action | Without a single trigger the user must manually query their own data — the loop never starts | LOW | `GET /advisor/export` returns Markdown text. Frontend copies to clipboard or opens as download. No deps beyond existing SQLAlchemy session. |
| Active goals in bundle — title, type, target_date, progress_pct, milestone list | The LLM cannot advise on timelines without seeing the goals and their current state | LOW | All fields already present on `Goal` + `Milestone` models. Read-only query; computed `progress_pct` already implemented in `brief.py`. |
| Active tasks per goal in bundle — title, priority, due_date (top 3 per goal) | Gives advisor context for what work is in flight; top-3 cap keeps tokens low | LOW | Query `Task` where `goal_id IS NOT NULL AND completed = FALSE`, order by priority/due_date, take 3 per goal. |
| Overdue task signal per goal | A count of overdue tasks is the fastest signal that a timeline is slipping | LOW | `Task.due_date < today AND completed = FALSE`, grouped by goal_id. Single query. |
| Planned-vs-actual block summary (last 14 days) | Advisor needs evidence of what actually happened, not what was planned; without this timeline advice is based on fiction | MEDIUM | Aggregate `ScheduledBlock` by 2-week window: `blocks_planned` (any block in window), `blocks_completed` (`completed = TRUE`), `blocks_slipped` (completed = FALSE and `date_key` is in the past). `ScheduledBlock.completed` is already populated by the update-resolution engine (Phase 12). |
| Export timestamp in bundle header | Advisor must know when the data was captured to avoid stale advice | LOW | `generated_at` ISO 8601 string at bundle top. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Trend array + velocity label per goal | Turns static `progress_pct` into a time series; LLM can see if a goal is accelerating, stalling, or flat. Without this the advisor only has current state, not trajectory. | MEDIUM | Requires progression substrate (see Category 2). Computed at export time from `goal_snapshots`. Last 4 weekly values as a compact array `[65, 68, 68, 71]` + velocity label (`accelerating` / `steady` / `stalling` / `no_data`). Velocity = avg week-over-week delta; thresholds: <1%/wk = stalling, >5%/wk = accelerating. If fewer than 2 snapshots exist, emit `no_data`. |
| Completion vs slippage ratio per goal (last 30 days) | Distinguishes "making tasks but slow goal" from "genuinely stalled"; gives advisor a realistic view of throughput | LOW | `tasks_completed_30d` = `Task.completed_at >= now-30d` grouped by `goal_id`. `tasks_slipped_30d` = `UpdateLog` entries with `action=reschedule` or `drop` in last 30d (requires update_log to record goal context — may need a `goal_id` column on `UpdateLog`, a small additive migration). |
| Calendar load next 7 days (event count, not titles) | Lets advisor understand scheduling capacity without exposing personal appointment titles | LOW | Count `CalendarEvent` rows per day for next 7 days. Emit as compact array `[2, 1, 0, 3, 2, 1, 0]`. Titles excluded for privacy. |
| Stalled goals list in bundle | Already computed by `guidance_service.get_stalled_goals()`; free to include | LOW | Emit as a `stalled_goals: [title, ...]` section. Zero additional computation. |
| Export session ID | Lets advisory ingest warn if a payload is responding to a stale export (e.g. >7 days old) | LOW | `session_id = sha256(generated_at + sorted goal ids)[:12]`. Included in export header and must appear in advisory payload. Soft validation only — warn user, do not block. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full task history dump (all completed tasks) | Feels complete; "give the LLM everything" | Massive token cost. The "lost in the middle" problem is empirically documented: LLM reasoning degrades significantly when relevant data is buried in middle-of-context. 90-day task logs add thousands of tokens of noise. | Aggregate counts only: `completed_tasks_30d`, `slipped_tasks_30d`. The LLM needs signals, not logs. |
| Calendar event titles in export | Gives advisor scheduling context | Personal appointments (doctor, family) should not be pasted into external LLM without explicit opt-in. Privacy risk. | Event count per day captures scheduling load without exposing titles. |
| Routine/habit definitions in export | Completeness | Routines and habits are scheduling mechanics, not goal-progress signals. The advisor advises on timelines, not whether to change a cron expression. | Exclude entirely. Advisor notes field can capture the insight if advisor wants to say "add a habit." |
| Raw task descriptions | More context for LLM | Descriptions are often verbose prose. They rarely affect timeline advice. High token cost. | Include only title, priority, due_date for top-3 tasks per goal. |
| Auto-scheduled export (Pushover push every week) | Proactive prompting for sync cadence | A Markdown wall pushed to Pushover is unactionable noise. Export only triggers when user is ready to sync. | A Pushover nudge ("Time for your weekly advisor sync?") that deep-links to the Sync page is enough — not the bundle itself. |

### What Goes in the Bundle (Token Budget)

For ~5 active goals with 4-week history, a well-structured export should produce 800–1,200 tokens. This is deliberate: modern LLMs (GPT-4o, Claude Sonnet) have 128K+ windows, but reasoning quality degrades when relevant data sits in the middle of a long context. Keep the bundle small enough that it occupies the first ~15% of the context.

**Bundle structure (order matters — put highest-signal data first):**

```
# Secretary Advisor Brief
generated_at: <ISO>
session_id: <short hash>
user: Jack
today: <date, weekday>

## Active Goals

### [Goal title] (career | learning | ...)
- target_date: YYYY-MM-DD (N days away)
- progress: 71%
- trend: [65, 68, 68, 71] — steady
- milestones: [done] M1, [done] M2, [ ] M3 (due YYYY-MM-DD), [ ] M4
- active_tasks: 3 | overdue: 1 | completed_30d: 4 | slipped_30d: 1
- next tasks: "Task A" (high, due MM-DD), "Task B" (medium, no due date), "Task C" (low)

[repeat per goal]

## Plan Adherence (last 14 days)
- blocks_planned: 22
- blocks_completed: 16 (73%)
- blocks_slipped: 6 (27%)

## Calendar Load (next 7 days)
[2, 1, 0, 3, 2, 1, 0]  # Mon–Sun event counts

## Stalled Goals
- [Goal title] (12 days without a task completion)

## Advisory JSON Schema
[auto-generated from model_json_schema() — see advisor prompt]
```

---

## Category 2: Progression Substrate

New tables and jobs that record history over time, so "track my progression" has trend data, not just current state.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `goal_snapshots` table | Without historical rows, the export bundle has no trend data and velocity cannot be computed. This is the foundational piece. | MEDIUM | Schema: `(id, goal_id FK, snapshot_date DATE, progress_pct INT, milestones_done INT, tasks_completed_week INT, tasks_slipped_week INT, created_at)`. One row per goal per week. Alembic migration. |
| Weekly snapshot job | Snapshots must be created automatically or trend data will never accumulate | LOW | APScheduler cron job (Sunday ~23:50 or Monday ~00:05). No new dep — APScheduler already running. Iterates active goals, computes weekly task completions/slips, writes one row per goal. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| On-demand snapshot trigger | First sync should not require waiting until next Sunday; let user trigger a snapshot manually | LOW | `POST /advisor/snapshot` creates rows for current moment. Used once at setup, then weekly job takes over. |
| Progress chart in Goals UI | Visualizes the snapshot history as a sparkline or simple line on the goal detail page | HIGH | Native React only (no charting lib). Custom SVG sparkline from snapshot values — 20–30 lines of React. Or skip for v2.2 and defer to v2.3. **Recommend deferring** — the export bundle already surfaces the trend array; the UI chart is cosmetic for this milestone. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Daily snapshots | More granularity = better trends | Daily is 7x the rows, 7x the job runs. For advisory loop purposes (monthly or bi-weekly syncs), weekly resolution is sufficient and matches a "review each week" mental model. | Weekly snapshots. If granularity is needed later, a separate daily job can be added. |
| Snapshot-based `progress_pct` as the canonical value | Avoids recomputing on read | The snapshot is a historical record, not the live value. The live `progress_pct` must always be computed from current task/milestone state. Snapshot diverging from live state would be confusing. | Keep live `progress_pct` computed; snapshot stores it for trend only. |

---

## Category 3: Advisory Ingest Payload

The inbound half. The LLM emits a JSON payload following a documented schema. The app validates it, previews the diff, and on confirm applies timeline/priority changes.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `schema_version: "2.0"` advisory payload type | Without a versioned schema the LLM has no contract to emit and the endpoint cannot validate | LOW | Extend existing `IngestPayload.schema_version` `Literal` to include `"2.0"`. Branch the ingest endpoint: `"2.0"` → advisory code path; `"1.0"/"1.1"` → existing entity ingest path. `extra="forbid"` preserved. |
| Advisory goal patch — `target_date` and `priority_rank` | Core timeline advice is the advisor's primary output | LOW | New `AdvisoryGoalPatch(external_key, target_date, priority_rank, rationale)` Pydantic model. Match goal by `external_key` (already the canonical identifier). |
| Advisory milestone patch — `target_date`, `done`, `title` | Sub-goal timeline adjustments; advisor may also propose marking a milestone complete | LOW | New `AdvisoryMilestonePatch(goal_external_key, milestone_title, target_date, done, title, rationale)`. Match milestone by `(goal_id, title)` since milestones have no `external_key`. |
| `rationale` string on every patch item | User must understand WHY before confirming. A diff without rationale is a black box. | LOW | Required field (non-nullable, max 500 chars) on every patch model. Displayed in the diff UI. |
| `notes` field at payload level | Free-text advisory commentary that does NOT write to DB — "I'd suggest adding a public speaking goal" | LOW | `notes: str` at root of advisory payload. Displayed in the Sync UI, stored nowhere (or in an `advisory_sessions` log). |
| `session_id` field | Ties the advisory response to a specific export; enables stale-session warning | LOW | Required in `"2.0"` payload. Compared against the export session ID. Warn (not block) if >7 days old. |
| Advisory dry-run endpoint | Same preview gate as existing ingest — never write without showing diff first | MEDIUM | `POST /advisor/preview` accepts advisory payload, returns `AdvisoryPreviewResult` with list of `AdvisoryDiff(entity_type, entity_title, field, old_value, new_value, rationale)`. No DB writes on preview. |
| Advisory confirm endpoint | Applies the validated advisory changes atomically | MEDIUM | `POST /advisor/confirm` wraps all goal/milestone updates in a single SQLAlchemy `async with session.begin()`. Stamps `last_advisory_at` in `AppSettings`. On success: Pushover "Advisory applied: N changes." |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Selective per-row confirm | Advisor gets one timeline right and one wrong; user should cherry-pick | MEDIUM | Frontend sends a filtered list of accepted diffs (not all). Backend confirms only the accepted rows. The payload is rebuilt client-side from checked items before calling confirm. |
| `last_advisory_at` persisted in AppSettings | Enables "last synced N days ago" badge; tracks sync cadence | LOW | Additive column on `AppSettings` (Alembic migration). Written on advisory confirm. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| LLM-proposed goal creation in advisory payload | Advisor identifies a missing goal ("you need a public speaking goal") | Creating a goal is a high-commitment act — it affects task linking, priority ordering, and milestone tracking for months. An LLM hallucinating a goal (wrong type, wrong timeline) is hard to untangle from history. | Advisory payload's `notes` field is the right place: "I'd suggest adding a goal for X." Jack creates it manually via GoalDrawer. `extra="forbid"` on the schema blocks any undocumented fields. |
| Advisory task field changes | Advisor knows a goal should land by date X; might try to set task due dates | Task due dates are scheduling-layer concerns managed by the day organizer and manual task editing. Mixing goal-layer advisory with task-layer scheduling in one payload creates ambiguous responsibility and potential conflicts with the planner. | Advisory writes only to `Goal.target_date`, `Goal.priority_rank`, `Milestone.target_date`, `Milestone.done`, `Milestone.title`. Task fields are blocked. |
| Advisory changing `Goal.status` (archive/complete) | Completeness | Closing or archiving a goal is a major, potentially irreversible user decision. The LLM should not do this. | User controls `Goal.status` via the Goals UI. Advisory can note in `notes` field if a goal seems worth archiving. |
| Advisory changing `Goal.title` or `Goal.type` | LLM might "clarify" a goal name | Goal identity (title + type) is how Jack recognizes his own goals. Renaming under advisory would be disorienting. | Locked out by schema. Title/type changes go through the Goals UI only. |
| Autonomous apply (no preview/confirm gate) | "Closes the loop automatically" | Every advisory change touches goal timelines and priorities — high-stakes decisions. LLMs are wrong sometimes. One bad auto-commit could corrupt months of tracked history. | Always: preview → user reviews diff with rationale → explicit confirm. The two-step is the safety contract. |

---

## Category 4: Sync Review UI

A dedicated page that presents the full advisory loop as a coherent workflow: export → paste → preview → confirm.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dedicated `/advisor` route | Controls scattered across existing pages make the workflow confusing. One page for one workflow. | LOW | New route in `App.tsx`. Nav entry in `BottomNav`. |
| Export section with copy button | Entry point of the loop. User copies the bundle to paste into their LLM. | LOW | Calls `GET /advisor/export`, copies response to clipboard. Pattern: reuse the "Copy prompt" button pattern from `Ingest.tsx`. Show a compact preview of the bundle (or truncated). |
| Advisor prompt copy button | LLM needs the system prompt before the context bundle | LOW | Static `advisorPrompt.ts` (mirrors `ingestPrompt.ts`). Copy button above the export section. |
| JSON textarea for advisory response | Inbound path: user pastes the LLM's advisory JSON | LOW | Reuse the existing `Ingest.tsx` textarea pattern. |
| Preview button + diff display | Shows what will change before any writes | MEDIUM | Calls `POST /advisor/preview`. Displays `AdvisoryDiff` list: per-item entity, field, old → new, rationale. Reuse the `DiffGroup` component pattern from `Ingest.tsx`. |
| Confirm button (apply all accepted changes) | Final write gate | LOW | Calls `POST /advisor/confirm`. On success, navigates to Goals page. |
| `notes` field display | Free-text LLM commentary should be visible before confirm | LOW | Render `advisory.notes` as a callout block above the diff. Not written to DB. |
| Validation error display | Bad JSON or schema violations surfaced clearly | LOW | Reuse `error-list` / `error-list-item` pattern from `Ingest.tsx`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-row Accept/Reject toggles in diff | User can accept some advisor changes and reject others without re-running the session | MEDIUM | Each diff row has a checkbox (default: checked = accept). On confirm, only checked rows are sent. Requires client-side state management per diff item. |
| "Last synced N days ago" display | Keeps the advisory loop top-of-mind; surfaces when it has been neglected | LOW | Read `last_advisory_at` from app settings. Display at top of Sync page: "Last advisor sync: 8 days ago." |
| Stale session warning | Prevent accidentally applying an advisory from last month's export | LOW | Compare `session_id` in pasted payload against the current export's `session_id`. Show yellow warning banner if >7 days old. Not a blocker. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Conversational chat UI on Sync page | Natural extension of "talk to the advisor" | Requires server-side LLM. Violates hard constraint. Adds WebSocket complexity. | The export bundle + paste workflow IS the conversation interface. Document-oriented sync is the intended UX. |
| Streaming diff (live update as JSON is typed) | Feels responsive | Adds complexity with no benefit — the advisory JSON is a finished document, not a stream. | Preview triggers on button press, not on keystroke. |
| Merge conflict resolution UI (if user edited goals since export) | Edge case correctness | High complexity, low frequency. The stale session warning covers the most common scenario. | Warn on stale session; let preview show old_value vs new_value so user can spot conflicts manually. |

---

## Category 5: Advisor Prompt/Protocol Document

A documented system prompt that tells the external LLM how to act as a career/engineering advisor for Jack and what JSON to emit.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Role framing | The LLM needs to know it is a career/engineering advisor for a solo engineer named Jack, not a general assistant | LOW | Static text at top of prompt: role, user description, north star (engineering/career growth), advisory scope. |
| Explicit advisory scope ("what you can advise on") | LLM must know what it is allowed to change — prevents hallucinating unsupported fields | LOW | List: goal target_date, goal priority_rank, milestone target_date, milestone done (propose completion), milestone title (rename/clarify), plus notes field for suggestions outside scope. |
| Explicit out-of-scope list | LLM must know what NOT to change — maps directly to anti-features | LOW | "Do not: create new goals, change goal status/title/type, change task fields, change routines/habits." |
| Full advisory JSON schema in prompt | LLM cannot emit schema-compliant JSON without seeing the schema | LOW | Auto-generated from `model_json_schema()` on the advisory Pydantic models. Embed as a code block in the prompt. Versioned with the schema. |
| Example advisory payload in prompt | Reduces LLM schema errors dramatically | LOW | One concrete example with 1 goal patch and 1 milestone patch. |
| Instructions on using `notes` field | LLM needs to know where to put recommendations that fall outside the JSON schema | LOW | Explicit instruction: "Put free-form career observations in the top-level `notes` field. Do not invent new JSON fields." |
| Copyable from Sync page | User must be able to get the prompt into their LLM before pasting the context bundle | LOW | `advisorPrompt.ts` static string with "Copy advisor prompt" button on the Sync page. Pattern mirrors `INGEST_PROMPT` in `ingestPrompt.ts`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sync cadence guidance in prompt | Tells LLM to frame advice around a "4-week horizon" — prevents unrealistic long-term planning | LOW | One sentence: "Advise within a 4-week planning horizon. Flag goals that appear unrealistic for their target date given current velocity." |
| Engineering/career specificity | General productivity advice is less useful than domain-specific framing | LOW | Mention Jack's context: engineer focused on career/skills growth; goals of types `career`, `learning` are highest priority by default. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Dynamic prompt generation (server-side template + context injection) | Could make the prompt more personalized | Requires server-side LLM call or at minimum a template rendering endpoint. The static prompt + export bundle IS the personalization mechanism — the bundle contains all the context. | Static prompt; dynamic context is the export bundle, not the prompt. |
| Multiple specialized prompts (timeline prompt, skills prompt, habits prompt) | Different advisory modes for different questions | Adds cognitive load — which prompt do I use? One prompt, one workflow. | Single comprehensive prompt. The `notes` field absorbs anything outside the structured schema. |

---

## Feature Dependencies

```
Progression substrate (goal_snapshots table + weekly APScheduler job)
    └──required-by──> Trend array + velocity label in export bundle
    └──required-by──> tasks_slipped_week count in snapshots

Context export endpoint (GET /advisor/export)
    └──required-by──> Sync review page (export section)
    └──required-by──> Advisor prompt (schema section sourced from same models)
    └──depends-on──> Goal / Milestone / Task / ScheduledBlock ORM models (existing)
    └──depends-on──> goal_snapshots (new, from progression substrate)
    └──depends-on──> guidance_service.get_stalled_goals() (existing)

Advisory ingest payload type (schema_version "2.0", Pydantic models)
    └──required-by──> Advisory dry-run endpoint
    └──required-by──> Advisory confirm endpoint
    └──required-by──> Sync review page (ingest + diff side)
    └──required-by──> Advisor prompt (JSON schema section)
    └──depends-on──> IngestPayload + IngestPreviewResult pattern (existing, extend)

Advisory dry-run endpoint (POST /advisor/preview)
    └──required-by──> Sync review page (diff display)
    └──required-by──> Selective per-row confirm (needs diff items to check)

Advisory confirm endpoint (POST /advisor/confirm)
    └──required-by──> Sync review page (confirm button)
    └──writes──> Goal.target_date, Goal.priority_rank (existing Goal model)
    └──writes──> Milestone.target_date, Milestone.done, Milestone.title (existing Milestone model)
    └──writes──> AppSettings.last_advisory_at (additive column, new migration)

Sync review page (route /advisor)
    └──depends-on──> Context export endpoint
    └──depends-on──> Advisory dry-run endpoint
    └──depends-on──> Advisory confirm endpoint
    └──depends-on──> useIngest hook pattern + DiffGroup component (existing, reuse)
    └──enhances──> Momentum strip ("last synced N days ago" — reads last_advisory_at)

Advisor prompt doc (advisorPrompt.ts)
    └──depends-on──> Advisory Pydantic models (for schema auto-gen section)
    └──depends-on──> INGEST_PROMPT pattern in ingestPrompt.ts (existing, copy pattern)

Existing systems (already built, dependencies only — not re-specced):
    Goal / Milestone ORM ──required-by──> export + advisory confirm
    IngestPayload / IngestPreviewResult ──extended-by──> advisory payload type
    Ingest.tsx / useIngest hook ──reused-by──> Sync review page
    ScheduledBlock.completed ──required-by──> planned-vs-actual in export (already populated by Phase 12)
    APScheduler ──extended-by──> weekly snapshot job (no new dep)
    guidance_service.get_stalled_goals() ──reused-by──> export stalled goals section
    INGEST_PROMPT ──pattern-reused-by──> advisor prompt
```

### Dependency Notes

- **Progression substrate must be built before export is complete**: the export gracefully emits `velocity: "no_data"` until snapshots accumulate, so it is not a hard blocker, but the trend section is the key differentiator of the export bundle.
- **Advisory payload type must precede the Sync page's ingest side**: the page's preview endpoint and confirm endpoint must exist before the page is useful.
- **Advisor prompt schema section is generated from advisory Pydantic models**: the models must be finalized before the prompt is written (or the schema block is regenerated when models change).
- **Selective per-row confirm is a UI-only extension**: the backend confirm endpoint does not change — it just receives a filtered payload. Can be added after initial confirm-all ships.

---

## MVP Definition

### Launch With (v2.2 milestone — minimum for end-to-end advisory loop)

- [ ] **Progression substrate** — `goal_snapshots` table (Alembic migration) + weekly APScheduler job. Foundational. Export has no velocity signal without it.
- [ ] **Context export endpoint** — `GET /advisor/export` returns Markdown bundle with: active goals (full milestone list, progress_pct, days_until_target), top-3 active tasks per goal, overdue count, 14-day planned-vs-actual block aggregate, 7-day calendar load (counts only), stalled goals list, trend array + velocity (or `no_data`). Copy-to-clipboard in UI.
- [ ] **Advisory ingest payload type** — Pydantic schema `schema_version: "2.0"` with `AdvisoryGoalPatch`, `AdvisoryMilestonePatch`, top-level `notes`, `session_id`. All fields extra-forbidden.
- [ ] **Advisory dry-run endpoint** — `POST /advisor/preview` returns `AdvisoryDiff` list with `entity_type`, `entity_title`, `field`, `old_value`, `new_value`, `rationale`. No writes.
- [ ] **Advisory confirm endpoint** — `POST /advisor/confirm` applies patches atomically, stamps `last_advisory_at`.
- [ ] **Sync review page** (`/advisor`) — export section (copy button), advisor prompt copy button, JSON textarea, preview trigger, diff display with rationale, confirm-all button, notes display, error display.
- [ ] **Advisor prompt document** (`advisorPrompt.ts`) — role framing, scope/out-of-scope list, JSON schema block, example payload, `notes` field guidance.

### Add After Validation (v2.2.x — after first real advisory session)

- [ ] **Selective per-row confirm** — trigger: Jack rejects bulk confirm because one suggestion is wrong. Add checkbox per diff row; confirm sends only accepted rows.
- [ ] **Stale session warning** — trigger: Jack accidentally applies an advisory from a prior session. Compare `session_id` in payload against current export.
- [ ] **"Last synced N days ago" on Sync page** — trigger: Jack forgets to sync. Reads `last_advisory_at` from AppSettings.
- [ ] **Completion vs slippage ratio in export** — trigger: `UpdateLog` needs `goal_id` column. Defer until that migration is worth doing.

### Future Consideration (v2.3+)

- [ ] **Streak visualization** — blocked by drop-vs-done ambiguity in `UpdateLog` (a v2.1 open issue from Phase 13). Fix that first, then streak UI.
- [ ] **Progress chart in Goals detail** — sparkline from `goal_snapshots`. Cosmetic; export already surfaces trend array for advisor use.
- [ ] **Pushover "time to sync" nudge** — low-value until Jack has established a sync cadence. Add only if he forgets.
- [ ] **Advisory-proposed goal creation** — requires careful UX for "proposed goals" list that does not pollute the live goals list with LLM noise. Complex. Use `notes` field for now.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `goal_snapshots` table + weekly job | HIGH | LOW | P1 — foundational, unblocks trend data |
| Export endpoint (all goal/task/adherence data) | HIGH | MEDIUM | P1 — outbound half of the loop |
| Trend array + velocity label in export | HIGH | LOW | P1 — builds on snapshot, high signal at low cost |
| Planned-vs-actual 14-day aggregate | HIGH | LOW | P1 — reads existing ScheduledBlock |
| Advisory payload Pydantic schema v2.0 | HIGH | LOW | P1 — inbound schema contract |
| Advisory dry-run endpoint | HIGH | MEDIUM | P1 — safety gate before writes |
| Advisory confirm endpoint | HIGH | MEDIUM | P1 — write path |
| Sync review page (`/advisor`) | HIGH | MEDIUM | P1 — coherent workflow surface |
| Advisor prompt document | HIGH | LOW | P1 — LLM has no instructions without it |
| Calendar load (event counts, no titles) | MEDIUM | LOW | P2 — useful signal, one query |
| Stalled goals in export (free — reuse guidance_service) | MEDIUM | LOW | P2 — already computed |
| Selective per-row confirm | MEDIUM | MEDIUM | P2 — add after first sync session |
| `last_advisory_at` + "N days ago" display | LOW | LOW | P2 — easy, polish |
| Stale session warning | LOW | LOW | P2 — defensive, after first session |
| Completion vs slippage ratio per goal | MEDIUM | MEDIUM | P2 — needs UpdateLog migration |
| On-demand snapshot trigger | LOW | LOW | P2 — useful at setup |
| Progress chart in Goals UI (sparkline) | LOW | MEDIUM | P3 — cosmetic, defer |
| Pushover "time to sync" nudge | LOW | LOW | P3 — defer until cadence established |
| Advisory-proposed goal creation | MEDIUM | HIGH | OUT — anti-feature for this milestone |
| Autonomous apply (no gate) | LOW | LOW | OUT — trust violation |
| Full task history dump | LOW | MEDIUM | OUT — token noise |

---

## Testable "User Can X" Requirements (for Requirements Definition)

**Context Export:**
- User can tap one button on the Sync page and have the full advisory brief copied to clipboard, ready to paste into an external LLM.
- User can see goal trend data (last 4 weekly progress values + velocity label) in the exported bundle.
- User can see planned-vs-actual block stats (last 14 days) in the exported bundle.
- User cannot see personal calendar event titles in the exported bundle (only counts).

**Progression Substrate:**
- After Sunday night, a new `goal_snapshot` row exists for every active goal, recording that week's progress_pct and task completion counts.
- User can trigger a manual snapshot from the Sync page without waiting for the weekly job.

**Advisory Ingest:**
- User can paste an advisory JSON payload (schema v2.0) into the Sync page and see a diff showing exactly which goal/milestone fields will change and why (rationale per item).
- User can confirm the advisory diff and observe that goal target dates and priority ranks are updated atomically, with no partial writes.
- User cannot paste a payload that creates new goals, changes goal titles/types, or touches task fields — these are blocked by schema validation with clear error messages.
- User sees the LLM's free-text `notes` displayed prominently before confirming.

**Sync Review UI:**
- User can complete the full advisory loop (export → paste to LLM → paste response back → preview → confirm) from a single page without navigating away.
- User can see how many days ago their last advisory sync was.

**Advisor Prompt:**
- User can copy the advisor system prompt from the Sync page in one click, before copying the export bundle.
- The advisor prompt's schema section matches the current advisory payload Pydantic schema exactly (generated from `model_json_schema()`).

---

## Sources

- Codebase (examined directly): `backend/app/models/`, `backend/app/schemas/ingest.py`, `backend/app/services/ingest_service.py`, `backend/app/services/guidance_service.py`, `backend/app/services/brief.py`, `backend/app/models/__init__.py` (Task, AppSettings, UpdateLog), `frontend/src/pages/Ingest.tsx`
- PROJECT.md: v2.2 milestone definition and hard constraints
- [Human-in-the-Loop in Agentic Workflows (Orkes)](https://orkes.io/blog/human-in-the-loop/) — advisory model: human decides, AI recommends; pause-at-decision-point pattern
- [AI Human-in-the-Loop Production Oversight Patterns (Redis)](https://redis.io/blog/ai-human-in-the-loop/) — save state, wait for approval, hybrid automation model
- [Context Engineering: Reducing LLM Token Usage (TokenOptimize)](https://www.tokenoptimize.dev/guides/context-engineering-reduce-token-usage) — smallest set of high-signal tokens; information placement in context window matters
- [Acon: Optimizing Context Compression for LLM Agents (arXiv)](https://arxiv.org/html/2510.00615v1) — compress histories into concise summaries; aggregate not raw
- [The Maximum Effective Context Window (arXiv)](https://arxiv.org/pdf/2509.21361) — "lost in the middle" problem; reasoning degrades for data in middle of long contexts
- [G-Research: Building a code review tool — LLM patterns that work](https://www.gresearch.com/news/building-a-code-review-tool-the-llm-patterns-that-actually-work/) — per-item accept/reject diff pattern; rationale visibility
- [Human-in-the-Loop vs LLM-as-Judge (Kili Technology)](https://kili-technology.com/blog/human-in-the-loop-human-on-the-loop-and-llm-as-a-judge-for-validating-ai-outputs/) — HITL as decision gate, not token "review step"
- [Goal Progress Tracking: Science-Backed Guide (GoalsAndProgress)](https://goalsandprogress.com/goal-tracking-systems-complete-guide/) — velocity, slip detection, weekly review cadence
- [Planned vs. Actual Analysis (Productive.io)](https://productive.io/blog/planned-vs-actual/) — variance analysis as core adherence metric; positive/negative variance framing

---

*Feature research for: My Secretary v2.2 — LLM Advisory Loop*
*Researched: 2026-06-29*

---

---

# Feature Research — v2.0 "Ingest, Organize, Guide" (Historical)

> Preserved for reference. All v2.0 features are now shipped and treated as stable dependencies.

**Domain:** Single-user personal secretary (self-hosted, Raspberry Pi, solo career + life management)
**Researched:** 2026-06-15
**Confidence:** HIGH for goal tracking and time-blocking patterns; MEDIUM for LLM payload schema (no dominant standard exists); LOW for AI-driven guidance patterns (product space is maturing fast)

## Category 1: Import Payload (LLM-produced structured ingest)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Versioned JSON schema | Without a version field, every schema change is a breaking ingest failure | LOW | `"schema_version": "1.0"` at root; validate on receipt |
| `goals` entity in payload | The whole v2 value prop is first-class goals; they must be importable | LOW | See fields below |
| `tasks` entity in payload | Tasks are already first-class; import must link them to goals | LOW | Reuse existing Task model; add `goal_id` FK |
| `routines` entity in payload | User explicitly said "add recurring events for recurring things" | MEDIUM | Map to existing Routine model; validate cron fields |
| Preview before commit | User must see exactly what will be created before it hits the DB | LOW | Diff-style: "3 goals, 7 tasks, 2 routines will be created" |
| Validation with field-level errors | An LLM will occasionally emit malformed JSON; fail loudly with specific errors | LOW | Pydantic models on the FastAPI endpoint; return 422 with detail |
| Paste or file upload | Both paths needed — paste for quick use, file upload for long payloads | LOW | Textarea + `<input type="file">` in UI |
| Idempotent ingest (no duplicate goals) | Re-importing the same payload should not create duplicates | MEDIUM | Match on `external_id` or `(title, type)` pair; upsert not insert |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Documented LLM prompt shipped with the app | User doesn't have to craft their own schema-compliant prompt | LOW | Prompt stored in `/docs/` or visible in UI; versioned alongside schema |
| `milestones` array on each goal | Goals with intermediate checkpoints are more motivating and trackable than open-ended goals | MEDIUM | Milestone: `{title, target_date, done: bool}` |
| `habits` entity in payload | Habits (daily/weekly behaviors) are distinct from tasks (one-shot work items) and routines (system-level cron jobs) | MEDIUM | Habit: `{title, frequency, goal_id}` — maps to recurring tasks with a habit flag |
| Partial ingest with conflict report | "2 of 3 goals imported; 1 skipped — title conflicts with existing goal. Review?" | HIGH | Requires diff logic; defer until after basic ingest ships |
| `notes` / `context` field on goals | User pastes background context (e.g. "I want to switch careers to ML") — stored but not acted on until AI milestone | LOW | `context: string` on goal; rendered in goal detail view |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Built-in LLM chat or API key | Adds cost, dependency, and key management to v2.0; user already has an LLM | External LLM, user pastes output — cleaner, zero ongoing cost |
| Streaming ingest (real-time LLM output parsing) | Complexity with no benefit; the payload is finalized before upload | Paste/upload of complete payload only |
| Auto-ingest from email or webhook | Unreviewed writes are dangerous; the preview step is critical | Always gate on explicit user confirm |
| Schema auto-evolution / AI schema repair | Adds black-box behavior; if schema breaks, user should know | Strict validation + clear error messages |
| Support for CSV / iCal / other formats | Scope creep; the LLM prompt can emit JSON — no need for more parsers | JSON only for v2.0 |

## Category 2: Goals (first-class entity)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Goal CRUD (create/edit/archive) | Can't track what you can't manage | LOW | Archive, not delete — preserve history |
| `type` field (career, life, health, etc.) | Different goal types need different views and metrics | LOW | Enum; drives filtering in UI |
| `target_date` field | Without a deadline, a goal is a wish | LOW | Optional but strongly encouraged by UX |
| Task-to-goal linkage | Tasks are the unit of work toward a goal; linkage closes the loop | LOW | `goal_id` FK on Task; already exists as a model change |
| Progress % from linked task completion | Most important single metric | MEDIUM | `completed_tasks / total_linked_tasks`; recalculate on task status change |
| Milestone tracking (done/not done) | Intermediate checkpoints make long goals feel tractable | MEDIUM | `Milestone` child table with `goal_id`, `done`, `target_date` |
| Goals view in UI | Users need a dedicated place to see all goals and their progress | LOW | List + detail panel; distinct from task list |

## Category 3: Day Auto-Organization

*(Shipped in Phase 10 — see planner_service.py)*

## Category 4: Goal-Guided Proactive Guidance

*(Shipped in Phase 11 — see guidance_service.py)*

---

*Historical v2.0 feature research — My Secretary*
*Researched: 2026-06-15*
