import type { Goal } from "../types/goal";
import type { Task } from "../types/task";

export interface TaskFilter {
  key: string;
  label: string;
  kind: "list" | "goal";
  value: string | number;
}

function listNamesForTask(task: Task, goalsById: Map<number, Goal>): string[] {
  const names: string[] = [];
  if (task.list_name) names.push(task.list_name);

  const goal = task.goal_id != null ? goalsById.get(task.goal_id) : undefined;
  if (goal?.list_name && goal.list_name !== task.list_name) {
    names.push(goal.list_name);
  }

  return names;
}

export function buildTaskFilters(tasks: Task[], goals: Goal[]): TaskFilter[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const listNames = Array.from(
    new Set(tasks.flatMap((task) => listNamesForTask(task, goalsById)))
  );
  const linkedGoalIds = new Set(
    tasks
      .map((task) => task.goal_id)
      .filter((goalId): goalId is number => goalId != null)
  );

  return [
    ...listNames.map((name) => ({
      key: `list:${name}`,
      label: name,
      kind: "list" as const,
      value: name,
    })),
    ...goals
      .filter((goal) => linkedGoalIds.has(goal.id))
      .map((goal) => ({
        key: `goal:${goal.id}`,
        label: goal.title,
        kind: "goal" as const,
        value: goal.id,
      })),
  ];
}

export function taskMatchesFilter(
  task: Task,
  filter: TaskFilter,
  goals: Goal[]
): boolean {
  if (filter.kind === "goal") {
    return task.goal_id === filter.value;
  }

  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  return listNamesForTask(task, goalsById).includes(filter.value as string);
}
