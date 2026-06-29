# Phase 15: Context Export + Advisor Prompt - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 15-context-export-advisor-prompt
**Areas discussed:** Bundle data format, Token budget & truncation, Sync page shell + nav, Export→ingest round-trip, Advisor prompt stance

---

## Bundle data format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown tables | Compact Markdown tables + prose; token-lean, eyeball-able, reliable LLM parsing | ✓ |
| Hybrid: Markdown + JSON block | Markdown narrative plus one structured JSON data block; more tokens | |
| Single JSON block | Entire dataset as opaque JSON; max machine-parseable, not human-readable | |

**User's choice:** Markdown tables
**Notes:** "Embedded JSON schema" in EXPORT-01 clarified to mean the advisory *response* schema in the system prompt, not the data section.

---

## Token budget & truncation

| Option | Description | Selected |
|--------|-------------|----------|
| Generous ~30k | Frontier model target; rarely truncates | ✓ |
| Lean ~8k | Smaller/local models; truncates detail sooner | |
| No hard cap | Include everything; unbounded paste | |

**User's choice:** Generous ~30k
**Notes:** Truncation order (block detail → tasks beyond top-3 → trend detail; never drop a goal) captured as a default at Claude's discretion.

---

## Sync page shell + nav

| Option | Description | Selected |
|--------|-------------|----------|
| Full shell | copy-prompt + copy-bundle + on-demand snapshot button + bundle preview | ✓ |
| Buttons only, no preview | Three buttons, no preview pane | |
| Minimal (two copy buttons) | Snapshot button + preview deferred | |

**User's choice:** Full shell
**Notes:** Includes the on-demand snapshot button deferred from Phase 14. New `/advisor` route + BottomNav entry; mirrors Ingest page / useIngest pattern.

---

## Export → ingest round-trip

| Option | Description | Selected |
|--------|-------------|----------|
| Stateless timestamp | session_id paired with generated_at; Phase 16 reads echoed session_id from pasted reply | ✓ |
| Persisted export log | Server stores each issued session_id + issued_at | |

**User's choice:** Stateless timestamp
**Notes:** System prompt will instruct the LLM to echo session_id back. No new table.

---

## Advisor prompt stance

| Option | Description | Selected |
|--------|-------------|----------|
| Leave wording to planner | Planner drafts role framing / scope lists / example payload; user reviews before Phase 16 | ✓ |
| Direct, no-fluff advisor | Lock a blunt, 4-week-horizon stance | |
| I'll describe it | User dictates verbatim | |

**User's choice:** Leave wording to planner
**Notes:** Prompt must permit proposing new tasks (ADVISE-08) and forbid editing existing tasks / changing goal status·title·type; example payload includes a new-task item.

## Claude's Discretion

- Velocity-label thresholds (EXPORT-04); top-3 task ordering (EXPORT-02); preview styling/collapsibility; BottomNav icon/placement; Markdown table layout + section ordering.

## Deferred Ideas

- Advisory ingest/diff/apply (Phase 16); `AppSettings.last_advisory_at` stamp (Phase 16); auto-generated `[SCHEMA BLOCK]` (Phase 16); server-side export log (rejected — stateless chosen).
