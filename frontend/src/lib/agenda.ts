import type { AgendaItem, CalendarEvent, Task } from "../types/task";
import type { ScheduledBlock } from "../types/plan";

export interface DayGroup {
  dateKey: string;
  label: string;
  items: AgendaItem[];
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDayItems(
  tasks: Task[],
  events: CalendarEvent[],
  dateKey: string,
  blocks?: ScheduledBlock[]
): AgendaItem[] {
  const allDayItems: AgendaItem[] = [];
  const timedItems: AgendaItem[] = [];

  const dayTasks = tasks.filter(
    (t) => t.due_date && t.due_date.slice(0, 10) === dateKey
  );

  for (const t of dayTasks) {
    const isAllDay = t.due_date!.includes("T00:00:00");
    const time = isAllDay ? null : t.due_date!.slice(11, 16);
    const item: AgendaItem = {
      id: `task-${t.id}`,
      title: t.title,
      time,
      priority: t.priority,
      isEvent: false,
      completed: t.completed,
      taskId: t.id,
    };
    if (isAllDay) {
      allDayItems.push(item);
    } else {
      timedItems.push(item);
    }
  }

  const dayEvents = events.filter((e) => {
    if (e.all_day) return e.start_date === dateKey;
    if (!e.start_dt) return false;
    return toDateKey(new Date(e.start_dt)) === dateKey;
  });

  for (const e of dayEvents) {
    let time: string | null = null;
    if (!e.all_day && e.start_dt) {
      const d = new Date(e.start_dt);
      time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    const item: AgendaItem = {
      id: `event-${e.google_id}`,
      title: e.title || "(No title)",
      time,
      priority: null,
      isEvent: true,
      completed: e.done,
      googleId: e.google_id,
    };
    if (e.all_day) {
      allDayItems.push(item);
    } else {
      timedItems.push(item);
    }
  }

  for (const b of (blocks ?? [])) {
    if (b.date_key !== dateKey) continue;
    const d = new Date(b.start_dt);
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const linkedTask = b.task_id == null
      ? undefined
      : tasks.find((task) => task.id === b.task_id);
    timedItems.push({
      id: `block-${b.id}`,
      title: b.title,
      time,
      priority: linkedTask?.priority ?? null,
      isEvent: false,
      isBlock: true,
      completed: linkedTask?.completed ?? b.completed,
      taskId: b.task_id ?? undefined,
      blockId: b.id,
      conflict_with: b.conflict_with,
    });
  }

  const timed = timedItems.sort((a, b) =>
    (a.time ?? "").localeCompare(b.time ?? "")
  );

  return [...allDayItems, ...timed];
}

const weekdayDateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dayLabel(offset: number, y: number, m: number, d: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  // UTC-noon Date so the formatter's timeZone:"UTC" lands on the right calendar day
  return weekdayDateFmt.format(new Date(Date.UTC(y, m, d, 12, 0, 0)));
}

export function buildAgenda(
  tasks: Task[],
  events: CalendarEvent[],
  now: Date = new Date(),
  blocks?: ScheduledBlock[]
): AgendaItem[] {
  return buildDayItems(tasks, events, toDateKey(now), blocks);
}

export function buildWeekAgenda(
  tasks: Task[],
  events: CalendarEvent[],
  now: Date = new Date(),
  blocks?: ScheduledBlock[]
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    const dateKey = toDateKey(day);
    const label = dayLabel(offset, day.getFullYear(), day.getMonth(), day.getDate());
    groups.push({ dateKey, label, items: buildDayItems(tasks, events, dateKey, blocks) });
  }
  return groups;
}
