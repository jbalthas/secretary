# Phase 2: Tasks & Agenda - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 02-tasks-agenda
**Areas discussed:** Task list layout, Task form / editing, Agenda view, Navigation & layout

---

## Task List Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Compact rows | One row per task: title + priority badge + due date. Dense, scannable. | ✓ |
| Cards | Each task in a card with more visible detail. | |
| Grouped by priority | Tasks grouped under High / Medium / Low headers. | |

**User's choice:** Compact rows

### Task Info

| Option | Selected |
|--------|----------|
| Description preview | ✓ |
| Reminder indicator | ✓ |
| Recurrence indicator | ✓ |
| Nothing extra | |

(Title, priority badge, due date, completion checkbox always included)

### Filters

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs for status + sort dropdown | Pending/Completed tabs, sort by due date or priority | ✓ |
| Filter bar with chips | Horizontal toggleable chips | |
| You decide | Claude picks | |

---

## Task Form / Editing

| Option | Description | Selected |
|--------|-------------|----------|
| Slide-in drawer | Slides from right, task list stays visible | ✓ |
| Modal dialog | Centered overlay | |
| Inline expand | Row expands in place | |

**Fields visible up front:**

| Option | Selected |
|--------|----------|
| Title + priority + due date up front, rest collapsible | ✓ |
| All fields visible at once | |
| Progressive reveal | |

**Create trigger:**

| Option | Selected |
|--------|----------|
| + button fixed at bottom-right (FAB) | ✓ |
| + button at top of task list | |
| Both | |

---

## Agenda View

| Option | Description | Selected |
|--------|-------------|----------|
| Chronological merged list | Single timeline, tasks and events together | ✓ |
| Two sections: Events then Tasks | Separate blocks | |
| Hour-by-hour grid | Calendar-style blocks | |

**Agenda task info:**

| Option | Selected |
|--------|----------|
| Title + priority + time (if set) — compact style | ✓ |
| Title + priority + description preview | |
| You decide | |

**Placeholder events:**

| Option | Selected |
|--------|----------|
| Hardcoded sample events (e.g. "Team standup 9am") | ✓ |
| Empty — just tasks for now | |
| "Calendar not connected" note | |

---

## Navigation & Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom nav bar with 2 tabs | "Today" and "Tasks" tabs, mobile-friendly | ✓ |
| Top tabs / segmented control | Tabs at top | |
| Sidebar navigation | Left sidebar | |

**Default view:**

| Option | Selected |
|--------|----------|
| Today's agenda | ✓ |
| Task list | |
| You decide | |

---

## Claude's Discretion

- Color scheme for priority badges
- Empty state copy and illustrations
- Drawer animation style
- Recurring task input UI (cron expression vs friendly picker)
- Mobile responsiveness implementation details

## Deferred Ideas

- Search / full-text task search — new capability
- Drag-to-reorder tasks — out of scope v1
- Task attachments — out of scope v1
