# Quick Task 260630-n6z Summary

Implemented configurable weather location and date-stable daily Today backgrounds.

## Delivered

- Browser geolocation with clear permission/error fallback.
- Manual city or postal-code search through Open-Meteo geocoding.
- Persisted location name and coordinates in local storage.
- Forecast requests using selected coordinates and automatic timezone resolution.
- Four bundled hero images selected deterministically by local calendar date.
- Accessible location dialog with responsive styling.
- Unit coverage for persistence, labels, and daily rotation.

## Verification

- `npm.cmd test -- --run src/lib/weather.test.ts`: 3 passed.
- `npm.cmd run build`: passed.
- In-app browser: desktop Today render, live forecast, dialog open/close, image crop, and no horizontal overflow verified.
- Full suite: 56 passed, 2 unrelated timezone-sensitive agenda tests failed before this task's scope.
