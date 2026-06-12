# Features Research

**Project:** My Secretary (Raspberry Pi 5 self-hosted)
**Researched:** 2026-06-12
**Confidence:** MEDIUM — core task/calendar features HIGH; voice integration specifics MEDIUM

---

## Table Stakes

Features users expect as baseline. Missing = product feels broken or pointless.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create / edit / complete tasks | Core loop — without this, nothing else matters | Low | CRUD via web UI and API |
| View today's agenda | First thing users open daily | Low | Tasks + events merged in one view |
| Google Calendar read sync | Events must appear in dashboard or daily brief | Medium | OAuth flow + polling/webhook |
| Pushover reminders fire reliably | If reminders miss, trust in the system collapses | Low | APScheduler + Pushover API |
| Persist across Pi reboots | systemd service restarts automatically | Low | systemd unit with `Restart=always` |
| Responsive web UI accessible on phone | Used from couch, not just desktop | Low | React + mobile-friendly layout |
| Remote access works without being home | Core promise of Tailscale | Low | Tailscale already handles this |
| Voice "add task" works end-to-end | If one interaction mode is broken, daily friction kills adoption | Medium | IFTTT → webhook → API |
| Daily brief delivered proactively | Users shouldn't have to ask — system pushes the brief | Medium | APScheduler morning job → TTS or Pushover |
| Recurring routines don't drift | Cron-style, not "approximately daily" | Low | APScheduler cron trigger, not interval |

---

## Differentiators

Features that make this better than generic alternatives (Google Assistant, Notion, Todoist).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fully offline-capable | Works during internet outage for local tasks/events | Low | SQLite local, Tailscale still works on LAN |
| No subscription / no vendor lock-in | Zero ongoing cost after hardware | Low | Core reason to self-host |
| Custom daily brief content | Tailor exactly what's in the morning summary — not Google's canned format | Medium | Configurable brief template: tasks, events, weather hook |
| Bidirectional Google Home voice | Hear reminders spoken aloud on Home speakers — not just phone notifications | High | Chromecast TTS is the hard part |
| Pi → Google Home TTS announcements | Proactive audio push to speaker when reminder fires | High | Differentiates from phone-only notification systems |
| Routine-aware scheduling | "On weekdays at 7am" routines that respect exceptions (holidays, manual skip) | Medium | APScheduler + skip flag on task/routine |
| Single-owner simplicity | No team features, no sharing UI, no permission model — all complexity eliminated | Low | Actively scope-reducing |
| Tailscale-only exposure | No attack surface from public internet | Low | Security differentiator vs. ngrok/port-forward setups |

---

## Anti-Features (Deliberately Out of Scope)

Things to explicitly not build. Scope creep from these will delay shipping with no personal benefit.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multi-user accounts / auth | Solo use — every auth layer adds ops overhead with no benefit | Single hardcoded user, no login screen |
| Native mobile app | Web UI on phone covers the use case | React responsive web |
| AI-generated task suggestions | Complexity + latency + cost with unclear personal value | Plain task CRUD — add later if wanted |
| Email integration / inbox management | Scope creep; different problem domain entirely | Stay in calendar + tasks |
| Habit tracking with streaks/gamification | Not the stated goal; feature bloat | Use a dedicated habit app if needed |
| Custom notification channels beyond Pushover | SMTP, Slack, Matrix etc. — no benefit for solo use | Pushover only |
| Plugin / extension system | Over-engineering for one user | Hardcode integrations |
| Full calendar editor (create/edit events in UI) | Google Calendar web is already good at this; sync read-only first | Read sync only in v1; write sync is a v2 consideration |
| Natural language task parsing ("remind me in 3 days") | NLP complexity; not core to the system working | Explicit datetime fields in UI |
| Public sharing / iCal export | Not needed for personal solo use | n/a |
| Offline voice recognition | Whisper on Pi 5 is feasible but adds setup burden and latency | IFTTT handles voice input |

---

## Integration-Specific Features

### Google Calendar

| Feature | Include? | Notes |
|---------|----------|-------|
| OAuth 2.0 token flow | YES — required | Use `google-auth-oauthlib`; store refresh token in SQLite |
| Read events (list/get) | YES — table stakes | Poll every 5–15 min; webhook push requires public endpoint (skip in v1) |
| Write events from UI | NO in v1 | Read sync first; event creation is v2 scope |
| Bidirectional task ↔ event sync | NO | Overcomplication; tasks and events stay separate |
| Multi-calendar support | YES, light | Read from primary + any calendars user selects during setup |
| Handle token expiry + refresh | YES — must | Silent background refresh; broken token = broken daily brief |

### Pushover

| Feature | Include? | Notes |
|---------|----------|-------|
| Task/event reminders | YES — core | Fire N minutes before due time via APScheduler |
| Daily brief notification | YES | Morning Pushover with agenda summary as fallback if TTS fails |
| Priority levels | YES, light | High priority for time-sensitive events; normal for tasks |
| Notification sound customization | NO | Default sound is fine; not worth parameterizing |
| Pushover API error handling | YES — critical | If Pushover is down, log and retry; don't crash the scheduler |
| Action buttons (complete task from notification) | MAYBE v2 | Pushover supports URL callbacks; could mark task complete from phone |

### Google Home / Chromecast TTS

| Feature | Include? | Notes |
|---------|----------|-------|
| IFTTT webhook → Pi API ("add task" voice command) | YES — core | Simplest Google Home → Pi path; no Google SDK needed |
| Pi → Google Home TTS for reminders | YES — differentiator | Use `pychromecast` + gTTS or equivalent; fire when reminder triggers |
| Daily brief spoken on Home speaker | YES | Trigger from morning APScheduler job |
| Voice query ("what's on my schedule?") | NO in v1 | IFTTT can only trigger pre-set phrases → pre-set responses; real Q&A needs Dialogflow |
| Google Home SDK / Smart Home trait | NO | Massive OAuth/certification overhead; IFTTT covers the use case |
| Multiple Home device routing | NO | Hardcode target speaker by IP/device name |

### Tailscale

| Feature | Include? | Notes |
|---------|----------|-------|
| MagicDNS hostname for Pi | YES — usability | Access via `secretary.tailnet.ts.net` not IP |
| HTTPS via Tailscale cert | YES | `tailscale cert` issues TLS cert for MagicDNS hostname; nginx uses it |
| Auth key for headless setup | YES | Non-interactive `tailscale up --authkey=...` during provisioning |
| Exit node / subnet routing | NO | Not needed for this project |

---

## Feature Dependencies

```
Google Calendar OAuth → Calendar sync → Daily brief events
APScheduler jobs → Pushover reminders
APScheduler jobs → Chromecast TTS announcements
IFTTT webhook → FastAPI endpoint → Task creation
Tailscale + nginx + TLS → Remote web UI access
Task CRUD → Recurring routines → APScheduler jobs
```

---

## MVP Recommendation

Build in this order — each layer validates before the next is built:

1. Task CRUD + SQLite schema (foundation everything else reads from)
2. APScheduler + Pushover reminders (proves the proactive notification loop)
3. React dashboard with today view (proves the UI is usable daily)
4. Google Calendar read sync (proves external data flows in)
5. Daily brief job (combines tasks + events into one morning push)
6. IFTTT → voice task creation (proves the voice input path)
7. Chromecast TTS announcements (proves the voice output path — highest integration risk, do last)

**Defer to v2:**
- Google Calendar event write
- Pushover action buttons (complete from notification)
- Voice queries beyond pre-set commands
