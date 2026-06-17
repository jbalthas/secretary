# Phase 10: Day Auto-Organize - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 10-day-auto-organize
**Areas discussed:** Task selection & ordering, Work window & pacing, Approve & re-plan behavior, Today integration & edge states

---

## Area selection

| Option | Selected |
|--------|----------|
| Task selection & ordering | ✓ |
| Work window & pacing | ✓ |
| Approve & re-plan behavior | ✓ |
| Today integration & edge states | ✓ |

All four areas selected.

---

## Task selection & ordering

### Q: What's the candidate pool of tasks the planner pulls from?
| Option | Description | Selected |
|--------|-------------|----------|
| Due today + overdue | Tasks due today plus any overdue still-pending tasks | ✓ |
| Only due today | Strictly today's due date | |
| All pending tasks | Every incomplete task regardless of due date | |

**User's choice:** Due today + overdue

### Q: Backfill remaining free time with other pending tasks?
| Option | Description | Selected |
|--------|-------------|----------|
| Backfill remaining free time | Fill leftover gaps with lower-priority/no-due-date pending tasks | ✓ |
| Leave gaps empty | Only schedule due/overdue tasks | |

**User's choice:** Backfill remaining free time

### Q: Include recurring habits (is_habit tasks) as schedulable blocks?
| Option | Description | Selected |
|--------|-------------|----------|
| Exclude habits | Habits driven by their own reminders; plan = one-off tasks | ✓ |
| Include habits due today | Treat a habit as schedulable if recurrence makes it due today | |

**User's choice:** Exclude habits

---

## Work window & pacing

### Q: How are planning hours determined?
| Option | Description | Selected |
|--------|-------------|----------|
| Configurable in Settings | work_start/work_end on AppSettings, defaults 9:00–18:00 | ✓ |
| Fixed 9:00–18:00 | Hardcoded | |
| Per-request override | Query params each propose | |

**User's choice:** Configurable in Settings

### Q: How should blocks be paced within free time?
| Option | Description | Selected |
|--------|-------------|----------|
| Pack back-to-back | Contiguous from start of each gap | ✓ |
| Auto-insert short buffers | Fixed buffer between consecutive blocks | |

**User's choice:** Pack back-to-back

### Q: How to handle a task whose estimated_minutes exceeds the largest free gap?
| Option | Description | Selected |
|--------|-------------|----------|
| Place if it fits any gap, else skip | Full-duration placement only; skip non-fitting | ✓ |
| Truncate to fit the gap | Shrink block to gap size | |
| Split across multiple gaps | Break into several blocks | |

**User's choice:** Place if it fits any gap, else skip

---

## Approve & re-plan behavior

### Q: 2nd Approve for same date — reject (ROADMAP) or overwrite (ARCHITECTURE)?
| Option | Description | Selected |
|--------|-------------|----------|
| Replace via explicit Re-plan | 1st commits; naked 2nd → 409; explicit Re-plan replaces | ✓ |
| Always overwrite silently | Every approve delete-then-inserts | |
| Hard reject, no replace | Locked once approved | |

**User's choice:** Replace via explicit Re-plan

### Q: Opening Organize for an already-approved date — what loads?
| Option | Description | Selected |
|--------|-------------|----------|
| Show approved plan, offer Re-plan | Load committed blocks + Re-plan button | ✓ |
| Always start from a fresh proposal | Ignore committed blocks | |

**User's choice:** Show approved plan, offer Re-plan

---

## Today integration & edge states

### Q: How should the staleness warning surface?
| Option | Description | Selected |
|--------|-------------|----------|
| Badge on conflicting block + Re-plan hint | Per-block "conflicts with [event]" marker | ✓ |
| Day-level banner | Single vague banner | |

**User's choice:** Badge on conflicting block + Re-plan hint

### Q: What shows when the day is fully booked (no free time)?
| Option | Description | Selected |
|--------|-------------|----------|
| Empty proposal + clear message | No blocks; "calendar is full" message | ✓ |
| Suggest beyond work hours | Fallback blocks outside work window | |

**User's choice:** Empty proposal + clear message

### Q: Where do unplaced/overflow tasks appear?
| Option | Description | Selected |
|--------|-------------|----------|
| "Didn't fit" list under the plan | Distinct section on Organize page | ✓ |
| Silently omit | Only show scheduled | |

**User's choice:** "Didn't fit" list under the plan

### Q: What edit affordances should the Organize review screen have?
| Option | Description | Selected |
|--------|-------------|----------|
| Remove + reorder + adjust time | Tap-button reorder (not drag), edit start/duration | ✓ |
| Remove + drag-to-reorder | Drag handles | |
| Remove only | Delete unwanted blocks only | |

**User's choice:** Remove + reorder + adjust time (tap buttons, mobile-friendly)

---

## Claude's Discretion

- Replace-vs-reject signaling mechanism on approve (flag / `?replace=true` / separate endpoint)
- Best-fit vs first-fit gap assignment (default first-fit chronological)
- Visual styling of staleness badge, "Didn't fit" list, buffer/block rendering
- Whether propose excludes already-passed gaps for the current day
- ProposedBlock / ScheduledBlock field layout beyond ARCHITECTURE.md §3

## Deferred Ideas

- Scheduling habits into the plan
- Auto-inserted buffers/breaks (as a future Settings toggle)
- Splitting/truncating long tasks
- Google Calendar write-back of approved blocks
- Multi-day / week planning
- Voice / Google Home "organize my day" trigger
- Goal-urgency weighting in ordering (Phase 11)
