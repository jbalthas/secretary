import type { Task } from "../types/task";
import type { ScheduledBlock } from "../types/plan";

export interface RollupItem {
  title: string;
  completed: boolean;
}

export interface Rollup {
  completed: RollupItem[];
  slipped: RollupItem[];
  completedCount: number;
  slippedCount: number;
}

// NOTE: completed=true is ambiguous between "done" and "dropped" (Phase 12-04:
// drop reuses completed=True with no separate flag). Per UI-SPEC, the rollup
// treats all completed=true today-items as "completed".
export function deriveRollup(
  tasks: Task[],
  blocks: ScheduledBlock[],
  todayKey: string,
): Rollup {
  const items: RollupItem[] = [];
  for (const t of tasks) {
    if (t.due_date && t.due_date.slice(0, 10) === todayKey) {
      items.push({ title: t.title, completed: t.completed });
    }
  }
  for (const b of blocks) {
    if (b.date_key === todayKey) {
      items.push({ title: b.title, completed: b.completed });
    }
  }
  const completed = items.filter((i) => i.completed);
  const slipped = items.filter((i) => !i.completed);
  return {
    completed,
    slipped,
    completedCount: completed.length,
    slippedCount: slipped.length,
  };
}
