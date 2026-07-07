---
phase: quick-260707-upload-photo-size-errors
plan: 01
status: complete
completed: 2026-07-07
---

# Upload photo size and error handling

Raised nginx's HTTPS request-body limit to 20 MB so normal phone photos reach the backend. The group-photo hook now checks upload responses, captures HTTP and network failures, and exposes the message to the task-group UI as an accessible alert.

## Files changed

- `deploy/nginx-secretary.conf`
- `frontend/src/hooks/useGroupPhotos.ts`
- `frontend/src/hooks/useGroupPhotos.test.ts`
- `frontend/src/components/GroupTileGrid.tsx`

## Verification

- `npm test -- --run src/hooks/useGroupPhotos.test.ts` — 1 test passed
- `npm run build` — TypeScript and Vite production build passed
