import { describe, it, expect } from "vitest";
import { deriveRollup } from "./rollup";
import type { Task } from "../types/task";
import type { ScheduledBlock } from "../types/plan";

const TODAY_KEY = "2026-06-23";
const TODAY_DT = "2026-06-23T00:00:00";
const OTHER_DT = "2026-06-20T00:00:00";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 1,
    title: "Task",
    priority: "medium",
    completed: false,
    created_at: TODAY_DT,
    updated_at: TODAY_DT,
    ...overrides,
  };
}

function makeBlock(overrides: Partial<ScheduledBlock>): ScheduledBlock {
  return {
    id: 1,
    task_id: null,
    title: "Block",
    start_dt: `${TODAY_KEY}T10:00:00Z`,
    end_dt: `${TODAY_KEY}T10:30:00Z`,
    date_key: TODAY_KEY,
    approved_at: `${TODAY_KEY}T08:00:00Z`,
    completed: false,
    conflict_with: null,
    ...overrides,
  };
}

describe("deriveRollup", () => {
  it("buckets a completed today-task into the completed bucket", () => {
    const task = makeTask({ id: 1, title: "Done task", due_date: TODAY_DT, completed: true });
    const result = deriveRollup([task], [], TODAY_KEY);
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].title).toBe("Done task");
    expect(result.slipped).toHaveLength(0);
  });

  it("buckets an incomplete today-task into the slipped bucket", () => {
    const task = makeTask({ id: 2, title: "Slipped task", due_date: TODAY_DT, completed: false });
    const result = deriveRollup([task], [], TODAY_KEY);
    expect(result.slipped).toHaveLength(1);
    expect(result.slipped[0].title).toBe("Slipped task");
    expect(result.completed).toHaveLength(0);
  });

  it("excludes tasks with due_date not matching today", () => {
    const task = makeTask({ id: 3, title: "Old task", due_date: OTHER_DT, completed: true });
    const result = deriveRollup([task], [], TODAY_KEY);
    expect(result.completed).toHaveLength(0);
    expect(result.slipped).toHaveLength(0);
  });

  it("excludes tasks with no due_date", () => {
    const task = makeTask({ id: 4, title: "No date task", due_date: undefined, completed: false });
    const result = deriveRollup([task], [], TODAY_KEY);
    expect(result.completed).toHaveLength(0);
    expect(result.slipped).toHaveLength(0);
  });

  it("buckets a completed today-block into the completed bucket", () => {
    const block = makeBlock({ id: 10, title: "Done block", date_key: TODAY_KEY, completed: true });
    const result = deriveRollup([], [block], TODAY_KEY);
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].title).toBe("Done block");
    expect(result.slipped).toHaveLength(0);
  });

  it("buckets an incomplete today-block into the slipped bucket", () => {
    const block = makeBlock({ id: 11, title: "Slipped block", date_key: TODAY_KEY, completed: false });
    const result = deriveRollup([], [block], TODAY_KEY);
    expect(result.slipped).toHaveLength(1);
    expect(result.slipped[0].title).toBe("Slipped block");
    expect(result.completed).toHaveLength(0);
  });

  it("returns correct completedCount and slippedCount", () => {
    const t1 = makeTask({ id: 1, title: "Done", due_date: TODAY_DT, completed: true });
    const t2 = makeTask({ id: 2, title: "Slip1", due_date: TODAY_DT, completed: false });
    const t3 = makeTask({ id: 3, title: "Slip2", due_date: TODAY_DT, completed: false });
    const result = deriveRollup([t1, t2, t3], [], TODAY_KEY);
    expect(result.completedCount).toBe(1);
    expect(result.slippedCount).toBe(2);
  });

  it("each rollup item carries { title, completed } fields", () => {
    const task = makeTask({ id: 5, title: "Check fields", due_date: TODAY_DT, completed: true });
    const result = deriveRollup([task], [], TODAY_KEY);
    const item = result.completed[0];
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("completed");
    expect(item.completed).toBe(true);
  });
});
