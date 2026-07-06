import type { Task } from "../types/task";
import type { ScheduledBlock } from "../types/plan";
import type { CalendarEvent, AgendaItem } from "../types/task";
import { deriveRollup } from "./rollup";

export interface MomentumResult {
  doneToday: number;
  remainingToday: number;
}

export function deriveMomentum(
  tasks: Task[],
  blocks: ScheduledBlock[],
  todayKey: string,
): MomentumResult {
  const r = deriveRollup(tasks, blocks, todayKey);
  return { doneToday: r.completedCount, remainingToday: r.slippedCount };
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function nextEventLabel(events: CalendarEvent[], now: Date): string | null {
  let soonest: { ms: number; label: string } | null = null;
  for (const e of events) {
    if (e.all_day || !e.start_dt) continue;
    const ms = new Date(e.start_dt).getTime();
    if (ms < now.getTime()) continue;
    if (soonest === null || ms < soonest.ms) {
      soonest = { ms, label: timeFmt.format(new Date(e.start_dt)) };
    }
  }
  return soonest ? `Next: ${soonest.label}` : null;
}

export interface MarkedItem {
  item: AgendaItem;
  phase: "past" | "now" | "upcoming";
}

export function markTimeline(items: AgendaItem[], nowHHMM: string): MarkedItem[] {
  const result: MarkedItem[] = [];
  let nowAssigned = false;

  for (const item of items) {
    if (item.time === null) {
      result.push({ item, phase: "upcoming" });
      continue;
    }
    if (item.time < nowHHMM) {
      result.push({ item, phase: "past" });
    } else if (!nowAssigned) {
      result.push({ item, phase: "now" });
      nowAssigned = true;
    } else {
      result.push({ item, phase: "upcoming" });
    }
  }

  return result;
}

export function currentHHMM(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
