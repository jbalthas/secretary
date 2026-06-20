# Quick Task Summary: Include tomorrow's due tasks in the Google Home briefing

## Delivered

- The tomorrow briefing now includes incomplete tasks due tomorrow.
- Timed tasks are merged chronologically with approved blocks and calendar events.
- Tasks without a time are announced as tasks.
- Completed tasks are excluded.
- Tasks already represented by an approved scheduled block are not repeated.
- Mixed SQLite task timestamps and timezone-aware calendar timestamps sort safely.

## Verification

- `uv run pytest tests/test_brief.py -q` — 11 passed.
- `uv run pytest tests/test_tts.py -q` — 8 passed.

## Implementation Commit

`eddb8b2`

