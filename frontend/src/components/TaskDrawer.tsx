import { useState, useEffect } from "react";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import type { Task, TaskCreate, Priority } from "../types/task";
import type { Goal } from "../types/goal";
import GoalSelect from "./GoalSelect";

interface Props {
  open: boolean;
  task: Task | null;
  goals: Goal[];
  onClose: () => void;
  onSave: (body: TaskCreate, id?: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const RECURRENCE_OPTIONS: { label: string; cron: string }[] = [
  { label: "Every day", cron: "0 9 * * *" },
  { label: "Every week", cron: "0 9 * * 1" },
  { label: "Every month", cron: "0 9 1 * *" },
];

function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function isoToTimeInput(iso?: string): string {
  if (!iso) return "";
  const t = iso.slice(11, 16);
  return t === "00:00" ? "" : t;
}

function isoToDatetimeLocal(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function combineDatetime(date: string, time: string): string | undefined {
  if (!date) return undefined;
  if (!time) return `${date}T00:00:00Z`;
  return `${date}T${time}:00Z`;
}

interface CollapsibleProps {
  label: string;
  children: React.ReactNode;
}

function Collapsible({ label, children }: CollapsibleProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="collapsible-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
}

export default function TaskDrawer({ open, task, goals, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [goalId, setGoalId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [description, setDescription] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [recurrenceMode, setRecurrenceMode] = useState<"preset" | "custom">("preset");
  const [recurrencePreset, setRecurrencePreset] = useState("");
  const [recurrenceCustom, setRecurrenceCustom] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setPriority(task?.priority ?? "medium");
      setGoalId(task?.goal_id ?? null);
      setDueDate(isoToDateInput(task?.due_date));
      setDueTime(isoToTimeInput(task?.due_date));
      setDescription(task?.description ?? "");
      setReminderAt(isoToDatetimeLocal(task?.reminder_at));
      const cron = task?.recurrence_cron ?? "";
      const preset = RECURRENCE_OPTIONS.find((o) => o.cron === cron);
      if (cron && !preset) {
        setRecurrenceMode("custom");
        setRecurrenceCustom(cron);
        setRecurrencePreset("");
      } else {
        setRecurrenceMode("preset");
        setRecurrencePreset(cron);
        setRecurrenceCustom("");
      }
      setShowConfirm(false);
    }
  }, [open, task]);

  async function handleSave() {
    const body: TaskCreate = {
      title,
      priority,
      due_date: combineDatetime(dueDate, dueTime),
      goal_id: goalId,
      description: description || undefined,
      reminder_at: reminderAt ? `${reminderAt}:00Z` : undefined,
      recurrence_cron:
        recurrenceMode === "custom"
          ? recurrenceCustom || undefined
          : recurrencePreset || undefined,
    };
    await onSave(body, task?.id);
    onClose();
  }

  async function handleDelete() {
    if (task) {
      await onDelete(task.id);
      onClose();
    }
  }

  return (
    <>
      <div
        className={`backdrop${open ? " open" : ""}`}
        onClick={onClose}
      />
      <div className={`drawer${open ? " open" : ""}`} role="dialog" aria-modal="true">
        <div className="drawer-header">
          <h2 className="drawer-title">{task ? "Edit task" : "New task"}</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="drawer-field">
            <label htmlFor="task-title">Title</label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>

          <div className="drawer-field">
            <label>Priority</label>
            <div className="segmented-control">
              {(["high", "medium", "low"] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={priority === p ? "active" : ""}
                  onClick={() => setPriority(p)}
                >
                  {p === "high" ? "High" : p === "medium" ? "Med" : "Low"}
                </button>
              ))}
            </div>
          </div>

          <div className="drawer-field">
            <label>Goal</label>
            <GoalSelect goals={goals} value={goalId} onChange={setGoalId} />
          </div>

          <div className="drawer-field">
            <label>Due date</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <Collapsible label="Description">
            <div className="drawer-field">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
              />
            </div>
          </Collapsible>

          <Collapsible label="Remind me at">
            <div className="drawer-field">
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
              />
            </div>
          </Collapsible>

          <Collapsible label="Repeat">
            <div className="drawer-field">
              <div className="segmented-control" style={{ flexWrap: "wrap" }}>
                {RECURRENCE_OPTIONS.map((o) => (
                  <button
                    key={o.cron}
                    type="button"
                    className={
                      recurrenceMode === "preset" && recurrencePreset === o.cron
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setRecurrenceMode("preset");
                      setRecurrencePreset(o.cron);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={recurrenceMode === "custom" ? "active" : ""}
                  onClick={() => setRecurrenceMode("custom")}
                >
                  Custom (cron)
                </button>
              </div>
              {recurrenceMode === "custom" && (
                <input
                  type="text"
                  value={recurrenceCustom}
                  onChange={(e) => setRecurrenceCustom(e.target.value)}
                  placeholder="e.g. 0 9 * * *"
                  style={{ marginTop: "8px", width: "100%" }}
                />
              )}
            </div>
          </Collapsible>

          <button type="button" className="btn-save" onClick={handleSave}>
            Save task
          </button>

          {task && (
            <button
              type="button"
              className="btn-delete"
              onClick={() => setShowConfirm(true)}
            >
              Delete task
            </button>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h2>Delete task?</h2>
            <p>This can't be undone.</p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={handleDelete}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
