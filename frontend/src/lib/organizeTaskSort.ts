import type { Task } from "../types/task";

export type OrganizeTaskSort = "priority" | "list";

const PRIORITY_RANK: Record<Task["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortOrganizeTasks(tasks: Task[], sortBy: OrganizeTaskSort): Task[] {
  return [...tasks].sort((a, b) => {
    if (sortBy === "list") {
      const aList = a.list_name?.trim();
      const bList = b.list_name?.trim();
      if (aList && !bList) return -1;
      if (!aList && bList) return 1;

      const listComparison = (aList ?? "").localeCompare(bList ?? "", undefined, {
        sensitivity: "base",
      });
      if (listComparison !== 0) return listComparison;
    }

    const priorityComparison = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityComparison !== 0) return priorityComparison;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}
