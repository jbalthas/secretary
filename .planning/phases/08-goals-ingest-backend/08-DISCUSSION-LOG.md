# Phase 8: Goals + Ingest Backend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 08-goals-ingest-backend
**Areas discussed:** Goal progress formula, Habit modeling, Re-import field behavior, Celebration scope + message, Goal archive

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Goal progress formula | How task-completion and milestone-completion combine into one % | ✓ |
| Habit modeling | How habits are stored / distinguished | ✓ |
| Re-import field behavior | Overwrite vs preserve user-edited fields on idempotent re-import | ✓ |
| Celebration scope + message | Whether goal completion celebrates; message tone | ✓ |

**User's choice:** All four areas selected for discussion.

---

## Goal progress formula

| Option | Description | Selected |
|--------|-------------|----------|
| Unified ratio | (completed tasks + done milestones) / (total tasks + total milestones); each counts as one unit | ✓ |
| Tasks only | % = completed tasks / total tasks; milestones are checkpoints only | |
| Milestones drive, tasks fill | % = milestone ratio if any milestones exist, else task ratio | |

**User's choice:** Unified ratio.
**Notes:** Reconciles GOAL-02 (tasks drive progress) and GOAL-03 (milestones contribute) in one number. Computed on read, never stored. Divide-by-zero guard → 0% when no tasks/milestones.

---

## Habit modeling

| Option | Description | Selected |
|--------|-------------|----------|
| is_habit flag on Task | Habit = recurring Task + is_habit=True + optional goal_id; reuses Task model/CRUD | ✓ |
| Separate Habit table | Dedicated entity with its own fields (e.g. streaks) | |
| Extend Routine table | Add a habit action to the Routine enum | |

**User's choice:** is_habit flag on Task.
**Notes:** Matches milestone research. Streak tracking deferred (not in requirements).

---

## Re-import field behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve user runtime fields | Update descriptive fields; never overwrite completed, reminder_at, enabled | ✓ |
| Full overwrite | Payload replaces every field including completion/enabled | |
| Preserve completion only | Keep completed/done; overwrite reminder_at and enabled | |

**User's choice:** Preserve user runtime fields.
**Notes:** Match on external_key, not title. Keeps re-import safe after manual edits.

---

## Celebration scope

| Option | Description | Selected |
|--------|-------------|----------|
| Milestone + goal completion | Celebrate on milestone done AND on goal reaching completion | ✓ |
| Milestone only | Only milestone completion celebrates (literal GOAL-06) | |

**User's choice:** Milestone + goal completion.
**Notes:** Goal completion is the more meaningful moment. Both reuse existing Pushover + TTS infrastructure.

---

## Celebration message tone

| Option | Description | Selected |
|--------|-------------|----------|
| Warm + specific | Names the entity + parent goal; "you completed X on your Y goal" | ✓ |
| Short + punchy | Minimal: "Milestone complete: X" | |
| You decide | Claude picks copy at implementation time | |

**User's choice:** Warm + specific.

---

## Goal archive mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| status enum | active \| archived \| completed — one field for archive + completion | ✓ |
| archived boolean | Simple archived True/False; completion tracked separately | |
| You decide | Claude picks at implementation time | |

**User's choice:** status enum.
**Notes:** `completed` status drives the goal celebration. No hard delete — archive preserves history.

---

## Claude's Discretion

- Exact celebration copy within the warm+specific tone.
- Goal auto-complete at 100% vs explicit `status=completed` (defaulting to explicit).
- Pydantic model structure / ingest router-vs-service file layout (per ARCHITECTURE.md).
- LLM prompt delivery mechanism.
- Migration internals beyond the agreed 0006/0007/0008 split.

## Deferred Ideas

- Habit streak tracking — out of scope for Phase 8.
- Goal auto-complete at 100% progress — defaulting to explicit completion for now.
- Per-item ingest conflict report — already P3 backlog.
- Dry-run preview UI + paste/upload UI — Phase 9 (INGEST-03, INGEST-05).
