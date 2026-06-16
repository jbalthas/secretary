# Phase 9: Goals + Ingest UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 09-goals-ingest-ui
**Areas discussed:** Navigation & page layout, Ingest page (input/prompt/preview), Goal management scope, Task/routine → goal linking

---

## Navigation & page layout

| Option | Description | Selected |
|--------|-------------|----------|
| 4th bottom-nav tab | Add 'Goals' as a 4th tab with its own icon | ✓ |
| Under Today | Surface goals from the Today page, no new tab | |
| Replace/merge a tab | Fold Goals into an existing tab | |

**User's choice:** Goals = 4th bottom-nav tab.

| Option | Description | Selected |
|--------|-------------|----------|
| Route from Goals page | 'Import' button on Goals opens Ingest at its own route | ✓ |
| Its own bottom-nav tab | Dedicated Ingest tab (nav → 5) | |
| Under Settings | Tuck Ingest into Settings | |

**User's choice:** Ingest = own route, reached via Import button on Goals page.

---

## Ingest page (input/prompt/preview)

| Option | Description | Selected |
|--------|-------------|----------|
| Full per-entity list | New POST /ingest/preview returns each entity with create/update badge | ✓ |
| Counts + per-type breakdown | Summary numbers per entity type | |
| Counts only | Just totals | |

**User's choice:** Full per-entity list (requires new POST /ingest/preview).

| Option | Description | Selected |
|--------|-------------|----------|
| Show prompt + copy button | Ingest page includes documented LLM prompt (copy) + schema | ✓ |
| Schema only | Expose raw schema, no ready-to-paste prompt | |
| Input only | Just paste/upload + preview | |

**User's choice:** Show prompt + copy button. **Note:** the documented LLM prompt artifact does not exist yet (Phase 8 deferred its delivery) — Phase 9 must author it.

| Option | Description | Selected |
|--------|-------------|----------|
| Field-level error list | Parse 422 detail into readable list | ✓ |
| Raw error block | Dump 422 JSON | |
| Generic message | 'Payload invalid' | |

**User's choice:** Field-level error list.

---

## Goal management scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full CRUD | Create / edit / archive goals in UI (drawer + FAB) | ✓ |
| Edit + archive only | Edit/archive but no manual create | |
| View-only | Read-only; goals only via ingest | |

**User's choice:** Full CRUD.

| Option | Description | Selected |
|--------|-------------|----------|
| Add + toggle done | Add milestones + done checkbox (fires celebration) | ✓ |
| Toggle done only | Done checkbox only, no manual add | |
| Display only | Read-only milestones | |

**User's choice:** Add + toggle done.

| Option | Description | Selected |
|--------|-------------|----------|
| Progress + milestones + tasks | Progress bar, milestones, linked tasks list (tappable) | ✓ |
| Progress + milestones | Tasks as a count only | |
| You decide | Claude chooses layout | |

**User's choice:** Progress + milestones + linked tasks.

---

## Task/routine → goal linking

| Option | Description | Selected |
|--------|-------------|----------|
| Tasks + routines | Goal dropdown in both drawers (routine needs backend touch) | ✓ |
| Tasks only | Task drawer only; routine tagging deferred | |

**User's choice:** Tasks + routines (routine needs goal_id added to schema/handlers).

| Option | Description | Selected |
|--------|-------------|----------|
| Active goals + None | Active goals only + 'No goal' unlink | ✓ |
| All goals + None | Every goal regardless of status + 'No goal' | |

**User's choice:** Active goals + None.

---

## Claude's Discretion

- Exact `POST /ingest/preview` response shape (must share matching logic with confirm).
- Storage/delivery of the documented LLM prompt (static constant vs endpoint vs rendered doc).
- Goal-card visuals, type badge, empty state, icons; shared `<GoalSelect>` component.

## Deferred Ideas

- Habit-specific UI / streaks (deferred since Phase 8).
- Goal auto-complete at 100% progress (explicit complete only).
- Per-item ingest conflict resolution UI (REQUIREMENTS backlog P3).
