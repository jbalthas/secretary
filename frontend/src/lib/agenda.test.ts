import { describe, it, expect } from "vitest";
import { buildAgenda, PLACEHOLDER_EVENTS } from "./agenda";
import type { Task } from "../types/task";

const NOW = new Date("2026-06-12T08:00:00Z");
const TODAY = "2026-06-12";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 1,
    title: "Test task",
    priority: "medium",
    completed: false,
    created_at: "2026-06-12T00:00:00Z",
    updated_at: "2026-06-12T00:00:00Z",
    ...overrides,
  };
}

describe("buildAgenda", () => {
  it("includes placeholder events", () => {
    const result = buildAgenda([], NOW);
    expect(result).toHaveLength(PLACEHOLDER_EVENTS.length);
    expect(result.some((i) => i.title === "Team standup")).toBe(true);
    expect(result.some((i) => i.title === "Lunch")).toBe(true);
  });

  it("places a timed task (10:30) between standup (09:00) and lunch (12:00)", () => {
    const task = makeTask({
      id: 2,
      title: "Morning meeting",
      due_date: `${TODAY}T10:30:00Z`,
    });
    const result = buildAgenda([task], NOW);
    const titles = result.map((i) => i.title);
    const standupIdx = titles.indexOf("Team standup");
    const taskIdx = titles.indexOf("Morning meeting");
    const lunchIdx = titles.indexOf("Lunch");
    expect(standupIdx).toBeLessThan(taskIdx);
    expect(taskIdx).toBeLessThan(lunchIdx);
  });

  it("places all-day tasks (T00:00:00) first, before timed items", () => {
    const allDay = makeTask({
      id: 3,
      title: "All day task",
      due_date: `${TODAY}T00:00:00Z`,
    });
    const result = buildAgenda([allDay], NOW);
    const allDayIdx = result.findIndex((i) => i.title === "All day task");
    const standupIdx = result.findIndex((i) => i.title === "Team standup");
    expect(allDayIdx).toBeLessThan(standupIdx);
  });

  it("all-day task has time === null", () => {
    const allDay = makeTask({
      id: 4,
      title: "All day task",
      due_date: `${TODAY}T00:00:00Z`,
    });
    const result = buildAgenda([allDay], NOW);
    const item = result.find((i) => i.title === "All day task");
    expect(item?.time).toBeNull();
  });

  it("excludes completed tasks", () => {
    const done = makeTask({
      id: 5,
      title: "Done task",
      due_date: `${TODAY}T10:00:00Z`,
      completed: true,
    });
    const result = buildAgenda([done], NOW);
    expect(result.every((i) => i.title !== "Done task")).toBe(true);
  });

  it("excludes tasks not due today", () => {
    const yesterday = makeTask({
      id: 6,
      title: "Yesterday task",
      due_date: "2026-06-11T10:00:00Z",
    });
    const result = buildAgenda([yesterday], NOW);
    expect(result.every((i) => i.title !== "Yesterday task")).toBe(true);
  });

  it("maps task to AgendaItem with correct fields", () => {
    const task = makeTask({
      id: 7,
      title: "My task",
      priority: "high",
      due_date: `${TODAY}T14:00:00Z`,
    });
    const result = buildAgenda([task], NOW);
    const item = result.find((i) => i.id === "task-7");
    expect(item).toBeDefined();
    expect(item?.isEvent).toBe(false);
    expect(item?.priority).toBe("high");
    expect(item?.time).toBe("14:00");
  });
});
