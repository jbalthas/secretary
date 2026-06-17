import { useState } from "react";
import type { AgendaItem as AgendaItemType } from "../types/task";

interface Props {
  item: AgendaItemType;
  onToggle: (item: AgendaItemType, completed: boolean) => Promise<void>;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const date = new Date(0);
  date.setUTCHours(h, m);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

export default function AgendaItem({ item, onToggle }: Props) {
  const [localCompleted, setLocalCompleted] = useState(item.completed);
  const [error, setError] = useState<string | null>(null);

  const timeLabel = item.time ? formatTime(item.time) : null;

  const isPlannedBlock = item.isBlock && item.taskId == null && item.googleId == null;

  async function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (isPlannedBlock) return;
    const newValue = !localCompleted;
    setLocalCompleted(newValue);
    setError(null);
    try {
      await onToggle(item, newValue);
    } catch {
      setLocalCompleted(!newValue);
      setError("Couldn't save — try again");
    }
  }

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 0",
    minHeight: 48,
    borderBottom: "1px solid var(--border)",
    opacity: localCompleted ? 0.5 : 1,
  };

  const titleStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 16,
    fontStyle: item.isEvent ? "italic" : "normal",
    color: "var(--text)",
    textDecoration: localCompleted ? "line-through" : "none",
  };

  const timeStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--text-secondary)",
    flexShrink: 0,
  };

  return (
    <div style={rowStyle} className={item.isEvent ? "agenda-item--event" : undefined}>
      <input
        type="checkbox"
        checked={localCompleted}
        disabled={isPlannedBlock}
        aria-label={
          localCompleted
            ? `Mark '${item.title}' incomplete`
            : `Mark '${item.title}' complete`
        }
        onChange={handleToggle}
        onClick={(e) => e.stopPropagation()}
        className="task-checkbox"
      />
      <span style={titleStyle}>{item.title}</span>
      {!item.isEvent && item.priority && (
        <span
          className={`priority-badge priority-${item.priority}`}
          aria-label={`Priority: ${item.priority}`}
        >
          {item.priority === "high" ? "High" : item.priority === "medium" ? "Med" : "Low"}
        </span>
      )}
      {item.isBlock && (
        <span style={{ fontSize: 11, background: "var(--accent)", color: "#fff", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>Planned</span>
      )}
      {item.conflict_with && (
        <span style={{ fontSize: 11, background: "var(--destructive, #ef4444)", color: "#fff", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }} title={`Conflicts with: ${item.conflict_with}`}>! {item.conflict_with}</span>
      )}
      {timeLabel && <span style={timeStyle}>{timeLabel}</span>}
      {error && <span style={{ fontSize: 12, color: "var(--error, red)" }}>{error}</span>}
    </div>
  );
}
