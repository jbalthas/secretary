---
phase: quick-260707-upload-photo-size-errors
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - deploy/nginx-secretary.conf
  - frontend/src/hooks/useGroupPhotos.ts
  - frontend/src/components/GroupTileGrid.tsx
autonomous: true
requirements: [QUICK-260707-upload-photo-size-errors]
---

<objective>
Allow ordinary phone photos through the deployed nginx proxy and make upload failures visible in the Tasks UI.
</objective>

<tasks>

<task type="auto">
  <name>Raise the nginx request-body limit</name>
  <files>deploy/nginx-secretary.conf</files>
  <action>Set client_max_body_size to 20M in the HTTPS server so camera photos can reach FastAPI.</action>
  <verify>Confirm the rendered nginx configuration contains client_max_body_size 20M.</verify>
</task>

<task type="auto">
  <name>Surface group-photo upload failures</name>
  <files>frontend/src/hooks/useGroupPhotos.ts, frontend/src/components/GroupTileGrid.tsx</files>
  <action>Reject non-2xx upload responses with a useful message and show that message next to the photo grid through an accessible alert.</action>
  <verify>Run the frontend build and targeted tests.</verify>
</task>

</tasks>

<success_criteria>
- Photos up to 20 MB pass through nginx.
- A rejected upload produces a visible, accessible error instead of silently refreshing.
- Frontend type-check and production build succeed.
</success_criteria>
