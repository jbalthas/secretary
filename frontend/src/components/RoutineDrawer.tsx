import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Routine, RoutineInput, RoutineAction } from "../types/routine";
import type { Goal } from "../types/goal";
import GoalSelect from "./GoalSelect";

interface Props {
  open: boolean;
  routine: Routine | null;
  goals: Goal[];
  onClose: () => void;
  onSave: (body: RoutineInput, id?: number) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}

export default function RoutineDrawer({ open, routine, goals, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState("");
  const [cron, setCron] = useState("");
  const [action, setAction] = useState<RoutineAction>("send_daily_brief");
  const [goalId, setGoalId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(routine?.name ?? "");
      setCron(routine?.cron ?? "");
      setAction(routine?.action ?? "send_daily_brief");
      setGoalId(routine?.goal_id ?? null);
      setSaving(false);
      setSaveError(null);
      setCronError(null);
      setShowConfirm(false);
      setDeleteError(null);
    }
  }, [open, routine]);

  function validateCron(value: string): boolean {
    const parts = value.trim().split(/\s+/);
    return parts.length === 5;
  }

  async function handleSave() {
    setCronError(null);
    setSaveError(null);
    if (!validateCron(cron)) {
      setCronError("Enter a valid cron expression (e.g. 0 8 * * *).");
      return;
    }
    setSaving(true);
    try {
      const body: RoutineInput = { name, cron: cron.trim(), action, goal_id: goalId };
      const ok = await onSave(body, routine?.id);
      if (ok) {
        onClose();
      } else {
        setSaveError("Failed to save routine. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!routine) return;
    setDeleteError(null);
    const ok = await onDelete(routine.id);
    if (ok) {
      setShowConfirm(false);
      onClose();
    } else {
      setDeleteError("Failed to delete routine. Check your connection and try again.");
    }
  }

  return (
    <>
      <div className={`backdrop${open ? " open" : ""}`} onClick={onClose} />
      <div className={`drawer${open ? " open" : ""}`} role="dialog" aria-modal="true">
        <div className="drawer-header">
          <h2 className="drawer-title">{routine ? "Edit Routine" : "Add Routine"}</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="drawer-field">
            <label htmlFor="routine-name">Name</label>
            <input
              id="routine-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Morning stretch reminder"'
              maxLength={80}
              required
            />
          </div>

          <div className="drawer-field">
            <label htmlFor="routine-cron">Cron schedule</label>
            <input
              id="routine-cron"
              type="text"
              value={cron}
              onChange={(e) => { setCron(e.target.value); setCronError(null); }}
              placeholder='e.g. "0 8 * * *"'
              required
            />
            {cronError && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--destructive)" }}>
                {cronError}
              </p>
            )}
          </div>

          <div className="drawer-field">
            <label htmlFor="routine-action">Action</label>
            <select
              id="routine-action"
              value={action}
              onChange={(e) => setAction(e.target.value as RoutineAction)}
            >
              <option value="send_daily_brief">Send daily brief notification</option>
            </select>
          </div>

          <div className="drawer-field">
            <label htmlFor="routine-goal">Goal</label>
            <GoalSelect goals={goals} value={goalId} onChange={setGoalId} />
          </div>

          {saveError && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--destructive)" }}>
              {saveError}
            </p>
          )}

          <button
            type="button"
            className="btn-save"
            onClick={handleSave}
            disabled={saving}
            style={{ opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving…" : "Save Routine"}
          </button>

          {routine && (
            <button
              type="button"
              className="btn-delete"
              onClick={() => setShowConfirm(true)}
            >
              Delete Routine
            </button>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" role="alertdialog">
            <h2>Delete routine?</h2>
            <p>This routine will stop firing and cannot be recovered.</p>
            {deleteError && (
              <p style={{ fontSize: 12, color: "var(--destructive)", margin: "0 0 8px" }}>
                {deleteError}
              </p>
            )}
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={handleDelete}
              >
                Delete Routine
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
