import { describe, expect, it } from "vitest";
import { resolveCategory, categoryVisual } from "./taskCategory";
import type { Goal } from "../types/goal";
import type { Task } from "../types/task";

const goal = {
  id: 7,
  list_name: "Side Projects",
} as unknown as Goal;

const baseTask = {
  id: 1,
  title: "Some task",
  priority: "medium",
  list_name: null,
  goal_id: null,
  completed: false,
} as unknown as Task;

describe("resolveCategory", () => {
  it("prefers list_name over goal over priority fallback", () => {
    expect(
      resolveCategory({ ...baseTask, list_name: "Work", goal_id: goal.id }, [goal])
    ).toBe("work");

expect(
      resolveCategory({ ...baseTask, list_name: null, goal_id: goal.id }, [goal])
    ).toBe("side projects");

    expect(
      resolveCategory({ ...baseTask, list_name: null, goal_id: null }, [goal])
    ).toBe("priority:medium");
  });

  it("falls back to priority:high when task has no list/goal", () => {
    expect(
      resolveCategory({ ...baseTask, priority: "high", list_name: null, goal_id: null }, [])
    ).toBe("priority:high");
  });

  it("is case-insensitive", () => {
    const upper = resolveCategory({ ...baseTask, list_name: "Work" }, []);
    const lower = resolveCategory({ ...baseTask, list_name: "work" }, []);
    expect(upper).toBe(lower);
  });
});

describe("categoryVisual", () => {
  it("returns the same gradient+Icon for aliases (work / career)", () => {
    const work = categoryVisual("work");
    const career = categoryVisual("career");
    expect(work.gradient).toBe(career.gradient);
    expect(work.Icon).toBe(career.Icon);
  });

  it("is deterministic for an unknown category across calls", () => {
    const first = categoryVisual("some totally unknown list name");
    const second = categoryVisual("some totally unknown list name");
    expect(first.gradient).toBe(second.gradient);
    expect(first.Icon).toBe(second.Icon);
  });

  it("labels priority:high as 'High priority'", () => {
    expect(categoryVisual("priority:high").label).toBe("High priority");
  });
});
