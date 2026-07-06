import { describe, expect, it } from "vitest";
import { buildTaskFilters, taskMatchesFilter } from "./taskFilters";
import type { Goal } from "../types/goal";
import type { Task } from "../types/task";

const goal = {
  id: 7,
  title: "Launch the studio",
  list_name: null,
  parent_list_name: null,
} as Goal;

const linkedTask = {
  id: 11,
  title: "Choose a domain",
  goal_id: goal.id,
  list_name: null,
  parent_list_name: null,
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
    expect(taskMatchesFilter({ ...linkedTask, goal_id: 8 }, filter!, [goal])).toBe(false);
  });

  it("preserves standalone task lists and inherited goal lists", () => {
    const listedGoal = { ...goal, list_name: "Business" };
    const listedTask = { ...linkedTask, list_name: "This week" };

    expect(buildTaskFilters([listedTask], [listedGoal])).toEqual([
      {
        key: "parent-list:business",
        label: "Business",
        kind: "parent-list",
        value: "Business",
      },
      {
        key: "parent-list:this week",
        label: "This week",
        kind: "parent-list",
        value: "This week",
      },
      {
        key: "goal:7",
        label: "Launch the studio",
        kind: "goal",
        value: 7,
      },
    ]);
  });

  it("groups and matches sub-lists beneath an umbrella", () => {
    const optics = {
      ...linkedTask,
      parent_list_name: "Career",
      list_name: "Optics",
    };
    const filters = buildTaskFilters([optics], [goal]);

    expect(filters.slice(0, 2)).toEqual([
      {
        key: "parent-list:career",
        label: "Career",
        kind: "parent-list",
        value: "Career",
      },
      {
        key: "list:career:optics",
        label: "Optics",
        kind: "list",
        value: "Optics",
        parentName: "Career",
      },
    ]);
    expect(taskMatchesFilter(optics, filters[0], [goal])).toBe(true);
    expect(taskMatchesFilter(optics, filters[1], [goal])).toBe(true);
  });
});