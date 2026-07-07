import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Bell, Repeat, GripVertical } from "lucide-react";
import type { Task } from "../types/task";
import type { Goal } from "../types/goal";
import { resolveCategory, categoryVisual } from "../lib/taskCategory";
import { subtaskProgress } from "../lib/taskHierarchy";

interface Props {
  task: Task;
  goals: Goal[];
  onEdit: (task: Task) => void;
  onToggle: (id: number, completed: boolean) => Promise<void>;
  childTasks?: Task[];
  isNested?: boolean;
}

function formatDueDate(due_date: string): string {
  const d = new Date(due_date);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

export default function TaskCard({ task, goals, onEdit, onToggle, childTasks, isNested }: Props) {
  const [localCompleted, setLocalCompleted] = useState(task.completed);
  const [error, setError] = useState<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({ id: task.id });
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({ id: task.id });

  function setNodeRef(el: HTMLElement | null) {
    setDragNodeRef(el);
    setDropNodeRef(el);
  }

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
  const progress = childTasks && childTasks.length > 0 ? subtaskProgress(childTasks) : null;

  return (
    <>
      <div
        ref={setNodeRef}
        className={
          "tasks-card" +
          (localCompleted ? " tasks-card--done" : "") +
          (isNested ? " tasks-card--nested" : "") +
          (isDragging ? " tasks-card--dragging" : "") +
          (isOver ? " tasks-card--nest-target" : "")
        }
        onClick={() => onEdit(task)}
      >
        <div className="tasks-card-thumb" style={{ background: visual.gradient }}>
          <visual.Icon size={22} aria-hidden="true" />
        </div>
        <div className="tasks-card-body">
          <span className="tasks-card-title">
            {task.title}
            {progress && (
              <span
                className="tasks-card-progress-badge"
                aria-label={`${progress.done} of ${progress.total} subtasks complete`}
              >
                {progress.done}/{progress.total}
              </span>
            )}
          </span>
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
        <span
          className="tasks-card-drag-handle"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Drag to reorder or nest "${task.title}"`}
        >
          <GripVertical size={16} aria-hidden="true" />
        </span>
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
      {childTasks && childTasks.length > 0 && (
        <div className="tasks-card-children">
          {childTasks.map((child) => (
            <TaskCard
              key={child.id}
              task={child}
              goals={goals}
              onEdit={onEdit}
              onToggle={onToggle}
              isNested
            />
          ))}
        </div>
      )}
    </>
  );
}
