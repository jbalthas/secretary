---
status: partial
phase: 11-goal-guided-guidance
source: [11-VERIFICATION.md]
started: 2026-06-18T00:00:00Z
updated: 2026-06-18T00:00:00Z
---

## Current Test

Human checkpoint approved during plan 11-04 execution.

## Tests

### 1. Today page — FocusBanner visible with a pending task
expected: A banner reading 'Focus on' with the task title appears above the agenda, indigo left border
result: approved (human checkpoint during 11-04)

### 2. Today page — FocusBanner absent with no pending tasks
expected: No banner, no empty box
result: approved (human checkpoint during 11-04)

### 3. Settings Guidance — stall threshold saves and reloads
expected: Enter 14, Save, reload — field shows 14
result: approved (human checkpoint during 11-04)

### 4. Settings Guidance — out-of-range input rejected
expected: Red border + "Enter a number between 1 and 365." on 0 or 400
result: approved (human checkpoint during 11-04)

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
