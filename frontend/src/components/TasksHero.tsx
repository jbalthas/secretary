import type { Task } from "../types/task";
import type { Goal } from "../types/goal";
import { resolveCategory, categoryVisual } from "../lib/taskCategory";

interface Props {
  task: Task;
  goals: Goal[];
  onStart: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

export default function TasksHero({ task, goals, onStart }: Props) {
  const visual = categoryVisual(resolveCategory(task, goals));
  const metaLine = task.estimated_minutes
    ? `~${task.estimated_minutes} min`
    : PRIORITY_LABELS[task.priority] ?? task.priority;

  return (
    <div className="tasks-hero" aria-label="Focus now">
      <div className="tasks-hero-cover" style={{ background: visual.gradient }}>
        <visual.Icon className="tasks-hero-cover-icon" size={64} aria-hidden="true" />
      </div>
      <div className="tasks-hero-body">
        <p className="tasks-hero-label">FOCUS</p>
        <p className="tasks-hero-title">{task.title}</p>
        <p className="tasks-hero-meta">{metaLine}</p>
        <button className="tasks-hero-action" onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  );
}
