# Phase 4: Calendar Sync - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 04-calendar-sync
**Areas discussed:** OAuth Connect UX, Settings page & nav, Event time window, Startup sync behavior

---

## OAuth Connect UX

| Option | Description | Selected |
|--------|-------------|----------|
| Settings page only | OAuth lives exclusively in /settings. No auto-prompts in Today or Tasks — you go connect it when ready. Clean separation. | ✓ |
| Banner in Today view | A dismissable banner at the top of Today shows 'Connect Google Calendar' until you authorize. | |
| Inline prompt in Today | When no calendar is connected, Today shows a prominent 'Connect Calendar' button where the events section would be. | |

**User's choice:** Settings page only  
**Notes:** Deliberate — no auto-prompts. User goes to connect when ready.

---

## Settings page — post-connect display

| Option | Description | Selected |
|--------|-------------|----------|
| Connected status + Disconnect button | Shows 'Connected as user@gmail.com' with a button to revoke/re-auth. | ✓ |
| Connected status + last sync time | Shows connection status and when events were last synced. | |
| You decide | Keep it minimal — whatever makes sense for a personal tool | |

**User's choice:** Connected status + Disconnect button  
**Notes:** Minimal; no sync timestamp for v1.

---

## Settings page & nav

| Option | Description | Selected |
|--------|-------------|----------|
| Third nav tab: Settings | Add a gear/settings tab to the bottom nav. Discoverable and consistent with mobile app patterns. | ✓ |
| Gear icon in the header | Small gear icon in the top-right corner. Keeps the nav clean at 2 tabs. | |
| You decide | Pick whatever fits the existing nav structure best | |

**User's choice:** Third nav tab: Settings  
**Notes:** Bottom nav grows from 2 to 3 tabs: Today | Tasks | Settings.

---

## Event time window

| Option | Description | Selected |
|--------|-------------|----------|
| Today forward only | Only sync and store future events. Minimal storage. | ✓ |
| 1 week back + 4 weeks forward | Small history window for context. | |
| You decide | Pick a sensible window for a personal agenda tool | |

**User's choice:** Today forward only  
**Notes:** `timeMin` = today 00:00:00 UTC in full sync. Past events pruned on each sync.

---

## Startup sync behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — sync on startup | Run a sync during FastAPI lifespan startup. Events fresh immediately after Pi reboot. | ✓ |
| No — schedule only | First sync fires on the 5-min APScheduler schedule. Up to 5-min wait after reboot. | |
| You decide | Pick what makes sense for reliability vs simplicity | |

**User's choice:** Yes — sync on startup  
**Notes:** Skip startup sync gracefully if no credentials stored.

---

## Claude's Discretion

- Error state styling in Settings if sync is failing
- Exact label/icon for the Settings nav tab
- How "Disconnect" clears credentials (wipe credentials_json + sync_token in DB)
- SessionMiddleware secret key env var name
- Loading state in Today during first sync

## Deferred Ideas

- Writing events back to Google Calendar — v2
- Multi-calendar support — primary only for v1
- Last-sync timestamp in Settings — deferred for cleanliness
- Pushover "Re-connect" action button — v2 backlog
