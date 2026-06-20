import { describe, it, expect } from "vitest";
import { buildAgenda, buildWeekAgenda } from "./agenda";
import type { CalendarEvent, Task } from "../types/task";
import type { ScheduledBlock } from "../types/plan";

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

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    google_id: "evt-default",
    title: "Event",
    start_dt: null,
    end_dt: null,
    all_day: false,
    start_date: null,
    done: false,
    ...overrides,
  };
}

function makeBlock(overrides: Partial<ScheduledBlock>): ScheduledBlock {
  return {
    id: 1,
    task_id: null,
    title: "Planned block",
    start_dt: `${TODAY}T10:00:00Z`,
    end_dt: `${TODAY}T10:30:00Z`,
    date_key: TODAY,
    approved_at: `${TODAY}T08:00:00Z`,
    conflict_with: null,
    ...overrides,
  };
}

describe("buildAgenda", () => {
  it("returns empty array when no tasks and no events", () => {
    const result = buildAgenda([], [], NOW);
    expect(result).toHaveLength(0);
  });

  it("includes calendar events from events array", () => {
    const standup = makeEvent({ google_id: "evt-1", title: "Team standup", start_dt: `${TODAY}T09:00:00Z`, all_day: false });
    const lunch = makeEvent({ google_id: "evt-2", title: "Lunch", start_dt: `${TODAY}T12:00:00Z`, all_day: false });
    const result = buildAgenda([], [standup, lunch], NOW);
    expect(result).toHaveLength(2);
    expect(result.some((i) => i.title === "Team standup")).toBe(true);
    expect(result.some((i) => i.title === "Lunch")).toBe(true);
  });

  it("places a timed task (10:30) between standup (09:00) and lunch (12:00)", () => {
    const task = makeTask({ id: 2, title: "Morning meeting", due_date: `${TODAY}T10:30:00Z` });
    const standup = makeEvent({ google_id: "evt-1", title: "Team standup", start_dt: `${TODAY}T09:00:00Z` });
    const lunch = makeEvent({ google_id: "evt-2", title: "Lunch", start_dt: `${TODAY}T12:00:00Z` });
    const result = buildAgenda([task], [standup, lunch], NOW);
    const titles = result.map((i) => i.title);
    const standupIdx = titles.indexOf("Team standup");
    const taskIdx = titles.indexOf("Morning meeting");
    const lunchIdx = titles.indexOf("Lunch");
    expect(standupIdx).toBeLessThan(taskIdx);
    expect(taskIdx).toBeLessThan(lunchIdx);
  });

  it("places all-day tasks (T00:00:00) first, before timed items", () => {
    const allDay = makeTask({ id: 3, title: "All day task", due_date: `${TODAY}T00:00:00Z` });
    const standup = makeEvent({ google_id: "evt-1", title: "Team standup", start_dt: `${TODAY}T09:00:00Z` });
    const result = buildAgenda([allDay], [standup], NOW);
    const allDayIdx = result.findIndex((i) => i.title === "All day task");
    const standupIdx = result.findIndex((i) => i.title === "Team standup");
    expect(allDayIdx).toBeLessThan(standupIdx);
  });

  it("all-day task has time === null", () => {
    const allDay = makeTask({ id: 4, title: "All day task", due_date: `${TODAY}T00:00:00Z` });
    const result = buildAgenda([allDay], [], NOW);
    const item = result.find((i) => i.title === "All day task");
    expect(item?.time).toBeNull();
  });

  it("includes completed tasks due today with completed === true", () => {
    const done = makeTask({ id: 5, title: "Done task", due_date: `${TODAY}T10:00:00Z`, completed: true });
    const result = buildAgenda([done], [], NOW);
    const item = result.find((i) => i.title === "Done task");
    expect(item).toBeDefined();
    expect(item?.completed).toBe(true);
  });

  it("not-completed task has completed === false and taskId set", () => {
    const task = makeTask({ id: 9, title: "Active task", due_date: `${TODAY}T10:00:00Z`, completed: false });
    const result = buildAgenda([task], [], NOW);
    const item = result.find((i) => i.id === "task-9");
    expect(item).toBeDefined();
    expect(item?.completed).toBe(false);
    expect(item?.taskId).toBe(9);
    expect(item?.googleId).toBeUndefined();
  });

  it("calendar event with done:true has completed === true and googleId set", () => {
    const evt = makeEvent({ google_id: "evt-done", title: "Done Event", start_dt: `${TODAY}T10:00:00Z`, done: true });
    const result = buildAgenda([], [evt], NOW);
    const item = result.find((i) => i.id === "event-evt-done");
    expect(item).toBeDefined();
    expect(item?.completed).toBe(true);
    expect(item?.googleId).toBe("evt-done");
    expect(item?.taskId).toBeUndefined();
  });

  it("calendar event with done:false has completed === false", () => {
    const evt = makeEvent({ google_id: "evt-not-done", title: "Active Event", start_dt: `${TODAY}T10:00:00Z`, done: false });
    const result = buildAgenda([], [evt], NOW);
    const item = result.find((i) => i.id === "event-evt-not-done");
    expect(item).toBeDefined();
    expect(item?.completed).toBe(false);
  });

  it("excludes tasks not due today", () => {
    const yesterday = makeTask({ id: 6, title: "Yesterday task", due_date: "2026-06-11T10:00:00Z" });
    const result = buildAgenda([yesterday], [], NOW);
    expect(result.every((i) => i.title !== "Yesterday task")).toBe(true);
  });

  it("maps task to AgendaItem with correct fields", () => {
    const task = makeTask({ id: 7, title: "My task", priority: "high", due_date: `${TODAY}T14:00:00Z` });
    const result = buildAgenda([task], [], NOW);
    const item = result.find((i) => i.id === "task-7");
    expect(item).toBeDefined();
    expect(item?.isEvent).toBe(false);
    expect(item?.priority).toBe("high");
    expect(item?.time).toBe("14:00");
  });

  it("maps calendar event to AgendaItem with isEvent:true and no priority", () => {
    const evt = makeEvent({ google_id: "evt-test", title: "Dentist", start_dt: `${TODAY}T15:00:00Z`, all_day: false });
    const result = buildAgenda([], [evt], NOW);
    const item = result.find((i) => i.id === "event-evt-test");
    expect(item).toBeDefined();
    expect(item?.isEvent).toBe(true);
    expect(item?.priority).toBeNull();
    expect(item?.time).toBe("15:00");
  });

  it("all-day calendar event has time === null and comes first", () => {
    const allDayEvt = makeEvent({ google_id: "evt-allday", title: "Holiday", all_day: true, start_date: TODAY });
    const timedTask = makeTask({ id: 8, title: "Timed task", due_date: `${TODAY}T10:00:00Z` });
    const result = buildAgenda([timedTask], [allDayEvt], NOW);
    const allDayIdx = result.findIndex((i) => i.id === "event-evt-allday");
    const timedIdx = result.findIndex((i) => i.id === "task-8");
    expect(result.find((i) => i.id === "event-evt-allday")?.time).toBeNull();
    expect(allDayIdx).toBeLessThan(timedIdx);
  });

  it("uses (No title) for events with empty title", () => {
    const evt = makeEvent({ google_id: "evt-notitle", title: "", start_dt: `${TODAY}T10:00:00Z` });
    const result = buildAgenda([], [evt], NOW);
    expect(result.find((i) => i.id === "event-evt-notitle")?.title).toBe("(No title)");
  });

  it("keeps task-backed planned blocks toggleable and reflects task completion", () => {
    const task = makeTask({ id: 42, priority: "high", completed: true });
    const block = makeBlock({ id: 7, task_id: task.id, title: task.title });

    const item = buildAgenda([task], [], NOW, [block]).find((i) => i.id === "block-7");

    expect(item?.taskId).toBe(42);
    expect(item?.completed).toBe(true);
    expect(item?.priority).toBe("high");
  });

  it("leaves custom planned blocks without a task target", () => {
    const block = makeBlock({ id: 8, task_id: null });

    const item = buildAgenda([], [], NOW, [block]).find((i) => i.id === "block-8");

    expect(item?.taskId).toBeUndefined();
    expect(item?.completed).toBe(false);
  });
});

describe("buildWeekAgenda", () => {
  it("returns 7 groups with dateKey[0] === TODAY", () => {
    const result = buildWeekAgenda([], [], NOW);
    expect(result).toHaveLength(7);
    expect(result[0].dateKey).toBe("2026-06-12");
  });

  it("labels: Today / Tomorrow / weekday-date format", () => {
    const result = buildWeekAgenda([], [], NOW);
    expect(result[0].label).toBe("Today");
    expect(result[1].label).toBe("Tomorrow");
    // group[2] = 2026-06-14 (Sun)
    expect(result[2].label).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
  });

  it("buckets items into correct day", () => {
    // TODAY+2 = 2026-06-14
    const task14 = makeTask({ id: 10, title: "Task on +2", due_date: "2026-06-14T10:00:00Z" });
    // TODAY task
    const task12 = makeTask({ id: 11, title: "Task on today", due_date: `${TODAY}T09:00:00Z` });
    const result = buildWeekAgenda([task14, task12], [], NOW);
    expect(result[2].items.some((i) => i.title === "Task on +2")).toBe(true);
    expect(result[0].items.some((i) => i.title === "Task on today")).toBe(true);
    // task14 must NOT appear in group[0]
    expect(result[0].items.every((i) => i.title !== "Task on +2")).toBe(true);
  });

  it("per-day ordering: all-day first, then timed ascending", () => {
    const allDay = makeTask({ id: 20, title: "All day", due_date: `${TODAY}T00:00:00Z` });
    const early = makeTask({ id: 21, title: "Early", due_date: `${TODAY}T09:00:00Z` });
    const late = makeTask({ id: 22, title: "Late", due_date: `${TODAY}T10:30:00Z` });
    const result = buildWeekAgenda([late, early, allDay], [], NOW);
    const titles = result[0].items.map((i) => i.title);
    expect(titles[0]).toBe("All day");
    expect(titles[1]).toBe("Early");
    expect(titles[2]).toBe("Late");
  });

  it("includes completed items within the week, crossed-out via completed flag", () => {
    const done = makeTask({ id: 25, title: "Done task", due_date: `${TODAY}T10:00:00Z`, completed: true });
    const result = buildWeekAgenda([done], [], NOW);
    const item = result[0].items.find((i) => i.id === "task-25");
    expect(item).toBeDefined();
    expect(item?.completed).toBe(true);
  });

  it("excludes items outside the 7-day window", () => {
    // TODAY+7 = 2026-06-19 — outside
    const tooFar = makeTask({ id: 30, title: "Too far ahead", due_date: "2026-06-19T10:00:00Z" });
    // yesterday = 2026-06-11 — outside
    const yesterday = makeTask({ id: 31, title: "Yesterday", due_date: "2026-06-11T10:00:00Z" });
    const result = buildWeekAgenda([tooFar, yesterday], [], NOW);
    const allItems = result.flatMap((g) => g.items);
    expect(allItems.every((i) => i.title !== "Too far ahead")).toBe(true);
    expect(allItems.every((i) => i.title !== "Yesterday")).toBe(true);
  });
});
