# Phase 3: Pushover Reminders - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 03-pushover-reminders
**Areas discussed:** Notification format, Job lifecycle, Post-fire cleanup, NOTIF-02 scope

---

## Notification Format

| Option | Description | Selected |
|--------|-------------|----------|
| Task title only | e.g. "Buy groceries" — clean and minimal | ✓ |
| Reminder: {task title} | e.g. "Reminder: Buy groceries" — explicit label | |

**User's choice:** Task title only

---

| Option | Description | Selected |
|--------|-------------|----------|
| Description only (if set), else empty | Shows task description if set; blank body if not | ✓ |
| Description + due date (if set) | e.g. "Pick up milk, eggs" / "Due: today 5pm" | |

**User's choice:** Description only (if set), else empty

---

| Option | Description | Selected |
|--------|-------------|----------|
| Normal (0) | Standard push, respects quiet hours | |
| High (1) | Bypasses quiet hours, always interrupts | |
| Match task priority | High task = Pushover priority 1; medium/low = normal (0) | ✓ |

**User's choice:** Match task priority

---

## Job Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| On every task save (create or update) | Upsert job any time task is saved; replace_existing=True handles updates | ✓ |
| Only when reminder_at changes | Only touch APScheduler when field changes | |

**User's choice:** On every task save

---

| Option | Description | Selected |
|--------|-------------|----------|
| Remove the job | Cancel reminder when task deleted or completed | ✓ |
| Let it fire anyway | Reminder still arrives after completion | |
| Remove on delete, keep on complete | Deletion cancels; completing doesn't | |

**User's choice:** Remove the job (on both delete and complete)

---

## Post-Fire Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| APScheduler removes the job after it fires | DateTrigger one-shot; auto-removed by APScheduler | ✓ |
| Add reminder_fired_at column to Task | Persist fired timestamp in DB | |
| Both — DateTrigger + DB flag | Belt-and-suspenders approach | |

**User's choice:** APScheduler removes the job after it fires (no extra DB column)

---

## NOTIF-02 Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Pushover plumbing only | Phase 3 builds the client; brief realized in Phase 5 | ✓ |
| Stub the daily brief now | Hardcoded 8am brief job with static text | |
| Move NOTIF-02 to Phase 5 entirely | Update requirements traceability | |

**User's choice:** Pushover plumbing only — NOTIF-02 fully realized in Phase 5

---

## Claude's Discretion

- APScheduler module structure
- Pushover client module location and error handling
- SQLAlchemyJobStore table name and URL derivation

## Deferred Ideas

- Pushover action buttons (v2)
- Retry logic on Pushover API failure (v1 logs and continues)
