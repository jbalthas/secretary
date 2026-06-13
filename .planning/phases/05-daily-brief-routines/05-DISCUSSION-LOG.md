# Phase 5: Daily Brief & Routines - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 05-daily-brief-routines
**Areas discussed:** Brief content & format, Missed brief behaviour, Routine actions scope

---

## Brief Content & Format

| Option | Description | Selected |
|--------|-------------|----------|
| "Good morning" | Simple, warm. Body carries the agenda detail. | ✓ |
| "Daily Brief — [date]" | More informative title, date shows at a glance. | |
| You decide | Claude picks something sensible. | |

**User's choice:** "Good morning"

---

| Option | Description | Selected |
|--------|-------------|----------|
| Tasks due today + today's calendar events | Reuses buildAgenda() — everything on today's plate. | ✓ |
| Calendar events only | Skip tasks — brief is purely about schedule. | |
| Tasks only | Skip events — brief is purely about pending work. | |

**User's choice:** Tasks due today + today's calendar events

---

| Option | Description | Selected |
|--------|-------------|----------|
| Bullet list: time + title per item | e.g. "08:30 Team standup\n• Fix bug #42". Clean, scannable. | ✓ |
| Plain prose summary | e.g. "You have 2 events and 3 tasks today." Higher-level, less detail. | |
| You decide | Claude picks the format. | |

**User's choice:** Bullet list

---

| Option | Description | Selected |
|--------|-------------|----------|
| Normal (priority 0) | Doesn't bypass quiet hours. | ✓ |
| High (priority 1) | Bypasses quiet hours. | |

**User's choice:** Normal (priority 0)

---

## Missed Brief Behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Skip — wait until tomorrow's 8am | APScheduler CronTrigger default. No surprise notifications. | ✓ |
| Fire immediately on startup if missed today | Pi startup sends brief right away if today's hasn't fired. | |
| You decide | Claude picks the misfire behaviour. | |

**User's choice:** Skip — wait until tomorrow's 8am

---

## Routine Actions Scope

| Option | Description | Selected |
|--------|-------------|----------|
| "Send daily brief" only | Reuses brief sender. Phase 6 adds TTS; future phases add more. | ✓ |
| "Send daily brief" + "Send custom Pushover message" | Two action types now — arbitrary text possible. | |

**User's choice:** "Send daily brief" only

---

| Option | Description | Selected |
|--------|-------------|----------|
| Same full brief — tasks + today's events at fire time | Reuses brief builder; an evening routine re-sends a brief. | ✓ |
| Fixed title only — no agenda content | Keeps routines simple. | |

**User's choice:** Same full brief — tasks + today's events at fire time

---

## Claude's Discretion

- DB model name for settings row
- Whether brief time is stored as HH:MM string or two int columns
- Error handling when brief builder fails
- Whether to validate cron expressions server-side before saving
- API endpoint structure for routines and brief settings

## Deferred Ideas

- "Send custom Pushover message" routine action — discussed, deferred
- Google Home TTS routine action — Phase 6
- Brief time timezone configurability from UI — v2
- Pushover action buttons on brief — v2 backlog
