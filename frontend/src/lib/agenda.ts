import type { AgendaItem, CalendarEvent, Task } from "../types/task";

export function buildAgenda(tasks: Task[], events: CalendarEvent[], now: Date = new Date()): AgendaItem[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const todayTasks = tasks.filter(
    (t) => !t.completed && t.due_date && t.due_date.slice(0, 10) === today
  );

  const allDayItems: AgendaItem[] = [];
  const timedItems: AgendaItem[] = [];

  for (const t of todayTasks) {
    const isAllDay = t.due_date!.includes("T00:00:00");
    const time = isAllDay ? null : t.due_date!.slice(11, 16);
    const item: AgendaItem = {
      id: `task-${t.id}`,
      title: t.title,
      time,
      priority: t.priority,
      isEvent: false,
    };
    if (isAllDay) {
      allDayItems.push(item);
    } else {
      timedItems.push(item);
    }
  }

  const todayEvents = events.filter((e) =>
    e.all_day ? e.start_date === today : e.start_dt?.slice(0, 10) === today
  );

  for (const e of todayEvents) {
    const time = e.all_day ? null : (e.start_dt ? e.start_dt.slice(11, 16) : null);
    const item: AgendaItem = {
      id: `event-${e.google_id}`,
      title: e.title || "(No title)",
      time,
      priority: null,
      isEvent: true,
    };
    if (e.all_day) {
      allDayItems.push(item);
    } else {
      timedItems.push(item);
    }
  }

  const timed = timedItems.sort((a, b) =>
    (a.time ?? "").localeCompare(b.time ?? "")
  );

  return [...allDayItems, ...timed];
}
