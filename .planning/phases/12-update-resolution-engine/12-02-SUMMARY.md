---
phase: 12-update-resolution-engine
plan: "02"
subsystem: api
tags: [rapidfuzz, fuzzy-matching, update-resolution, fastapi]

requires:
  - phase: 12-01
    provides: "Wave 0 TDD stubs, resolution_service constants + verb sets, updates.py stub router, schemas/update.py"

provides:
  - "resolve_update() pure function with WRatio fuzzy matching and intent/stop-word stripping"
  - "_parse_intent() parses drop/reschedule/done from text tokens"
  - "POST /api/v1/updates/resolve endpoint loading today's blocks + pending tasks"

affects: [12-03, 12-04, 13-update-loop-ui]

tech-stack:
  added: []
  patterns:
    - "Strip intent/stop words from query before fuzzy matching to isolate entity tokens"
    - "Multiple confident matches (>= 2 above threshold) return ambiguous, not resolved"
    - "Pure sync resolver called directly from async route (no threadpool needed — no I/O)"

key-files:
  created: []
  modified:
    - backend/app/services/resolution_service.py
    - backend/app/routers/updates.py

key-decisions:
  - "[12-02] Strip intent/stop words from query before rapidfuzz matching — WRatio on full text dilutes score with 'done', 'with', etc. so entity tokens must be isolated first"
  - "[12-02] Tie-break rule: if multiple candidates score >= CONFIDENT_THRESHOLD, return ambiguous not resolved — prevents wrong pick when names are identical except for a suffix"

patterns-established:
  - "Pattern: _entity_query() strips _INTENT_WORDS + _STOP_WORDS before fuzzy matching"
  - "Pattern: confident_count check prevents false-positive single resolution on near-duplicate titles"

requirements-completed: [UPDATE-02, UPDATE-03]

duration: 12min
completed: 2026-06-22
---

# Phase 12 Plan 02: Update Resolution Engine Summary

**No-LLM fuzzy resolver using rapidfuzz WRatio with intent-word stripping, returning resolved/ambiguous/no_match; exposed via POST /api/v1/updates/resolve**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-22T16:23:00Z
- **Completed:** 2026-06-22T16:27:58Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Implemented `resolve_update()` pure function using rapidfuzz WRatio with intent/stop-word stripping to produce correct scores (90+ for clear match, ambiguous for near-ties, no_match for unrelated input)
- Implemented `_parse_intent()` checking token overlap against `_DROP_VERBS` / `_RESCHEDULE` verb sets
- Wired POST `/api/v1/updates/resolve` that loads today's ScheduledBlocks + pending Tasks then calls the pure resolver
- All 4 Wave 0 resolution tests green (test_resolve_clear_match, test_no_http_call, test_resolve_ambiguous, test_resolve_no_match)

## Task Commits

1. **Task 1: Implement resolve_update + _parse_intent** - `a86debf` (feat)
2. **Task 2: Implement POST /api/v1/updates/resolve endpoint** - `421a7e1` (feat)

## Files Created/Modified

- `backend/app/services/resolution_service.py` - Full resolve_update + _parse_intent implementation with rapidfuzz WRatio and stop-word stripping
- `backend/app/routers/updates.py` - POST /resolve endpoint loading DB entities and calling resolver

## Decisions Made

- **Intent-word stripping before matching:** The plan specified `process.extract(text, ...)` with WRatio directly, but "done with standup prep" vs "Morning standup prep" scored only 76 (ambiguous zone). Stripping intent verbs + stop words first yields "standup prep" → 90 (resolved). This is a necessary correction to make the behavior match the spec (clear match returns resolved).
- **Tie-break rule for ambiguous:** "Team sync A" and "Team sync B" both score 95 against "team sync". Without a tie-break, the first alphabetically would win despite equal confidence. If `confident_count >= 2`, return ambiguous to surface the choice to the user.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Add `_entity_query()` stop-word stripping before WRatio matching**
- **Found during:** Task 1 (test_resolve_clear_match failing with `ambiguous` instead of `resolved`)
- **Issue:** WRatio("done with standup prep", "Morning standup prep") = 76, below CONFIDENT_THRESHOLD=80. Intent words dilute the match score.
- **Fix:** Added `_entity_query()` helper that strips `_INTENT_WORDS | _STOP_WORDS` from the query text before passing to `process.extract`. Query becomes "standup prep" → score 90 → resolved.
- **Files modified:** backend/app/services/resolution_service.py
- **Verification:** test_resolve_clear_match passes
- **Committed in:** a86debf (Task 1 commit)

**2. [Rule 1 - Bug] Tie-break: multiple confident matches → ambiguous**
- **Found during:** Task 1 (test_resolve_ambiguous failing with `resolved` instead of `ambiguous`)
- **Issue:** "team sync" scores 95 against both "Team sync A" and "Team sync B". The plan code just picks `matches[0]` which arbitrarily resolves instead of surfacing the ambiguity.
- **Fix:** Count `confident_count = sum(1 for m in matches if m[1] >= CONFIDENT_THRESHOLD)`. Only resolve when `confident_count == 1`.
- **Files modified:** backend/app/services/resolution_service.py
- **Verification:** test_resolve_ambiguous passes
- **Committed in:** a86debf (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes are necessary for correctness. The plan's pseudocode described the right threshold logic but did not account for the WRatio score dilution or tie-break case. No scope creep.

## Issues Encountered

Pre-existing failure in `tests/test_calendar.py::test_callback_stores_credentials` (404 response) confirmed present before any changes in this plan. Excluded from regression count — out of scope per deviation boundary rule.

## Next Phase Readiness

- UPDATE-02 and UPDATE-03 satisfied at the backend level
- POST /api/v1/updates/resolve is live and registered in main.py (wired in 12-01)
- Wave 0 resolution tests green; full suite (excluding pre-existing calendar failure) 147 passed
- Phase 12-03 (check-in scheduler) and 12-04 (ingest extension) can proceed independently

---
*Phase: 12-update-resolution-engine*
*Completed: 2026-06-22*
