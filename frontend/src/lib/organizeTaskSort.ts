import type { Task } from "../types/task";

export type OrganizeTaskSort = "priority" | "list";

const PRIORITY_RANK: Record<Task["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function listPath(task: Task): string[] {
  const parent = task.parent_list_name?.trim();
  const child = task.list_name?.trim();
  if (parent) return child ? [parent, child] : [parent];
  return child ? [child] : [];
}

export function sortOrganizeTasks(
  tasks: Task[],
  sortBy: OrganizeTaskSort,
  prioritizedTaskIds?: ReadonlySet<number>,
): Task[] {
  return [...tasks].sort((a, b) => {
    if (sortBy === "list") {
      if (prioritizedTaskIds?.size) {
        const aIsPrioritized = prioritizedTaskIds.has(a.id);
        const bIsPrioritized = prioritizedTaskIds.has(b.id);
        if (aIsPrioritized && !bIsPrioritized) return -1;
        if (!aIsPrioritized && bIsPrioritized) return 1;
      }

      const aPath = listPath(a);
      const bPath = listPath(b);
      if (aPath.length > 0 && bPath.length === 0) return -1;
      if (aPath.length === 0 && bPath.length > 0) return 1;

      const pathComparison = aPath.join("\u0000").localeCompare(
        bPath.join("\u0000"),
        undefined,
        { sensitivity: "base" },
      );
      if (pathComparison !== 0) return pathComparison;
    }

    const priorityComparison = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityComparison !== 0) return priorityComparison;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}