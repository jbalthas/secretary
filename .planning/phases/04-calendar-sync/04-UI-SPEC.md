---
phase: 04
phase_name: calendar-sync
status: draft
created: 2026-06-12
design_system: manual CSS custom properties (no shadcn, no Tailwind)
---

# UI-SPEC — Phase 04: Calendar Sync

## Scope

Phase 04 adds two surfaces to the existing SPA:

1. **Settings page** (`/settings`) — OAuth connection card for Google Calendar with status indicator and "Connect" CTA.
2. **Today page update** — Agenda items sourced from real calendar events (replacing PLACEHOLDER_EVENTS stub); event items visually distinguished from task items.

No new navigation paradigms. Settings page is added to bottom nav.

---

## Design System

**Tool:** None (manual CSS custom properties in `frontend/src/styles.css`). No shadcn, no Tailwind.

**Rule:** All new styles follow the existing custom-property + BEM-adjacent class pattern already established in `styles.css`. No inline style objects for layout (use classes). Inline styles are acceptable only for dynamic values (e.g. conditional colors driven by state).

---

## Tokens (from `styles.css` — do not redefine)

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#0f172a` | Page background (60% dominant surface) |
| `--surface` | `#1e293b` | Cards, drawer, modal, nav (30% secondary) |
| `--accent` | `#6366f1` | CTAs, active state, focus ring (10% accent) |
| `--destructive` | `#ef4444` | Error states, destructive actions only |
| `--text` | `#f1f5f9` | Primary text |
| `--text-secondary` | `#94a3b8` | Labels, metadata, placeholder, descriptions |
| `--text-disabled` | `#475569` | Disabled inputs, inactive icons |
| `--border` | `#334155` | Dividers, input borders, card borders |

**Accent is reserved for:** Connect button (primary CTA), active bottom nav icon, focus-visible ring, segmented control active segment. Do NOT use accent for status indicators — use semantic colors (see below).

**Semantic colors (new, Phase 04 only):**

| Purpose | Value | Use |
|---------|-------|-----|
| Connected/success | `#22c55e` | Status dot when OAuth is connected |
| Warning/expiring | `#f59e0b` | Status dot when token is near expiry (future) |
| Calendar event chip | `#818cf8` | Event type badge background tint (indigo-400, relates to accent but distinct from task) |

---

## Spacing

8-point scale. All spacing in multiples of 4px.

| Scale | Value | Use |
|-------|-------|-----|
| xs | 4px | Badge padding, tight gaps |
| sm | 8px | Component internal padding, row gaps |
| md | 16px | Page horizontal padding, drawer padding, section gaps |
| lg | 24px | Card padding, modal padding |
| xl | 32px | Page top padding |
| 2xl | 48px | Empty state vertical padding |

Touch targets: minimum 44px tall for all interactive elements (buttons, rows). Already established via `.task-row { min-height: 48px }` — maintain this for settings rows.

---

## Typography

Established in `body` + existing classes — do not override.

| Role | Size | Weight | Line-height | Class/context |
|------|------|--------|-------------|---------------|
| Page title | 20px | 600 | 1.2 | `.page-title` |
| Section heading | 14px | 600 | 1.2 | (new: `.settings-section-label`) |
| Body / row title | 16px | 400 | 1.5 | `body` default |
| Secondary / metadata | 14px | 400 | 1.5 | `--text-secondary` |
| Badge / chip | 12px | 500 | 1 | `.priority-badge` pattern |

Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (inherited from body — do not redeclare).

**Exactly 4 sizes in use:** 12, 14, 16, 20px. No new sizes.
**Exactly 2 weights:** 400 (regular) and 600 (semibold). Weight 500 allowed only on badges (existing pattern).

---

## Color Contract (60/30/10)

- **60% `--bg` (`#0f172a`):** All page surfaces. The `<body>` and `.page` containers.
- **30% `--surface` (`#1e293b`):** Settings card, connection status card, bottom nav bar, drawer backgrounds.
- **10% `--accent` (`#6366f1`):** Connect button fill, active nav icon, focus ring. Calendar event chips use `#818cf8` (lighter indigo tint) to visually separate from primary accent.

---

## Component Inventory

### New Components

#### `SettingsCard`

A surface card (`.settings-card`) used to group related settings. Shares the surface token.

```css
.settings-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.settings-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

#### `ConnectionStatus` (inline in Settings page)

Displays OAuth state. Three visual states:

| State | Indicator | Label | CTA |
|-------|-----------|-------|-----|
| Not connected | Grey dot (8px circle, `--text-disabled`) | "Not connected" | "Connect Google Calendar" button |
| Connected | Green dot (8px circle, `#22c55e`) | "Connected — syncs every 5 min" | "Disconnect" text link |
| Error / revoked | Red dot (8px circle, `--destructive`) | "Connection lost — re-connect to restore" | "Reconnect" button (accent fill) |

The status row layout:
```css
.connection-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  flex-shrink: 0;
}
```

#### `CalendarEventRow` (in AgendaItem or as variant)

Calendar events in Today view get a left-border accent to distinguish from tasks. Use an `event` variant class on `.agenda-item`:

```css
.agenda-item--event {
  border-left: 3px solid #818cf8;
  padding-left: 8px;
}
```

Events do not have a checkbox (read-only from Google). They display:
- Time (or "All day") — 14px, `--text-secondary`
- Title — 16px, `--text`
- No priority badge

#### Bottom Nav — Settings tab

Add a Settings icon (gear) to `BottomNav`. Route: `/settings`. Label: "Settings". Follows existing nav icon pattern (24px icon, 12px label below, `--text-secondary` inactive / `--accent` active).

---

## Settings Page Layout

Route: `/settings`

```
.page
  h1.page-title  "Settings"

  .settings-card
    p.settings-card-title  "Google Calendar"
    .connection-status-row
      .status-dot  [color by state]
      span  [status label by state]
    .btn-connect | .btn-disconnect  [CTA by state]

  .settings-card
    p.settings-card-title  "Sync"
    p.settings-meta  "Last synced: [time] ago"   ← 14px, --text-secondary
```

The "Connect Google Calendar" button uses `.btn-save` (existing class — full-width, accent fill, 16px, 600 weight).
The "Disconnect" link uses plain text styling (no button chrome): `font-size: 14px; color: var(--destructive); cursor: pointer; background: none; border: none;`.

---

## Interaction States

### OAuth Connect Flow

1. User taps "Connect Google Calendar" — opens Google OAuth consent in a new tab (or full redirect).
2. After redirect back to `/settings?connected=true`, the page shows connected state automatically.
3. No loading spinner required during the redirect (browser handles navigation state).

### Sync Status

- `last_synced_at` displayed as relative time: "2 minutes ago", "Just now", etc.
- No manual refresh button — sync is automatic. Display is read-only.

### Error: Token Revoked

- Settings page shows error state card (red dot + message).
- User taps "Reconnect" — same OAuth flow as first connect.
- A Pushover notification is sent by the backend (CAL-04) — no additional in-app alert needed.

---

## Copywriting Contract

| Element | Copy |
|---------|-------|
| Settings page title | "Settings" |
| Calendar section heading | "Google Calendar" |
| Not connected status | "Not connected" |
| Connected status | "Connected — syncs every 5 min" |
| Error status | "Connection lost — re-connect to restore sync" |
| Connect CTA | "Connect Google Calendar" |
| Reconnect CTA | "Reconnect" |
| Disconnect action | "Disconnect" |
| Sync meta (no sync yet) | "Never synced" |
| Sync meta (synced) | "Last synced [N] minutes ago" |
| Sync meta (just now) | "Last synced just now" |
| Today empty state (no tasks, no events) | "Nothing scheduled today" (existing) |
| Today empty sub-copy | "Add a task with a due time or check back when events sync." (existing — keep as-is) |
| Disconnect confirmation title | "Disconnect Google Calendar?" |
| Disconnect confirmation body | "Synced events will be removed from the agenda." |
| Disconnect confirm button | "Disconnect" |
| Disconnect cancel button | "Cancel" |

**Destructive action flow — Disconnect:**
Uses existing `.confirm-modal` pattern (same as task delete). Modal requires explicit confirm before credentials are cleared.

---

## Accessibility

- All interactive elements reachable by keyboard; focus ring via existing `:focus-visible` rule.
- Status dot supplemented with text label — never color alone to convey state.
- OAuth redirect target (`/auth/google`) is a server redirect, not a JS popup — no popup-blocker risk.
- `aria-label` on status dot: `aria-label="Connection status: [connected|not connected|error]"`.

---

## States & Edge Cases

| State | Handling |
|-------|---------|
| OAuth flow in progress (redirect away) | No in-app loader needed |
| `GET /api/v1/calendar/status` returns 500 | Show "Unable to check status — try refreshing" in status row (14px, `--text-secondary`) |
| Synced events, none today | Today page shows tasks only; calendar section not rendered |
| All-day events | Render under "All day" section header (existing pattern in Today.tsx) |
| Events with no title | Render as "(No title)" in `--text-secondary` |
| Cancelled events (status="cancelled") | Not returned by backend — filter at DB layer |

---

## What Is Out of Scope

- Manual sync trigger button — sync is automatic
- Calendar event creation or editing — read-only in v1
- Multi-calendar selection — single "primary" calendar
- Event detail drawer — tap on agenda event does nothing in this phase

---

## Registry

No shadcn. No third-party component registries. Registry safety gate: not applicable.

---

## Pre-Population Sources

| Source | Decisions Used |
|--------|---------------|
| `frontend/src/styles.css` | All tokens, spacing, typography, component patterns |
| `frontend/src/App.tsx` | Routing pattern, page structure |
| `frontend/src/pages/Today.tsx` | Empty state copy (existing), agenda rendering pattern |
| RESEARCH.md | Settings page listed in architecture (Pattern 5); `/settings` route with "Connect Google Calendar" button |
| REQUIREMENTS.md | CAL-01 (OAuth flow in web UI), CAL-04 (revocation alert via Pushover — no in-app duplicate needed) |
| User input | 0 questions asked — all decisions derivable from existing codebase |
