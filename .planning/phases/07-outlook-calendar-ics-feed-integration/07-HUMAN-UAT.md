---
status: partial
phase: 07-outlook-calendar-ics-feed-integration
source: [07-VERIFICATION.md]
started: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live feed populates Today view
expected: With `OUTLOOK_ICS_URL` set on the Pi, after one 5-minute sync tick the University class events appear in the Today view at correct America/Chicago local times, merged seamlessly with Google Calendar events (no visual distinction).
result: [pending]

### 2. Class events appear in daily brief + TTS
expected: Triggering a daily brief on a day with a known class shows the class event in the brief body (Pushover) and in the spoken TTS readout, alongside other events.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
