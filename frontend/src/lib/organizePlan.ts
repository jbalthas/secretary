import { sortOrganizeTasks } from "./organizeTaskSort";
import type { ProposedBlock } from "../types/plan";
import type { Task } from "../types/task";

function nextQuarterHour(date: Date): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15);
  return next;
}

function initialCursor(blocks: ProposedBlock[], workStart: string, now: Date): Date {
  if (blocks.length > 0) {
    return blocks.reduce((latest, block) => {
      const end = new Date(block.end_dt);
      return end > latest ? end : latest;
    }, new Date(blocks[0].end_dt));
  }

  const start = new Date(now);
  const [hours, minutes] = workStart.split(":").map(Number);
  start.setHours(hours, minutes, 0, 0);
  return start > now ? start : nextQuarterHour(now);
}

export function appendCurrentTasksToPlan(
  blocks: ProposedBlock[],
  tasks: Task[],
  workStart = "09:00",
  now = new Date(),
  createdAfter?: Date | null,
  workEnd?: string,
): ProposedBlock[] {
  const scheduledTaskIds = new Set(
    blocks.flatMap((block) => (block.task_id == null ? [] : [block.task_id])),
  );
  const missingTasks = sortOrganizeTasks(
    tasks.filter(
      (task) =>
        !task.completed &&
        !scheduledTaskIds.has(task.id) &&
        (!createdAfter || new Date(task.created_at) > createdAfter),
    ),
    "priority",
  );

  if (missingTasks.length === 0) return blocks;

  let cursor = initialCursor(blocks, workStart, now);
  const windowEnd = workEnd
    ? (() => {
        const end = new Date(now);
        const [hours, minutes] = workEnd.split(":").map(Number);
        end.setHours(hours, minutes, 0, 0);
        return end;
      })()
    : null;
  const additions = missingTasks.flatMap((task) => {
    const start = new Date(cursor);
    const end = new Date(start.getTime() + (task.estimated_minutes || 30) * 60000);
    if (windowEnd && end > windowEnd) return [];
    cursor = end;
    return [{
      task_id: task.id,
      title: task.title,
      start_dt: start.toISOString(),
      end_dt: end.toISOString(),
    }];
  });

  return [...blocks, ...additions];
}
