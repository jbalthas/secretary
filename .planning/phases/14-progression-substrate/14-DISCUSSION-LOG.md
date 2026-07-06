# Phase 14: Progression Substrate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 14-progression-substrate
**Areas discussed:** Cadence, Snapshot columns, Retention, On-demand trigger, Slipped definition, Week anchor / milestones semantics

---

## Cadence (weekly vs daily)

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly (per PROG-01) | One row per goal per week; matches requirement text + week-scoped column names; ~52 rows/goal/year | ✓ |
| Daily (per research) | One row per goal per day at 23:50, idempotent per day; smoother trends; contradicts "weekly" wording | |
| Daily snapshot, weekly metrics | Daily progress_pct curve + week-scoped activity counts each row | |

**User's choice:** Weekly (per PROG-01)
**Notes:** Requirement's literal "weekly" wording and `tasks_*_week` naming won over the research's daily recommendation.

---

## Snapshot columns

| Option | Description | Selected |
|--------|-------------|----------|
| Requirement set (PROG-01) | progress_pct, milestones_done, tasks_completed_week, tasks_slipped_week | ✓ |
| Research set (ARCHITECTURE.md) | progress_pct, task_done, task_total, ms_done, ms_total (cumulative) | |
| Both (superset) | Cumulative counts + week-scoped activity | |

**User's choice:** Requirement set (PROG-01)
**Notes:** "slipped" needed an explicit definition — resolved below.

---

## Retention

| Option | Description | Selected |
|--------|-------------|----------|
| Include now | Monthly cleanup job, delete rows >2yr, id="snapshot_cleanup" | ✓ |
| Defer | Ship snapshot + trigger only; add retention later | |

**User's choice:** Include now
**Notes:** Research flags skipping it as a future SQLite migration cost; cheap to add now.

---

## On-demand trigger scope

| Option | Description | Selected |
|--------|-------------|----------|
| Backend endpoint only | POST /api/v1/export/snapshot; button wired in Phase 15 | ✓ |
| Endpoint + minimal button | Also add a temporary trigger button now | |

**User's choice:** Backend endpoint only
**Notes:** Keeps Phase 14 backend-only, matching the roadmap UI hint (no).

---

## tasks_slipped_week definition

| Option | Description | Selected |
|--------|-------------|----------|
| Due in window, still open | due_date in snapshot week AND not completed at run time | ✓ |
| Became overdue this week | due_date passed during week + still incomplete (newly slipped only) | |
| Open past-due, any age | all incomplete past-due tasks regardless of when slipped | |

**User's choice:** Due in window, still open
**Notes:** Simplest point-in-time definition.

---

## Week anchor / milestones_done semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Sun 23:50, cumulative milestones | Week = preceding Mon–Sun; milestones_done = total done as of now | ✓ |
| Sun 23:50, milestones done this week | Week-scoped milestone count (needs completed_at on Milestone) | |
| Mon 00:05, cumulative milestones | Week-start timing, cumulative count | |

**User's choice:** Sun 23:50, cumulative milestones
**Notes:** Avoids needing a `completed_at` column on Milestone; parallels how progress_pct is computed.

## Claude's Discretion

- Exact internal function/file names within established patterns
- Whether to inline or reuse `_compute_progress_sync`
- Response shape of the snapshot endpoint

## Deferred Ideas

- Daily cadence + cumulative count columns (research's original)
- Plan-adherence / ScheduledBlock snapshotting (plan_adherence_log)
- completed_at on Milestone (enables weekly milestone velocity)
- Sync page button for on-demand snapshot (Phase 15)
