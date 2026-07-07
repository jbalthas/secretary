---
phase: quick-260707-contain-group-tile-photos
plan: 01
type: execute
files_modified:
  - frontend/src/styles.css
autonomous: true
---

<objective>
Show each uploaded group image in full instead of zooming and cropping it to fill the square tile.
</objective>

<task type="auto">
  <name>Contain group tile images</name>
  <action>Change group tile images from cover to contain, center them, and retain a neutral tile background around unmatched aspect ratios.</action>
  <verify>Run the frontend production build and inspect the rendered Tasks grid.</verify>
</task>

<success_criteria>
- The entire uploaded image is visible within its tile.
- Images retain their original aspect ratio.
- Letterboxed space uses the existing tile surface color.
</success_criteria>
