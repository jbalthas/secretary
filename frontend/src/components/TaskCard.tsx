import { useState } from "react";
import { Bell, Repeat } from "lucide-react";
import type { Task } from "../types/task";
import type { Goal } from "../types/goal";
import { resolveCategory, categoryVisual } from "../lib/taskCategory";

interface Props {
  task: Task;
  goals: Goal[];
  onEdit: (task: Task) => void;
  onToggle: (id: number, completed: boolean) => Promise<void>;
}

function formatDueDate(due_date: string): string {
  const d = new Date(due_date);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

export default function TaskCard({ task, goals, onEdit, onToggle }: Props) {
  const [localCompleted, setLocalCompleted] = useState(task.completed);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    const newValue = !localCompleted;
    setLocalCompleted(newValue);
    setError(null);
    try {
      await onToggle(task.id, newValue);
    } catch {
      setLocalCompleted(!newValue);
      setError("Couldn't save — try again");
    }
  }

  const visual = categoryVisual(resolveCategory(task, goals));

  return (
    <div
      className={"tasks-card" + (localCompleted ? " tasks-card--done" : "")}
      onClick={() => onEdit(task)}
    >
      <div className="tasks-card-thumb" style={{ background: visual.gradient }}>
        <visual.Icon size={22} aria-hidden="true" />
      </div>
      <div className="tasks-card-body">
        <span className="tasks-card-title">{task.title}</span>
        {localCompleted ? (
          <span className="tasks-card-meta">Completed</span>
        ) : (
          <div className="tasks-card-meta">
            {task.due_date && <span className="tasks-card-due">{formatDueDate(task.due_date)}</span>}
            <span
              className={`tasks-priority-dot tasks-priority-dot--${task.priority}`}
              aria-label={`Priority: ${task.priority}`}
            />
            {task.reminder_at && <Bell size={14} aria-label="Has reminder" />}
            {task.recurrence_cron && <Repeat size={14} aria-label="Recurring" />}
          </div>
        )}
        {error && <div className="tasks-card-error">{error}</div>}
      </div>
      <input
        type="checkbox"
        checked={localCompleted}
        aria-label={
          localCompleted
            ? `Mark '${task.title}' incomplete`
            : `Mark '${task.title}' complete`
        }
        onChange={handleToggle}
        onClick={(e) => e.stopPropagation()}
        className="tasks-card-check"
      />
    </div>
  );
}
