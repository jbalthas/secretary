import { describe, expect, it } from "vitest";
import { appendCurrentTasksToPlan } from "./organizePlan";
import type { ProposedBlock } from "../types/plan";
import type { Task } from "../types/task";

const NOW = new Date("2026-06-18T14:07:00Z");

function task(overrides: Partial<Task>): Task {
  return {
    id: 1,
    title: "Task",
    priority: "medium",
    completed: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function block(overrides: Partial<ProposedBlock> = {}): ProposedBlock {
  return {
    task_id: 1,
    title: "Existing",
    start_dt: "2026-06-18T14:00:00Z",
    end_dt: "2026-06-18T14:30:00Z",
    ...overrides,
  };
}

describe("appendCurrentTasksToPlan", () => {
  it("keeps the saved plan and appends newly available tasks", () => {
    const result = appendCurrentTasksToPlan(
      [block()],
      [
        task({ id: 1, title: "Existing" }),
        task({ id: 2, title: "Added later", priority: "high", estimated_minutes: 45 }),
      ],
      "09:00",
      NOW,
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      task_id: 2,
      title: "Added later",
      start_dt: "2026-06-18T14:30:00.000Z",
      end_dt: "2026-06-18T15:15:00.000Z",
    });
  });

  it("does not duplicate scheduled tasks or append completed tasks", () => {
    const existing = [block()];
    const result = appendCurrentTasksToPlan(
      existing,
      [
        task({ id: 1, title: "Existing" }),
        task({ id: 2, title: "Done", completed: true }),
      ],
      "09:00",
      NOW,
    );

    expect(result).toBe(existing);
  });

  it("starts an empty plan at the next quarter hour when the workday has begun", () => {
    const result = appendCurrentTasksToPlan(
      [],
      [task({ id: 3, title: "Fresh task" })],
      "09:00",
      NOW,
    );

    expect(result[0].start_dt).toBe("2026-06-18T14:15:00.000Z");
  });

  it("only appends tasks created after an existing plan was approved", () => {
    const result = appendCurrentTasksToPlan(
      [block()],
      [
        task({ id: 2, title: "Older unscheduled task", created_at: "2026-06-18T13:00:00Z" }),
        task({ id: 3, title: "New task", created_at: "2026-06-18T15:00:00Z" }),
      ],
      "09:00",
      NOW,
      new Date("2026-06-18T14:00:00Z"),
    );

    expect(result.map(({ task_id }) => task_id)).toEqual([1, 3]);
  });

  it("does not append suggestions past the selected end time", () => {
    const result = appendCurrentTasksToPlan(
      [block()],
      [
        task({ id: 2, title: "Fits", estimated_minutes: 30 }),
        task({ id: 3, title: "Would spill over", estimated_minutes: 45 }),
      ],
      "09:00",
      NOW,
      null,
      "10:30",
    );

    expect(result.map(({ task_id }) => task_id)).toEqual([1, 2]);
    expect(result[1].end_dt).toBe("2026-06-18T15:00:00.000Z");
  });
});
