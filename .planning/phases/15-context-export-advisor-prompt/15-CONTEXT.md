# Phase 15: Context Export + Advisor Prompt - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the **outbound half** of the advisory loop: assemble a token-budgeted
advisor *brief* and a documented advisor *system prompt*, each copyable in one
click from a new `/advisor` Sync page. The user pastes both into their own
external LLM. No API key lives in the app (CI guard: `grep -r
"anthropic\|openai\|litellm" backend/app/` must be empty).

Delivers (EXPORT-01..06, PROMPT-01):
1. A backend bundle endpoint (in the existing `app/routers/export.py`) that
   assembles the advisor brief as Markdown.
2. A new `/advisor` Sync page (the "shell" Phase 16 extends) with: copy-prompt
   button, copy-bundle button, the on-demand snapshot button deferred from
   Phase 14, and a read-only bundle preview.
3. A documented advisor system prompt with a `[SCHEMA BLOCK]` placeholder
   (finalized in Phase 16).

Out of scope: the advisory *ingest* / paste-back / diff / apply flow — that is
Phase 16. This phase only produces and copies; it never consumes an advisory.
</domain>

<decisions>
## Implementation Decisions

### Bundle format
- **D-01:** The brief is **Markdown** (EXPORT-01). The goal/trend/block/calendar
  **data is rendered as compact Markdown tables + prose** — NOT a JSON data
  block and NOT a single JSON document. Rationale: token-lean, the user can
  eyeball the brief before pasting, and frontier LLMs parse Markdown tables
  reliably. The "embedded JSON schema" in EXPORT-01 refers to the advisory
  *response* schema block in the system prompt (PROMPT-01), not the data section.
- **D-02:** Bundle header carries `generated_at` and a `session_id` (EXPORT-01).
- **D-03:** `progress_pct` is **live-computed** at export time via
  `brief.py::_compute_progress_sync` — never read from `goal_progress_snapshots`
  (snapshots feed the trend array only).
- **D-04:** Career- and learning-type goals are **ordered first** in the bundle
  (EXPORT-06) — steer the advisor by data ordering, not just prompt wording.
- **D-05:** Calendar load is **per-day event counts only, never event titles**
  (EXPORT-05, privacy — hard rule).

### Token budget & truncation
- **D-06:** Target budget ~**30k tokens** (frontier model: Claude / GPT-4o
  class). This is a single-user self-hosted app, so truncation should be rare.
- **D-07:** When the bundle would exceed budget, trim in this order:
  (1) 14-day planned-vs-actual block detail (collapse to summary counts),
  (2) tasks beyond the top-3 per goal, (3) trend array detail.
  **Never drop a whole goal.** This order is a default — Claude's discretion to
  refine; never violate "never drop a goal".

### Sync page (`/advisor`) — Phase 15 shell
- **D-08:** New route `/advisor` in `frontend/src/App.tsx` + a BottomNav entry.
  The page is the **full shell** Phase 16 extends.
- **D-09:** Page contains: a **copy-prompt** button (PROMPT-01), a **copy-bundle**
  button (EXPORT-01), the **on-demand snapshot** button calling the existing
  `POST /api/v1/export/snapshot` (deferred to here from Phase 14), and a
  **read-only preview** of the rendered brief so the user sees it before copying.
- **D-10:** Mirror the existing Ingest pattern: a new `useExport` hook
  (fetch + state, modeled on `hooks/useIngest.ts`) and a page modeled on
  `pages/Ingest.tsx`. Clipboard copy via the browser Clipboard API.

### Export → ingest round-trip (stateless)
- **D-11:** **Stateless** round-trip — NO new server-side export log / table.
  `session_id` is paired with `generated_at` in the bundle header.
- **D-12:** The advisor **system prompt instructs the LLM to echo `session_id`
  back** in its advisory JSON reply. Phase 16 reads that echoed `session_id` +
  its paired timestamp from the pasted reply to run the 7-day staleness warning
  (no server lookup needed). Capture this as a prompt requirement now.
- **D-13:** Note for Phase 16: "last advisor sync: N days ago" reads
  `AppSettings.last_advisory_at` stamped on *confirm* (a separate mechanism from
  D-12's staleness check) — that field/stamp is Phase 16's concern, not 15's.

### Advisor system prompt (PROMPT-01)
- **D-14:** Role framing, in/out-of-scope lists, example payload, and `notes`
  guidance wording are **left to the planner** to draft from the roadmap spec.
  User will review the generated prompt before Phase 16. (No locked tone.)
- **D-15:** The prompt's scope section MUST state the advisor **may propose new
  tasks** (ADVISE-08: title required; optional description/due_date/priority/
  estimated_minutes; linked to a goal by `external_key`; required `rationale`)
  and MUST NOT edit/complete/delete existing tasks or change goal
  status/title/type. The example payload must include at least one new-task item.
- **D-16:** The JSON schema block ships as a literal `[SCHEMA BLOCK]` placeholder
  this phase; it is regenerated from `AdvisoryPayload.model_json_schema()` at the
  end of Phase 16. Plan must flag this as a known deferred one-line update.

### Claude's Discretion
- Velocity-label thresholds for `accelerating` / `steady` / `stalling` /
  `no_data` from the last 4 weekly `progress_pct` values (EXPORT-04) — sensible
  default rule; degrade to `no_data` when fewer than 2 snapshots exist.
- Ordering of "top-3 active tasks" per goal (EXPORT-02) — reuse existing
  next-best-task scoring if convenient, else priority + due-date.
- Exact preview styling / collapsibility; BottomNav icon + label/placement.
- Markdown table column layout and section ordering within the brief.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §EXPORT-01..EXPORT-06, §PROMPT-01 — the requirements this phase delivers
- `.planning/REQUIREMENTS.md` §ADVISE-08 — new-task creation scope the advisor prompt must permit (informs D-15)
- `.planning/ROADMAP.md` "Phase 15: Context Export + Advisor Prompt" — goal, 4 success criteria, PROMPT-01 + task-creation notes

### Backend data sources (assemble the bundle)
- `backend/app/services/brief.py` `_compute_progress_sync(goal_id, session)` — live `progress_pct` (D-03); also the sync engine pattern to mirror
- `backend/app/services/guidance_service.py` `get_stalled_goals()` — stalled-goals list (EXPORT-05)
- `backend/app/models/plan.py` `ScheduledBlock` — 14-day planned-vs-actual block summary (EXPORT-03)
- `backend/app/models/goal.py` `GoalProgressSnapshot` — 4-week trend values (EXPORT-04); `Goal` / `Milestone` / `GoalType` / `GoalStatus`
- `backend/app/models/__init__.py` `Task` — top-3 tasks, overdue counts (EXPORT-02)
- `backend/app/routers/export.py` — existing router (`POST /api/v1/export/snapshot`); the bundle endpoint is added here

### Frontend patterns to mirror
- `frontend/src/pages/Ingest.tsx` — closest sibling page (paste/preview flow); model the Sync page on it
- `frontend/src/hooks/useIngest.ts` — fetch + 422-handling hook; model `useExport` on it
- `frontend/src/App.tsx` — react-router routes; add `/advisor`
- `frontend/src/components/BottomNav.tsx` — add the Sync nav entry

### Prior phase context
- `.planning/phases/14-progression-substrate/14-CONTEXT.md` — snapshot table + on-demand endpoint; "Sync page button for on-demand snapshot — belongs to Phase 15" (informs D-09)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_compute_progress_sync` — drop-in for live `progress_pct` (D-03).
- `guidance_service.get_stalled_goals()` — drop-in for the stalled-goals section.
- `useIngest.ts` / `Ingest.tsx` — exact template for `useExport` + the Sync page
  (fetch, loading state, button-driven action, react-router page).
- `app/routers/export.py` already exists and is registered in `main.py` — the
  bundle endpoint slots in alongside the snapshot endpoint (no new router/wiring).

### Established Patterns
- Backend bundle assembly should be **sync** (mirror `brief.py`: `_sync_url` /
  `create_engine` / `sessionmaker`) — it touches the same sync engine the
  snapshot service does. The endpoint may be `def` (FastAPI threadpools it).
- Frontend: react-router page + a `use*` fetch hook per domain; BottomNav for
  top-level navigation; clipboard via the browser Clipboard API.

### Integration Points
- `app/routers/export.py` — add `GET /api/v1/export/bundle` (or similar) returning the Markdown brief + the documented system prompt.
- `frontend/src/App.tsx` + `BottomNav.tsx` — new `/advisor` route + nav entry.
- `frontend/src/hooks/useExport.ts` (new) and `frontend/src/pages/Advisor.tsx` (new, the Sync page).
- `frontend/src/lib/advisorPrompt.ts` (new) — the documented system prompt with the `[SCHEMA BLOCK]` placeholder (referenced by Phase 16).
</code_context>

<specifics>
## Specific Ideas

- Brief = Markdown tables, ~30k-token target, eyeball-able before paste.
- The `[SCHEMA BLOCK]` placeholder is intentional — Phase 16 regenerates it from
  `AdvisoryPayload.model_json_schema()`. Do not hand-write the schema now.
- Stateless round-trip: prompt tells the LLM to echo `session_id`; Phase 16
  reads it back. No export-log table.
- The advisor prompt must explicitly allow proposing NEW tasks (ADVISE-08) and
  forbid editing existing tasks / changing goal status·title·type.
</specifics>

<deferred>
## Deferred Ideas

- **Advisory ingest / paste-back / diff / apply** — Phase 16 (the inbound half).
- **`AppSettings.last_advisory_at` "last sync: N days ago" stamp** — Phase 16
  (stamped on confirm; distinct from D-12's stateless staleness check).
- **Auto-generated JSON schema block** — Phase 16 finalizes `AdvisoryPayload`
  and regenerates the `[SCHEMA BLOCK]`.
- **Server-side export log / issued-session tracking** — rejected (D-11 chose
  stateless); revisit only if round-trip forgery/validation ever matters for
  this single-user app.

---

*Phase: 15-context-export-advisor-prompt*
*Context gathered: 2026-06-29*
