import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Goal, GoalCreate, GoalUpdate, GoalType } from "../types/goal";
import type { TaskListGroup } from "../types/taskList";

interface Props {
  open: boolean;
  goal: Goal | null;
  listGroups: TaskListGroup[];
  onClose: () => void;
  onSave: (body: GoalCreate | GoalUpdate, id?: number) => Promise<void>;
  onArchive: (id: number) => Promise<void>;
}

const TYPE_OPTIONS: { value: GoalType; label: string }[] = [
  { value: "career", label: "Career" },
  { value: "life", label: "Life" },
  { value: "health", label: "Health" },
  { value: "learning", label: "Learning" },
  { value: "financial", label: "Financial" },
];

export default function GoalDrawer({ open, goal, listGroups, onClose, onSave, onArchive }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<GoalType>("career");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [parentListName, setParentListName] = useState("");
  const [listName, setListName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(goal?.title ?? "");
      setType(goal?.type ?? "career");
      setDescription(goal?.description ?? "");
      setTargetDate(goal?.target_date ?? "");
      setParentListName(goal?.parent_list_name ?? "");
      setListName(goal?.list_name ?? "");
      setShowConfirm(false);
    }
  }, [open, goal]);

  async function handleSave() {
    const body: GoalCreate | GoalUpdate = {
      title,
      type,
      description: description || undefined,
      target_date: targetDate || undefined,
      list_name: listName || null,
      parent_list_name: parentListName || null,
    };
    await onSave(body, goal?.id);
    onClose();
  }

  async function handleArchive() {
    if (goal) {
      await onArchive(goal.id);
      onClose();
    }
  }

  return (
    <>
      <div className={`backdrop${open ? " open" : ""}`} onClick={onClose} />
      <div
        className={`drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={goal ? "Edit Goal" : "New Goal"}
      >
        <div className="drawer-header">
          <h2 className="drawer-title">{goal ? "Edit Goal" : "New Goal"}</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="drawer-field">
            <label htmlFor="goal-title">Title</label>
            <input
              id="goal-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Goal title"
            />
          </div>

          <div className="drawer-field">
            <label>Type</label>
            <div className="segmented-control" style={{ flexWrap: "wrap" }}>
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={type === o.value ? "active" : ""}
                  onClick={() => setType(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="drawer-field">
            <label htmlFor="goal-description">Description</label>
            <textarea
              id="goal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add context or description"
            />
          </div>

          <div className="drawer-field">
            <label htmlFor="goal-target-date">Target date</label>
            <input
              id="goal-target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className="drawer-field">
            <label htmlFor="goal-parent-list">Umbrella list</label>
            <input
              id="goal-parent-list"
              type="text"
              list="goal-parent-list-options"
              value={parentListName}
              onChange={(e) => setParentListName(e.target.value)}
              placeholder="e.g. Career"
              autoComplete="off"
            />
            <datalist id="goal-parent-list-options">
              {listGroups.map((group) => <option key={group.name} value={group.name} />)}
            </datalist>
          </div>

          <div className="drawer-field">
            <label htmlFor="goal-list">Sub-list</label>
            <input
              id="goal-list"
              type="text"
              list="goal-list-options"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder={parentListName ? "e.g. Robotics" : "Optional standalone list"}
              autoComplete="off"
            />
            <datalist id="goal-list-options">
              {listGroups
                .filter((group) => !parentListName || group.name === parentListName)
                .flatMap((group) => group.children)
                .map((name) => <option key={name} value={name} />)}
            </datalist>
            <small className="field-hint">Tasks linked to this goal inherit both levels.</small>
          </div>

          <button type="button" className="btn-save" onClick={handleSave}>
            Save Goal
          </button>

          {goal && (
            <button
              type="button"
              className="btn-delete"
              onClick={() => setShowConfirm(true)}
            >
              Archive Goal
            </button>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-label="Archive goal?">
            <h2>Archive goal?</h2>
            <p>
              The goal will be hidden from the active list. Your linked tasks and
              milestones are preserved.
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={handleArchive}
              >
                Archive Goal
              </button>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowConfirm(false)}
              >
                Keep Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
