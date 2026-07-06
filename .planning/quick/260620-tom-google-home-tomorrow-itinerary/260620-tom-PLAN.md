---
phase: quick-260620-tom
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/services/brief.py
  - backend/app/routers/webhooks.py
  - backend/tests/test_brief.py
  - backend/tests/test_tts.py
  - README.md
autonomous: true
requirements: [QUICK-tom]
must_haves:
  truths:
    - "A secret-guarded webhook can request tomorrow's itinerary"
    - "The spoken itinerary includes approved scheduled blocks and calendar commitments in time order"
    - "An empty itinerary produces a clear nothing-planned response"
    - "Asking for tomorrow's itinerary does not send a Pushover notification"
  artifacts:
    - path: "backend/app/services/brief.py"
      provides: "Tomorrow itinerary query, speech formatting, and Google Home cast"
    - path: "backend/app/routers/webhooks.py"
      provides: "range=tomorrow webhook dispatch"
  key_links:
    - from: "backend/app/routers/webhooks.py"
      to: "backend/app/services/brief.py"
      via: "send_tomorrow_brief"
      pattern: "range == \"tomorrow\""
---

<objective>
Let the user ask Google Home for tomorrow's plans and hear the next day's saved
itinerary and calendar commitments read aloud.
</objective>

<tasks>

<task type="auto">
  <name>Add tomorrow itinerary speech and webhook dispatch</name>
  <files>backend/app/services/brief.py, backend/app/routers/webhooks.py</files>
  <action>
    Query tomorrow's approved ScheduledBlock rows and calendar events, merge them
    chronologically, format natural speech with spoken times, and expose the flow
    through the existing secret-guarded brief webhook as range=tomorrow. Cast only
    to Google Home; do not send a Pushover notification for an on-demand question.
  </action>
  <verify>Focused backend brief and TTS/webhook tests pass.</verify>
  <done>Calling the webhook with range=tomorrow causes Google Home to read tomorrow's itinerary.</done>
</task>

<task type="auto">
  <name>Add regression coverage and setup documentation</name>
  <files>backend/tests/test_brief.py, backend/tests/test_tts.py, README.md</files>
  <action>
    Cover chronological speech, all-day items, empty days, TTS failure isolation,
    and webhook routing. Document the IFTTT webhook URL, header, and suggested
    Google Assistant phrase.
  </action>
  <verify>Backend test suite passes.</verify>
  <done>The behavior and required IFTTT setup are documented and protected by tests.</done>
</task>

</tasks>

<verification>
- Focused pytest coverage for brief and webhook behavior
- Full backend pytest suite
</verification>

<success_criteria>
- Google Home can announce tomorrow's saved itinerary on demand
- Items are spoken in chronological order with useful times
- Empty and failure cases are safe and understandable
</success_criteria>
