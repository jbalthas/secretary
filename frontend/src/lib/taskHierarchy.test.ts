import { describe, expect, it } from "vitest";
import {
  groupTasksByParent,
  subtaskProgress,
  groupAgendaItemsByParent,
  moveInOrder,
  applyManualOrder,
} from "./taskHierarchy";
import type { Task, AgendaItem } from "../types/task";

describe("groupTasksByParent", () => {
  it("separates parents/standalone tasks from children by parent_task_id", () => {
    const parent = { id: 1, parent_task_id: null } as Task;
    const child1 = { id: 2, parent_task_id: 1 } as Task;
    const child2 = { id: 3, parent_task_id: 1 } as Task;
    const standalone = { id: 4, parent_task_id: null } as Task;

    const { parents, childrenByParentId } = groupTasksByParent([
      parent,
      child1,
      child2,
      standalone,
    ]);

    expect(parents).toEqual([parent, standalone]);
    expect(childrenByParentId.get(1)).toEqual([child1, child2]);
  });

  it("never lists a null parent_task_id task as a value in childrenByParentId", () => {
    const standalone = { id: 5, parent_task_id: null } as Task;
    const { childrenByParentId } = groupTasksByParent([standalone]);

    for (const children of childrenByParentId.values()) {
      expect(children).not.toContainEqual(standalone);
    }
  });
});

describe("subtaskProgress", () => {
  it("counts done vs total from a list of children", () => {
    const children = [
      { completed: true } as Task,
      { completed: false } as Task,
      { completed: true } as Task,
    ];

    expect(subtaskProgress(children)).toEqual({ done: 2, total: 3 });
  });

  it("returns zero/zero for an empty list", () => {
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("groupAgendaItemsByParent", () => {
  it("groups a child item under its parent's taskId and excludes it from topLevel", () => {
    const parentItem = { id: "task-1", taskId: 1, parentTaskId: null } as AgendaItem;
    const childItem = { id: "task-2", taskId: 2, parentTaskId: 1 } as AgendaItem;

    const { topLevel, childrenByTaskId } = groupAgendaItemsByParent([
      parentItem,
      childItem,
    ]);

    expect(childrenByTaskId.get(1)).toEqual([childItem]);
    expect(topLevel).not.toContainEqual(childItem);
    expect(topLevel).toContainEqual(parentItem);
  });

  it("always keeps event items in topLevel, never grouped as a child", () => {
    const eventItem = { id: "event-1", isEvent: true, parentTaskId: undefined } as AgendaItem;

    const { topLevel, childrenByTaskId } = groupAgendaItemsByParent([eventItem]);

    expect(topLevel).toContainEqual(eventItem);
    for (const children of childrenByTaskId.values()) {
      expect(children).not.toContainEqual(eventItem);
    }
  });
});

describe("moveInOrder", () => {
  it("moves an id before a target", () => {
    expect(moveInOrder([1, 2, 3], 3, 1, "before")).toEqual([3, 1, 2]);
  });

  it("moves an id after a target", () => {
    expect(moveInOrder([1, 2, 3], 1, 3, "after")).toEqual([2, 3, 1]);
  });

  it("returns the order unchanged when draggedId === targetId", () => {
    expect(moveInOrder([1, 2, 3], 2, 2, "before")).toEqual([1, 2, 3]);
  });

  it("returns the order unchanged when targetId is not present", () => {
    expect(moveInOrder([1, 2, 3], 1, 99, "after")).toEqual([1, 2, 3]);
  });
});

describe("applyManualOrder", () => {
  it("reorders items according to orderIds", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(applyManualOrder(items, [3, 1, 2])).toEqual([
      { id: 3 },
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("appends items not present in orderIds at the end, preserving relative position", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(applyManualOrder(items, [3, 1])).toEqual([
      { id: 3 },
      { id: 1 },
      { id: 2 },
      { id: 4 },
    ]);
  });

  it("returns items unchanged when orderIds is empty", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(applyManualOrder(items, [])).toEqual(items);
  });
});
