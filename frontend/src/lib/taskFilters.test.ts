import { describe, expect, it } from "vitest";
import { buildTaskFilters, taskMatchesFilter } from "./taskFilters";
import type { Goal } from "../types/goal";
import type { Task } from "../types/task";

const goal = {
  id: 7,
  title: "Launch the studio",
  list_name: null,
} as Goal;

const linkedTask = {
  id: 11,
  title: "Choose a domain",
  goal_id: goal.id,
  list_name: null,
} as Task;

describe("task goal filters", () => {
  it("creates a goal chip when a linked goal has no list name", () => {
    expect(buildTaskFilters([linkedTask], [goal])).toContainEqual({
      key: "goal:7",
      label: "Launch the studio",
      kind: "goal",
      value: 7,
    });
  });

  it("matches linked tasks by goal id rather than title", () => {
    const filter = buildTaskFilters([linkedTask], [goal]).find(
      (item) => item.key === "goal:7"
    );

    expect(filter).toBeDefined();
    expect(taskMatchesFilter(linkedTask, filter!, [goal])).toBe(true);
    expect(
      taskMatchesFilter({ ...linkedTask, goal_id: 8 }, filter!, [goal])
    ).toBe(false);
  });

  it("preserves task lists and inherited goal lists", () => {
    const listedGoal = { ...goal, list_name: "Business" };
    const listedTask = { ...linkedTask, list_name: "This week" };

    expect(buildTaskFilters([listedTask], [listedGoal])).toEqual([
      {
        key: "list:This week",
        label: "This week",
        kind: "list",
        value: "This week",
      },
      {
        key: "list:Business",
        label: "Business",
        kind: "list",
        value: "Business",
      },
      {
        key: "goal:7",
        label: "Launch the studio",
        kind: "goal",
        value: 7,
      },
    ]);
  });
});
