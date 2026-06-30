---
phase: quick-260630-today-responsive-weather
status: complete
started: 2026-06-30
---

# Responsive Today weather redesign

## Goal

Remove horizontal overflow on laptop and iPhone layouts, restore Today as the app's flagship screen, and replace basic decorative graphics with a polished, image-led weather experience.

## Scope

- Make the shared app shell and navigation responsive without horizontal scrolling.
- Recompose Today around an atmospheric weather/focus hero while preserving live task, calendar, plan, and update behavior.
- Add a project-owned generated weather image asset.
- Verify desktop and iPhone layouts in the browser, including overflow checks and production build/tests.

## Acceptance

- No document-level horizontal scrollbar at laptop or iPhone widths.
- Desktop uses a compact side rail; mobile uses a safe-area-aware bottom navigation.
- Today includes real weather imagery, readable weather context, focus, momentum, quick update, today's timeline, and later-week content.
- Existing completion and update interactions remain wired to their current hooks.
