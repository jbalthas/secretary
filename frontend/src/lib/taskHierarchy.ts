import type { Task, AgendaItem } from "../types/task";

export interface TaskGroups {
  parents: Task[];
  childrenByParentId: Map<number, Task[]>;
}

export function groupTasksByParent(tasks: Task[]): TaskGroups {
  const childrenByParentId = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.parent_task_id == null) continue;
    const list = childrenByParentId.get(t.parent_task_id) ?? [];
    list.push(t);
    childrenByParentId.set(t.parent_task_id, list);
  }
  const parents = tasks.filter((t) => t.parent_task_id == null);
  return { parents, childrenByParentId };
}

export function subtaskProgress(children: Task[]): { done: number; total: number } {
  return { done: children.filter((c) => c.completed).length, total: children.length };
}

export interface AgendaGroups {
  topLevel: AgendaItem[];
  childrenByTaskId: Map<number, AgendaItem[]>;
}

export function groupAgendaItemsByParent(items: AgendaItem[]): AgendaGroups {
  const childrenByTaskId = new Map<number, AgendaItem[]>();
  for (const item of items) {
    if (item.parentTaskId == null) continue;
    const list = childrenByTaskId.get(item.parentTaskId) ?? [];
    list.push(item);
    childrenByTaskId.set(item.parentTaskId, list);
  }
  const topLevel = items.filter((item) => item.parentTaskId == null);
  return { topLevel, childrenByTaskId };
}

/**
 * D-03 (locked): "Drop in the gap between rows = reorder in the flat list."
 * Only the persistence mechanism was left to Claude's discretion (CONTEXT.md
 * discretion note) — reordering itself is NOT optional. This implements the
 * "can stay implicit" option: an in-memory/session-level manual order that
 * the consuming component (TodayTimeline, Tasks.tsx) stores in local state
 * and re-applies via applyManualOrder() on every render. It is intentionally
 * NOT persisted to the backend or across page reloads.
 */
export function moveInOrder<T extends string | number>(
  currentOrder: T[],
  draggedId: T,
  targetId: T,
  position: "before" | "after"
): T[] {
  if (draggedId === targetId) return currentOrder;
  const withoutDragged = currentOrder.filter((id) => id !== draggedId);
  const targetIdx = withoutDragged.indexOf(targetId);
  if (targetIdx === -1) return currentOrder;
  const insertAt = position === "after" ? targetIdx + 1 : targetIdx;
  const next = [...withoutDragged];
  next.splice(insertAt, 0, draggedId);
  return next;
}

export function applyManualOrder<T extends { id: string | number }>(
  items: T[],
  orderIds: Array<string | number>
): T[] {
  if (orderIds.length === 0) return items;
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const ordered: T[] = [];
  for (const id of orderIds) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  for (const item of items) {
    if (byId.has(item.id)) ordered.push(item);
  }
  return ordered;
}
