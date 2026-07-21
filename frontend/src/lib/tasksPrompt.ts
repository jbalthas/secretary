// Short LLM prompt for the tasks-only "quick add" flow at /ingest/tasks.
// Deliberately the anti-INGEST_PROMPT: no goals/routines/habits/external_key/
// schema_version — the app supplies all of that itself.

export const TASKS_PROMPT = `Output a bare JSON array of task objects — no prose, no markdown fences.

Each task object may have:
  title: string (required)
  priority: one of "high" | "medium" | "low" (optional, default "medium")
  due_date: ISO 8601 datetime, e.g. "2026-07-22T09:00:00Z" (optional)
  description: string (optional)
  estimated_minutes: integer number of minutes (optional)

Example:
[
  {"title": "Buy milk", "priority": "high"},
  {"title": "Book dentist", "due_date": "2026-07-25T09:00:00Z", "estimated_minutes": 30}
]`;

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Force unsigned 32-bit, base36.
  return (hash >>> 0).toString(36);
}

export function slugKey(title: string): string {
  const trimmed = title.trim();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = djb2(trimmed);
  return `qa-${slug || "task"}-${suffix}`;
}

const ALLOWED_TASK_FIELDS = [
  "goal_key",
  "title",
  "priority",
  "due_date",
  "description",
  "list_name",
  "parent_list_name",
  "estimated_minutes",
] as const;

type NormalizeResult = { ok: true; payload: unknown } | { ok: false; error: string };

function stripFences(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) {
    text = fenceMatch[1];
  }
  return text.trim();
}

export function normalizeTasksInput(raw: string): NormalizeResult {
  const stripped = stripFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { ok: false, error: "Couldn't read that as JSON — paste just the JSON output from the LLM." };
  }

  let rawTasks: unknown;
  if (Array.isArray(parsed)) {
    rawTasks = parsed;
  } else if (parsed && typeof parsed === "object" && "tasks" in parsed) {
    rawTasks = (parsed as { tasks: unknown }).tasks;
  } else {
    return { ok: false, error: "Couldn't find a task list in that paste — expected a JSON array or an object with a \"tasks\" array." };
  }

  if (!Array.isArray(rawTasks)) {
    return { ok: false, error: "Couldn't find a task list in that paste — expected a JSON array or an object with a \"tasks\" array." };
  }

  const tasks: Record<string, unknown>[] = [];
  for (const item of rawTasks) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "Each task must be a JSON object with at least a \"title\"." };
    }
    const record = item as Record<string, unknown>;
    const title = record.title;
    if (typeof title !== "string" || title.trim().length === 0) {
      return { ok: false, error: "Each task must be a JSON object with at least a \"title\"." };
    }

    const task: Record<string, unknown> = {};
    for (const field of ALLOWED_TASK_FIELDS) {
      const value = record[field];
      if (value !== undefined && value !== null) {
        task[field] = value;
      }
    }
    task.title = title;

    const externalKey = record.external_key;
    task.external_key = typeof externalKey === "string" && externalKey.trim().length > 0
      ? externalKey
      : slugKey(title);

    tasks.push(task);
  }

  if (tasks.length === 0) {
    return { ok: false, error: "No tasks found in that paste." };
  }

  return { ok: true, payload: { schema_version: "1.0", tasks } };
}
