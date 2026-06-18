import { describe, expect, it } from "vitest";
import { sortOrganizeTasks } from "./organizeTaskSort";
import type { Task } from "../types/task";

const BASE_TASK: Task = {
  id: 1,
  title: "Task",
  priority: "medium",
  completed: false,
  created_at: "2026-06-18T00:00:00Z",
  updated_at: "2026-06-18T00:00:00Z",
};

function task(overrides: Partial<Task>): Task {
  return { ...BASE_TASK, ...overrides };
}

describe("sortOrganizeTasks", () => {
  it("sorts priority high to low, then by title", () => {
    const tasks = [
      task({ id: 1, title: "Low", priority: "low" }),
      task({ id: 2, title: "Zulu", priority: "high" }),
      task({ id: 3, title: "Alpha", priority: "high" }),
      task({ id: 4, title: "Medium", priority: "medium" }),
    ];

    expect(sortOrganizeTasks(tasks, "priority").map(({ id }) => id)).toEqual([3, 2, 4, 1]);
  });

  it("sorts named lists alphabetically, then priority, with unlisted tasks last", () => {
    const tasks = [
      task({ id: 1, title: "Unlisted", priority: "high", list_name: null }),
      task({ id: 2, title: "Home low", priority: "low", list_name: "Home" }),
      task({ id: 3, title: "Work", priority: "medium", list_name: "Work" }),
      task({ id: 4, title: "Home high", priority: "high", list_name: "home" }),
    ];

    expect(sortOrganizeTasks(tasks, "list").map(({ id }) => id)).toEqual([4, 2, 3, 1]);
  });
});
