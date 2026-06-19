import type { Goal } from "../types/goal";
import type { Task } from "../types/task";

export interface TaskFilter {
  key: string;
  label: string;
  kind: "parent-list" | "list" | "goal";
  value: string | number;
  parentName?: string;
}

interface ListAssignment {
  parent: string;
  child: string | null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function assignmentsForTask(task: Task, goalsById: Map<number, Goal>): ListAssignment[] {
  const candidates = [
    { parent: task.parent_list_name, child: task.list_name },
    task.goal_id != null
      ? {
          parent: goalsById.get(task.goal_id)?.parent_list_name,
          child: goalsById.get(task.goal_id)?.list_name,
        }
      : null,
  ];
  const assignments = new Map<string, ListAssignment>();

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parent = candidate.parent?.trim() || candidate.child?.trim();
    if (!parent) continue;
    const child = candidate.parent ? candidate.child?.trim() || null : null;
    const key = `${normalize(parent)}::${child ? normalize(child) : ""}`;
    assignments.set(key, { parent, child });
  }

  return [...assignments.values()];
}

export function buildTaskFilters(tasks: Task[], goals: Goal[]): TaskFilter[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const groups = new Map<string, { name: string; children: Map<string, string> }>();

  for (const task of tasks) {
    for (const assignment of assignmentsForTask(task, goalsById)) {
      const parentKey = normalize(assignment.parent);
      const group = groups.get(parentKey) ?? {
        name: assignment.parent,
        children: new Map<string, string>(),
      };
      if (assignment.child) {
        group.children.set(normalize(assignment.child), assignment.child);
      }
      groups.set(parentKey, group);
    }
  }

  const listFilters = [...groups.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .flatMap(([parentKey, group]) => [
      {
        key: `parent-list:${parentKey}`,
        label: group.name,
        kind: "parent-list" as const,
        value: group.name,
      },
      ...[...group.children.values()]
        .sort((a, b) => a.localeCompare(b))
        .map((child) => ({
          key: `list:${parentKey}:${normalize(child)}`,
          label: child,
          kind: "list" as const,
          value: child,
          parentName: group.name,
        })),
    ]);

  const linkedGoalIds = new Set(
    tasks.map((task) => task.goal_id).filter((goalId): goalId is number => goalId != null)
  );

  return [
    ...listFilters,
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
  if (filter.kind === "goal") return task.goal_id === filter.value;

  const assignments = assignmentsForTask(task, new Map(goals.map((goal) => [goal.id, goal])));
  if (filter.kind === "parent-list") {
    return assignments.some(
      (assignment) => normalize(assignment.parent) === normalize(filter.value as string)
    );
  }

  return assignments.some(
    (assignment) =>
      normalize(assignment.parent) === normalize(filter.parentName ?? "") &&
      assignment.child != null &&
      normalize(assignment.child) === normalize(filter.value as string)
  );
}