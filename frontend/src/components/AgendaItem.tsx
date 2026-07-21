import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import type { AgendaItem as AgendaItemType } from "../types/task";
import { subtaskProgress } from "../lib/taskHierarchy";

interface Props {
  item: AgendaItemType;
  onToggle: (item: AgendaItemType, completed: boolean) => Promise<void>;
  onSetParent?: (item: AgendaItemType, parentTaskId: number | null) => Promise<void>;
  childItems?: AgendaItemType[];
  errorsById?: Record<string, string>;
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

export default function AgendaItem({ item, onToggle, onSetParent, childItems, errorsById }: Props) {
  const [localCompleted, setLocalCompleted] = useState(item.completed);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const timeLabel = item.time ? formatTime(item.time) : null;

  const isUnsavedPlannedBlock = item.isBlock && item.blockId == null;

  // Drag-and-drop nesting (D-01 through D-10) is only wired when a caller
  // supplies onSetParent — TodayTimeline passes it, but the "Later this
  // week" DaySection view (Today.tsx) does not, keeping that surface
  // unaffected per this phase's scope note.
  const dragDropEnabled = !!onSetParent;
  const canBeNestTarget =
    dragDropEnabled && !item.isEvent && item.taskId != null && !item.isBlock && item.parentTaskId == null;

  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({ id: item.id, disabled: !dragDropEnabled || item.isEvent });
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: item.id,
    disabled: !dragDropEnabled || item.isEvent,
  });

  function setNodeRef(el: HTMLElement | null) {
    setDragNodeRef(el);
    setDropNodeRef(el);
  }

  async function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (isUnsavedPlannedBlock) return;
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

  const progress = childItems && childItems.length > 0 ? subtaskProgress(childItems) : null;
  const errorMessage = errorsById?.[item.id] ?? null;

  const rowClassName = [
    item.isEvent ? "agenda-item--event" : "",
    isDragging ? "timeline-row--dragging" : "",
    canBeNestTarget && isOver ? "timeline-row--nest-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div ref={setNodeRef} style={rowStyle} className={rowClassName || undefined}>
        {dragDropEnabled && !item.isEvent && (
          <span
            className="drag-handle"
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Drag to reorder or nest "${item.title}"`}
          >
            <GripVertical size={16} aria-hidden="true" />
          </span>
        )}
        <input
          type="checkbox"
          checked={localCompleted}
          disabled={isUnsavedPlannedBlock}
          aria-label={
            localCompleted
              ? `Mark '${item.title}' incomplete`
              : `Mark '${item.title}' complete`
          }
          onChange={handleToggle}
          onClick={(e) => e.stopPropagation()}
          className="task-checkbox"
        />
        <span style={titleStyle}>
          {item.title}
          {progress && (
            <span
              className="subtask-progress-badge"
              aria-label={`${progress.done} of ${progress.total} subtasks complete`}
            >
              {progress.done}/{progress.total}
            </span>
          )}
        </span>
        {childItems && childItems.length > 0 && (
          <button
            type="button"
            className="subtask-collapse-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            aria-label={
              collapsed
                ? `Expand subtasks of "${item.title}"`
                : `Collapse subtasks of "${item.title}"`
            }
          >
            {collapsed ? (
              <ChevronRight size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
        )}
        {item.overdue && (
          <span className="overdue-badge" aria-label="Overdue">Overdue</span>
        )}
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
      {errorMessage && <div className="agenda-item-error">{errorMessage}</div>}
      {childItems && childItems.length > 0 && !collapsed && (
        <div className="timeline-children">
          {childItems.map((child) => (
            <AgendaItem
              key={child.id}
              item={child}
              onToggle={onToggle}
              onSetParent={onSetParent}
              errorsById={errorsById}
            />
          ))}
        </div>
      )}
    </>
  );
}
