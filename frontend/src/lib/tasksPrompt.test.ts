import { describe, it, expect } from "vitest";
import { TASKS_PROMPT, normalizeTasksInput, slugKey } from "./tasksPrompt";

describe("TASKS_PROMPT", () => {
  it("does not mention goals, routines, habits, external_key, or schema_version", () => {
    const lower = TASKS_PROMPT.toLowerCase();
    expect(lower).not.toContain("goal");
    expect(lower).not.toContain("routine");
    expect(lower).not.toContain("habit");
    expect(lower).not.toContain("external_key");
    expect(lower).not.toContain("schema_version");
  });
});

describe("slugKey", () => {
  it("is deterministic for the same input", () => {
    expect(slugKey("Buy milk")).toBe(slugKey("Buy milk"));
  });

  it("produces different keys for different titles", () => {
    expect(slugKey("Buy milk")).not.toBe(slugKey("Book dentist"));
  });

  it("stays within the 200-char external_key limit for long titles", () => {
    const long = "a".repeat(500);
    expect(slugKey(long).length).toBeLessThanOrEqual(200);
  });
});

describe("normalizeTasksInput", () => {
  it("accepts a bare JSON array of tasks", () => {
    const result = normalizeTasksInput('[{"title":"Buy milk"}]');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = result.payload as { schema_version: string; tasks: Array<{ external_key: string; title: string }> };
      expect(payload.schema_version).toBe("1.0");
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0].title).toBe("Buy milk");
      expect(typeof payload.tasks[0].external_key).toBe("string");
      expect(payload.tasks[0].external_key.length).toBeGreaterThan(0);
    }
  });

  it("accepts an object with a tasks array", () => {
    const result = normalizeTasksInput('{"tasks":[{"title":"Buy milk"}]}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = result.payload as { schema_version: string; tasks: Array<{ title: string }> };
      expect(payload.schema_version).toBe("1.0");
      expect(payload.tasks).toHaveLength(1);
      expect(payload.tasks[0].title).toBe("Buy milk");
    }
  });

  it("strips ```json fences", () => {
    const input = '```json\n[{"title":"Buy milk"}]\n```';
    const result = normalizeTasksInput(input);
    expect(result.ok).toBe(true);
  });

  it("strips bare ``` fences", () => {
    const input = '```\n[{"title":"Buy milk"}]\n```';
    const result = normalizeTasksInput(input);
    expect(result.ok).toBe(true);
  });

  it("tolerates leading/trailing whitespace and newlines", () => {
    const input = '\n\n   [{"title":"Buy milk"}]   \n\n';
    const result = normalizeTasksInput(input);
    expect(result.ok).toBe(true);
  });

  it("generates the same external_key for the same title across two calls", () => {
    const r1 = normalizeTasksInput('[{"title":"Buy milk"}]');
    const r2 = normalizeTasksInput('[{"title":"Buy milk"}]');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      const p1 = r1.payload as { tasks: Array<{ external_key: string }> };
      const p2 = r2.payload as { tasks: Array<{ external_key: string }> };
      expect(p1.tasks[0].external_key).toBe(p2.tasks[0].external_key);
    }
  });

  it("generates different external_keys for different titles", () => {
    const result = normalizeTasksInput('[{"title":"Buy milk"},{"title":"Book dentist"}]');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = result.payload as { tasks: Array<{ external_key: string }> };
      expect(payload.tasks[0].external_key).not.toBe(payload.tasks[1].external_key);
    }
  });

  it("preserves an explicit external_key supplied by the LLM verbatim", () => {
    const result = normalizeTasksInput('[{"title":"Buy milk","external_key":"custom-key-123"}]');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = result.payload as { tasks: Array<{ external_key: string }> };
      expect(payload.tasks[0].external_key).toBe("custom-key-123");
    }
  });

  it("passes through allowlisted optional fields unchanged", () => {
    const input = JSON.stringify([
      {
        title: "Buy milk",
        priority: "high",
        due_date: "2026-07-22T09:00:00Z",
        description: "2%",
        estimated_minutes: 15,
        list_name: "Errands",
        parent_list_name: "Home",
        goal_key: "some-goal",
      },
    ]);
    const result = normalizeTasksInput(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = result.payload as { tasks: Array<Record<string, unknown>> };
      const task = payload.tasks[0];
      expect(task.priority).toBe("high");
      expect(task.due_date).toBe("2026-07-22T09:00:00Z");
      expect(task.description).toBe("2%");
      expect(task.estimated_minutes).toBe(15);
      expect(task.list_name).toBe("Errands");
      expect(task.parent_list_name).toBe("Home");
      expect(task.goal_key).toBe("some-goal");
    }
  });

  it("drops unknown keys", () => {
    const result = normalizeTasksInput('[{"title":"Buy milk","foo":"bar","nested":{"x":1}}]');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = result.payload as { tasks: Array<Record<string, unknown>> };
      expect(payload.tasks[0].foo).toBeUndefined();
      expect(payload.tasks[0].nested).toBeUndefined();
    }
  });

  it("returns a friendly error for invalid JSON", () => {
    const result = normalizeTasksInput("not json at all");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JSON/i);
    }
  });

  it("returns a friendly error for a bare JSON string", () => {
    const result = normalizeTasksInput('"just a string"');
    expect(result.ok).toBe(false);
  });

  it("returns a friendly error for a bare JSON number", () => {
    const result = normalizeTasksInput("42");
    expect(result.ok).toBe(false);
  });

  it("returns a friendly error for an object with no tasks key", () => {
    const result = normalizeTasksInput('{"goals":[]}');
    expect(result.ok).toBe(false);
  });

  it("returns a friendly error for an empty task list", () => {
    const result = normalizeTasksInput("[]");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no tasks/i);
    }
  });

  it("returns a friendly error when a task item is not an object", () => {
    const result = normalizeTasksInput('["Buy milk"]');
    expect(result.ok).toBe(false);
  });

  it("returns a friendly error when a task item has a missing title", () => {
    const result = normalizeTasksInput('[{"priority":"high"}]');
    expect(result.ok).toBe(false);
  });

  it("returns a friendly error when a task item has a blank title", () => {
    const result = normalizeTasksInput('[{"title":"   "}]');
    expect(result.ok).toBe(false);
  });

  it("never throws for any string input", () => {
    const inputs = ["", "{", "[", "null", "undefined", "{}", "[1,2,3]", "```", "🎉", "{\"tasks\":null}"];
    for (const input of inputs) {
      expect(() => normalizeTasksInput(input)).not.toThrow();
    }
  });
});
