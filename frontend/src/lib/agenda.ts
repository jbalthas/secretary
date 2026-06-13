import type { AgendaItem, Task } from "../types/task";

export const PLACEHOLDER_EVENTS: AgendaItem[] = [
  { id: "evt-1", title: "Team standup", time: "09:00", priority: null, isEvent: true },
  { id: "evt-2", title: "Lunch", time: "12:00", priority: null, isEvent: true },
];

export function buildAgenda(tasks: Task[], now: Date = new Date()): AgendaItem[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const todayTasks = tasks.filter(
    (t) => !t.completed && t.due_date && t.due_date.slice(0, 10) === today
  );

  const allDayItems: AgendaItem[] = [];
  const timedTaskItems: AgendaItem[] = [];

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
      timedTaskItems.push(item);
    }
  }

  const timed = [...timedTaskItems, ...PLACEHOLDER_EVENTS].sort((a, b) =>
    (a.time ?? "").localeCompare(b.time ?? "")
  );

  return [...allDayItems, ...timed];
}
