import { describe, it, expect } from "vitest";
import { buildAgenda } from "./agenda";
import type { CalendarEvent, Task } from "../types/task";

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
});
