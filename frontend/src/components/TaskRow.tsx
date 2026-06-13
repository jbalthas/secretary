import { useState } from "react";
import { Bell, Repeat } from "lucide-react";
import type { Task } from "../types/task";

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
  onToggle: (id: number, completed: boolean) => Promise<void>;
}

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

function formatDueDate(due_date: string): string {
  const d = new Date(due_date);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

export default function TaskRow({ task, onEdit, onToggle }: Props) {
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

  return (
    <div
      className="task-row"
      onClick={() => onEdit(task)}
      style={{ opacity: localCompleted ? 0.5 : 1 }}
    >
      <div className="task-row-left">
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
          className="task-checkbox"
        />
        <div className="task-row-content">
          <div className="task-row-title-line">
            <span
              className="task-row-title"
              style={{ textDecoration: localCompleted ? "line-through" : "none" }}
            >
              {task.title}
            </span>
            <span
              className={`priority-badge priority-${task.priority}`}
              aria-label={`Priority: ${PRIORITY_LABELS[task.priority] ?? task.priority}`}
            >
              {PRIORITY_LABELS[task.priority] ?? task.priority}
            </span>
          </div>
          {task.description && (
            <div className="task-row-description">{task.description}</div>
          )}
          {error && <div className="task-row-error">{error}</div>}
        </div>
      </div>
      <div className="task-row-right">
        {task.due_date && (
          <span className="task-row-due">{formatDueDate(task.due_date)}</span>
        )}
        {task.reminder_at && <Bell size={16} aria-label="Has reminder" />}
        {task.recurrence_cron && <Repeat size={16} aria-label="Recurring" />}
      </div>
    </div>
  );
}
