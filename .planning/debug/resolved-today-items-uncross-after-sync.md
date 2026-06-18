# Debug Session: Today items uncross after sync

Status: Resolved

## Symptoms

- Expected: Marking an item complete in Today remains complete.
- Actual: Some completed items become incomplete again after a few minutes.
- Errors: None reported.
- Reproduction: Complete a calendar-backed item in Today and wait for background sync.
- Timeline: Reported 2026-06-18.

## Root Cause

Outlook ICS synchronization runs every five minutes. `_replace_sync()` deleted every
`outlook:%` calendar row before recreating the current feed contents. The `done`
field is local-only and is not present in ICS data, so recreated rows received the
column default (`False`).

Google Calendar incremental sync does not have this problem because its upsert
updates feed-owned fields without replacing `done`.

## Fix

Change Outlook replacement sync to:

1. Parse the current feed and collect its stable event IDs.
2. Delete only Outlook rows no longer present in the feed.
3. Upsert current rows, preserving local-only fields such as `done`.

## Verification

- Add a regression test that syncs an Outlook event, marks it done, syncs the same
  feed again, and asserts `done` remains true.
- An isolated in-memory SQLite verification passed for both preserving `done` and
  deleting Outlook events removed from the feed.
- The repository pytest fixture could not run in this environment because its
  shared `test_secretary.db` failed table creation with a SQLite disk I/O error.
