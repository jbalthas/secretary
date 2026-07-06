# Phase 16: Advisory Ingest + Sync Review UI - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the **inbound half** of the advisory loop. On the existing `/advisor` Sync
page, the user pastes the external LLM's advisory JSON reply, previews a per-item
diff (entity · field · old → new value · rationale, with new tasks as add-rows)
with **no DB writes**, accepts or rejects individual rows, and confirms the
accepted subset — applied in a **single atomic transaction**, **idempotent on a
stable `advisory_id`**. This closes the loop Phase 15 opened (export → paste to
LLM → ingest decisions → see what changed and why).

Delivers ADVISE-01..08 + SYNC-01..02, and finalizes PROMPT-01 (regenerate the
`[SCHEMA BLOCK]` in `advisorPrompt.ts` from `AdvisoryPayload.model_json_schema()`).

**Out of scope:** the export/copy half (Phase 15, already shipped); any
server-side LLM call (hard constraint); new dependencies (hard constraint).
</domain>

<decisions>
## Implementation Decisions

> The backend correctness model is **locked by the roadmap** (see
> "Critical correctness gates" in ROADMAP.md Phase 16 and ADVISE-01..08). Those
> are decided, not gray areas — they are restated under "Locked (not discussed)"
> below so downstream agents don't re-open them. The decisions D-01..D-12 below
> are the **UI/UX choices** captured in this discussion.

### Diff review layout (ADVISE-04)
- **D-01:** **Rationale is always visible** — rendered as sub-text directly
  beneath each diff row, never hidden behind a tap/hover/tooltip. The rationale
  is the whole point of the review; the user must see every "why" at a glance.
- **D-02:** Diff rows are **grouped by entity type** — sections `Goals`,
  `Milestones`, `New tasks` — mirroring the existing `DiffGroup` pattern in
  `Ingest.tsx`. This is a **new, richer** diff component than the existing one:
  the current `DiffGroup` shows only `title + create/update badge`; the advisory
  diff must show **entity · field · old → new value · rationale** per row, and
  render new tasks as **add-rows** (no old value).

### Accept/reject interaction (ADVISE-07)
- **D-03:** Each diff row defaults to **accepted**; the user **rejects (unchecks)**
  the rows they disagree with, then Confirm applies the rest. Optimizes for "the
  advisor is mostly right." (Checkbox-style affordance per row.)
- **D-04:** Confirm posts a **client-filtered payload** containing only the
  accepted rows. The backend stays on the simple `apply_import` path (applies
  what it receives); `advisory_id` idempotency still guards re-confirm. **No**
  per-row accept flags sent to the backend, **no** server-side filtering logic.
- **D-05:** Consequence the planner must honor: because idempotency is keyed on
  the stable `advisory_id` (AdvisoryLog), **accept/reject is a one-shot decision**.
  Re-pasting the same advisory later to apply the previously-rejected rows is a
  **no-op replay** (returns the original result, applies nothing new). This is
  acceptable for a single-user app; do not build partial-then-resume logic.

### Page structure & paste flow (SYNC-01)
- **D-06:** Keep the **single linear scrolling page**. The export/copy section
  (copy-prompt, copy-bundle, snapshot, preview — the Phase 15 shell) stays on
  top; the new **"Paste advisory response"** section goes **below** it, then the
  diff/notes/confirm. No tabs, no stepper — matches the `Ingest.tsx` feel and
  adds no new nav concepts.
- **D-07:** Input is **paste-only** — a `<textarea>` + "Run preview" button. No
  file-upload affordance (the advisory reply comes straight from an LLM chat;
  copy/paste is the natural path; SYNC-01 says "paste the LLM's JSON response").
- **D-08:** After a successful Confirm, **stay on the Sync page and show an
  in-page success summary** (e.g. "2 goals adjusted · 1 milestone · 1 new task")
  with a link to `/goals`. Keeps context on the loop just run and lets the
  last-sync line update inline. (Do **not** auto-navigate to `/goals` the way
  `Ingest.tsx` does.) Note: criterion 4 still requires the changes be visible in
  the Goals view — the link satisfies that; the data is already committed.

### Notes + staleness surfacing (ADVISE-06, SYNC-02)
- **D-09:** The advisor's free-text top-level `notes` field renders as a **distinct
  callout card above the diff rows** (accent border / quote style) — the user
  reads the advisor's overall reasoning first, then the itemized changes. `notes`
  is **display-only, before confirm, and is NEVER written** to any goal,
  milestone, or task entity (ADVISE-06 hard rule).
- **D-10:** **"Last advisor sync: N days ago"** renders in the **page header
  area** (near the title), shown always — reads `AppSettings.last_advisory_at`
  (stamped on confirm, per Phase 15 D-13).
- **D-11:** The **>7-day staleness warning** appears as a **non-blocking inline
  banner on/above the diff** after preview. It is computed from the **echoed
  `session_id` + its paired `generated_at`** carried back in the pasted reply
  (stateless, per Phase 15 D-11/D-12) — **no server lookup**. Non-blocking: the
  user can still confirm.

### Claude's Discretion
- Exact visual styling of the new diff component (row spacing, old→new arrow
  glyph, badge colors for add vs update), the notes callout, and the staleness
  banner — follow existing CSS-variable conventions (`var(--surface)`,
  `var(--border)`, `diff-badge*`, `--destructive`, etc.).
- The shape of `useAdvisory` (new hook modeled on `useIngest`) — preview/confirm
  fetch + 422 parsing, plus carrying `notes` / `session_id` / `generated_at`
  / `last_advisory_at` through to the page. Reuse `parse422`.
- The success-summary copy/format (D-08) and how counts are derived from the
  confirm response.
- Whether the new diff component lives in `Advisor.tsx` or a small extracted
  component — planner's call.
- Velocity/label-style details inherited from Phase 15 are not in scope here.

### Locked (not discussed — restated so downstream agents don't re-open)
- `AdvisoryPayload` + nested `GoalAdjustment`, `MilestoneAdjustment`,
  `TaskCreation`; `payload_type` discriminator defaulting to `"standard"`
  (backward-compat with existing `schema_version 1.x` payloads — regression test
  required); `rationale: str` **required** on every adjustment/creation;
  `model_config = ConfigDict(extra="forbid")` everywhere.
- `TaskCreation` is **create-only**: no `id` / existing-task-match field, so
  edits/completion/deletion of existing tasks are rejected at validation.
  Advisory **cannot** create goals or change goal status/title/type — schema-blocked.
- Goal match by `external_key`; milestone match by `(goal, title)`.
- Apply path: `await session.flush()` + a **shared** `goal_key_to_id` map
  reused with `apply_import` (no fork); apply order **goals → milestones →
  tasks** so new tasks resolve `goal_id` from the flushed map. New-task creation
  reuses the `apply_import` task-creation path (no fork).
- Idempotency: `advisory_id` via a new **`AdvisoryLog`** table (**migration
  0018**, mirrors `UpdateLog`); new tasks additionally carry a stable
  advisory-derived `external_key`, with `Task.external_key` UNIQUE guarding
  row-level duplicates on re-confirm.
- `AppSettings.last_advisory_at` stamped on confirm (the 0018 migration adds it).
- CI/grep guard: `grep -r "anthropic\|openai\|litellm" backend/app/` returns zero.
- Last plan regenerates `advisorPrompt.ts` `[SCHEMA BLOCK]` from
  `AdvisoryPayload.model_json_schema()` (completes PROMPT-01) — known one-line-ish
  deferred update from Phase 15 (D-16).

### Folded Todos
None — `todo match-phase 16` returned no matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §ADVISE-01..ADVISE-08 — advisory payload, validation,
  preview, atomic/idempotent confirm, notes, per-row accept/reject, new-task creation
- `.planning/REQUIREMENTS.md` §SYNC-01..SYNC-02 — single-page loop + last-sync/staleness
- `.planning/REQUIREMENTS.md` §PROMPT-01 — schema-block regen finalizes this requirement
- `.planning/ROADMAP.md` "Phase 16: Advisory Ingest + Sync Review UI" — goal, the
  **Critical correctness gates** list (LOCKED), and the 5 success criteria

### Backend — patterns to extend (no fork)
- `backend/app/services/ingest_service.py` — `apply_import` (flush + `goal_key_to_id`
  + goals→tasks order), `dry_run_import`, `_upsert_task` (the task-creation path
  new tasks reuse). The advisory apply MUST share these helpers.
- `backend/app/schemas/ingest.py` — `IngestPayload` (where `payload_type` lands),
  `extra="forbid"` models, `EntityDiff` (extend for field-level old→new)
- `backend/app/routers/ingest.py` — `/preview`, `/confirm`, `/schema` endpoints to
  mirror for the advisory routes
- `backend/app/models/__init__.py` — `UpdateLog` (template for `AdvisoryLog`),
  `AppSettings` (add `last_advisory_at`), `Task.external_key` (UNIQUE, already present)
- `backend/app/models/goal.py` — `Goal` (`target_date`, `priority_rank`),
  `Milestone` (`target_date`, `done`, `title`) — the adjustable fields

### Frontend — patterns to extend
- `frontend/src/pages/Advisor.tsx` — the Phase 15 Sync page shell; extend in place (D-06)
- `frontend/src/pages/Ingest.tsx` — `DiffGroup` + paste/preview/confirm + error-list
  reference (the advisory diff is a richer variant — D-01/D-02)
- `frontend/src/hooks/useIngest.ts` — `parse422` + preview/confirm shape to model
  the new `useAdvisory` hook on
- `frontend/src/lib/advisorPrompt.ts` — `[SCHEMA BLOCK]` placeholder to regenerate
- `frontend/src/types/goal.ts` — `IngestEntityDiff` / `IngestPreviewResult` types to
  extend for advisory diffs

### Prior phase context
- `.planning/phases/15-context-export-advisor-prompt/15-CONTEXT.md` — D-11/D-12
  (stateless echoed `session_id` staleness), D-13 (`last_advisory_at` on confirm),
  D-16 (schema-block regen deferred here)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apply_import` / `_upsert_task` / `dry_run_import` (`ingest_service.py`) —
  the advisory apply and preview reuse the flush + `goal_key_to_id` machinery
  and the task-creation path directly (no fork — roadmap gate).
- `UpdateLog` (`models/__init__.py`) — exact template for `AdvisoryLog`
  (string unique key + `created_at`), and `_apply_update`'s "seen before? return"
  pattern is the idempotency model.
- `useIngest.ts::parse422` + preview/confirm fetch flow — drop-in shape for
  `useAdvisory`.
- `DiffGroup` (`Ingest.tsx`) + `diff-badge*` CSS — visual starting point; extend
  to show field-level old→new + always-visible rationale.
- `Advisor.tsx` — already renders sections + clipboard + preview; the paste/diff/
  confirm/notes/staleness sections append below the existing export sections.

### Established Patterns
- Ingest endpoints are `async def` on the **async** session (`get_session`),
  unlike the export/snapshot sync path — the advisory preview/confirm follow the
  **async ingest** pattern (mutating writes), not the sync export pattern.
- Pydantic models use `ConfigDict(extra="forbid")` + `Literal` discriminators;
  422 surfaces field-level `loc`/`msg` the frontend already parses.
- Frontend: react-router page + per-domain `use*` hook; CSS variables; clipboard
  via browser Clipboard API; section-based linear page layout.

### Integration Points
- `backend/app/schemas/ingest.py` (or a sibling `schemas/advisory.py`) —
  `AdvisoryPayload` + nested models; `payload_type` on the base payload.
- `backend/app/services/ingest_service.py` — advisory apply/preview functions
  that share the existing helpers.
- `backend/app/routers/ingest.py` (or sibling advisory router) — advisory
  preview/confirm/schema endpoints.
- `backend/app/models/__init__.py` — `AdvisoryLog` + `AppSettings.last_advisory_at`;
  **migration 0018**.
- `frontend/src/pages/Advisor.tsx` — new paste/diff/notes/confirm/staleness UI.
- `frontend/src/hooks/useAdvisory.ts` (new) + `frontend/src/types/` advisory diff types.
- `frontend/src/lib/advisorPrompt.ts` — schema-block regeneration (PROMPT-01).

</code_context>

<specifics>
## Specific Ideas

- The advisory diff is the one genuinely new UI piece: `entity · field · old → new
  · rationale`, rationale always under the row, new tasks as add-rows, grouped
  Goals / Milestones / New tasks.
- Default-accept rows; Confirm posts a client-filtered payload of accepted rows
  only; accept/reject is one-shot (idempotent replay afterwards).
- Notes = accent callout above the diff, display-only, never persisted.
- Last-sync line in the header (from `last_advisory_at`); >7-day staleness banner
  inline on preview, computed from the echoed `session_id`/`generated_at`, non-blocking.
- Stay on Sync after confirm with a success summary + link to Goals.

</specifics>

<deferred>
## Deferred Ideas

- **File-upload for the advisory paste box** — rejected for this phase (D-07,
  paste-only); revisit only if an out-of-band advisory file workflow ever appears.
- **Partial-then-resume advisory apply** (apply rejected rows in a later session)
  — out of scope; idempotency is one-shot per `advisory_id` (D-05). Would need a
  different idempotency key design.
- **Export/Import tabs or a guided stepper** on the Sync page — rejected for a
  single linear page (D-06); reconsider only if the page becomes unwieldy.
- **Per-row accept flags / server-side subset filtering** — rejected (D-04,
  client filters); revisit only if an audit trail of rejected rows is ever wanted.

[No reviewed-but-deferred todos — none matched this phase.]

</deferred>

---

*Phase: 16-advisory-ingest-sync-review-ui*
*Context gathered: 2026-06-30*
