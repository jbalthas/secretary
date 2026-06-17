// Documented LLM prompt for producing a My Secretary ingest payload.
// Paste INGEST_PROMPT into any LLM (ChatGPT, Claude, etc.) along with your
// raw notes/goals, then paste the JSON it returns into the Import Data page.
// The live JSON schema is served at INGEST_SCHEMA_URL.

export const INGEST_SCHEMA_URL = "/api/v1/ingest/schema";

export const INGEST_PROMPT = `You convert a person's plans into a single JSON document for the "My Secretary" app. Output ONLY the JSON — no prose, no markdown fences.

The top-level object MUST be exactly:
{
  "schema_version": "1.0",
  "goals": [],
  "tasks": [],
  "routines": [],
  "habits": []
}
Rules:
- "schema_version" MUST be the literal string "1.0".
- No extra/unknown fields are allowed anywhere (they will be rejected).
- All four arrays must be present (use [] when empty).
- Every entity has an "external_key": a stable, lowercase slug you invent and keep consistent (e.g. "learn-guitar-2026"). Re-using the same external_key on a later import updates the existing record instead of creating a duplicate.
- Tasks, routines, and habits may belong to a goal via "goal_key", which MUST match that goal's "external_key".

goals[] — each item:
  external_key: string (required, stable slug)
  title: string (required)
  type: one of "career" | "life" | "health" | "learning" | "financial" (required)
  description: string (optional)
  target_date: "YYYY-MM-DD" (optional)
  milestones: optional array of { title: string, target_date?: "YYYY-MM-DD", done?: boolean }

tasks[] — each item:
  external_key: string (required, stable slug)
  goal_key: string (optional — must match a goal's external_key)
  title: string (required)
  priority: one of "high" | "medium" | "low" (default "medium")
  due_date: ISO 8601 datetime, e.g. "2026-07-01T09:00:00Z" (optional)
  description: string (optional)

routines[] — each item (a recurring automated action):
  external_key: string (required, stable slug)
  goal_key: string (optional — must match a goal's external_key)
  name: string (required, max 80 chars)
  cron: 5-field cron expression, e.g. "0 8 * * *" (required)
  action: "send_daily_brief" (only supported value)

habits[] — each item (a recurring personal habit):
  external_key: string (required, stable slug)
  goal_key: string (optional — must match a goal's external_key)
  title: string (required)
  recurrence_cron: 5-field cron expression, e.g. "0 7 * * *" (required)
  priority: one of "high" | "medium" | "low" (optional, default "medium")
  description: string (optional)

cron format is the standard 5 fields: minute hour day-of-month month day-of-week (e.g. "0 8 * * *" = every day at 08:00).

The authoritative JSON schema is available from the app at GET /api/v1/ingest/schema.`;
