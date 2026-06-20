# Debug Session: Plan task completion resets on refresh

Status: Resolved

## Symptoms

- Expected: Crossing out a planned task remains saved after a page refresh.
- Actual: The row crosses out optimistically, then returns to incomplete after refresh.
- Reported: 2026-06-20.

## Root Cause

Scheduled plan blocks have no persisted completion field. The Today UI can only
derive completion from a currently linked task, and its optimistic checkbox state
can therefore outlive the server state until the page reloads.

## Fix Plan

1. Persist completion on `scheduled_blocks`.
2. Add a plan-block completion endpoint that also updates a linked task.
3. Route planned-item toggles through that endpoint and surface failed saves.
4. Add backend and frontend regression coverage.


## Verification

- Frontend production build passed.
- New agenda regression for persisted plan-block completion passed.
- In-memory backend integration check confirmed both the block and linked task remain completed after a fresh database read.
- Browser flow passed: Today -> check planned task -> reload -> checkbox remained checked and crossed out.
- Browser console had no warnings or errors.
- Two pre-existing agenda timezone assertions still fail under America/Chicago; neither touches plan completion.
- The repository pytest database remains locked with a SQLite disk I/O error, so backend verification used an isolated in-memory SQLite database.
