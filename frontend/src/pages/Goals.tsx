import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ChevronLeft } from "lucide-react";
import { useGoals } from "../hooks/useGoals";
import { useTasks } from "../hooks/useTasks";
import GoalDrawer from "../components/GoalDrawer";
import TaskDrawer from "../components/TaskDrawer";
import TaskRow from "../components/TaskRow";
import FAB from "../components/FAB";
import type { Goal, GoalCreate, GoalUpdate, GoalType } from "../types/goal";
import type { Task, TaskCreate } from "../types/task";

type Filter = "active" | "archived";

const TYPE_LABELS: Record<GoalType, string> = {
  career: "Career",
  life: "Life",
  health: "Health",
  learning: "Learning",
  financial: "Financial",
};

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="progress-bar-track"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Goals() {
  const navigate = useNavigate();
  const { goals, refresh: refreshGoals, createGoal, patchGoal } = useGoals();
  const { tasks, createTask, patchTask, deleteTask } = useTasks();

  const [filter, setFilter] = useState<Filter>("active");
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");

  const selectedGoal =
    selectedGoalId !== null ? goals.find((g) => g.id === selectedGoalId) : undefined;

  async function handleGoalSave(body: GoalCreate | GoalUpdate, id?: number) {
    if (id !== undefined) {
      await patchGoal(id, body);
    } else {
      await createGoal(body as GoalCreate);
    }
  }

  async function handleTaskSave(body: TaskCreate, id?: number) {
    if (id !== undefined) {
      await patchTask(id, body);
    } else {
      await createTask(body);
    }
  }

  async function toggleMilestone(goalId: number, msId: number, done: boolean) {
    await fetch(`/api/v1/goals/${goalId}/milestones/${msId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    await refreshGoals();
  }

  async function addMilestone(goalId: number) {
    const title = newMilestoneTitle.trim();
    if (!title) return;
    await fetch(`/api/v1/goals/${goalId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setNewMilestoneTitle("");
    await refreshGoals();
  }

  // ----- DETAIL VIEW -----
  if (selectedGoalId !== null && selectedGoal) {
    const goal = selectedGoal;
    const linkedTasks = tasks.filter((t) => t.goal_id === goal.id);

    return (
      <div className="page">
        <div className="goal-row-header">
          <button
            type="button"
            className="drawer-close"
            aria-label="Back to Goals"
            onClick={() => setSelectedGoalId(null)}
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="page-title" style={{ flex: 1 }}>
            {goal.title}
          </h1>
          <button
            type="button"
            className="btn-text-accent"
            onClick={() => {
              setEditingGoal(goal);
              setDrawerOpen(true);
            }}
          >
            Edit
          </button>
        </div>

        {goal.list_name && (
          <div className="goal-row-header">
            <span className={`type-badge type-${goal.type}`}>{goal.list_name}</span>
          </div>
        )}

        <div className="section-label">Progress</div>
        <div className="goal-row-header">
          <span className="goal-row-pct">{goal.progress_pct}%</span>
        </div>
        <ProgressBar pct={goal.progress_pct} />

        <div className="section-label">Milestones</div>
        <div role="list">
          {goal.milestones.map((ms) => (
            <div className="milestone-row" role="listitem" key={ms.id}>
              <input
                type="checkbox"
                className="task-checkbox"
                checked={ms.done}
                aria-label={ms.done ? "Mark milestone not done" : "Mark milestone done"}
                onChange={(e) => toggleMilestone(goal.id, ms.id, e.target.checked)}
              />
              <span className={`milestone-row-title${ms.done ? " done" : ""}`}>
                {ms.title}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
          <input
            type="text"
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            placeholder="New milestone"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn-text-accent"
            onClick={() => addMilestone(goal.id)}
          >
            + Add milestone
          </button>
        </div>

        <div className="section-label">Linked Tasks</div>
        <div>
          {linkedTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onEdit={(tk) => {
                setEditingTask(tk);
                setTaskDrawerOpen(true);
              }}
              onToggle={(id, completed) => patchTask(id, { completed })}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: "16px", marginTop: "24px" }}>
          <button
            type="button"
            className="btn-text-accent"
            onClick={async () => {
              await patchGoal(goal.id, { status: "completed" });
              await refreshGoals();
            }}
          >
            Complete Goal
          </button>
          <button
            type="button"
            className="btn-text-destructive"
            onClick={() => setArchiveModalOpen(true)}
          >
            Archive Goal
          </button>
        </div>

        {archiveModalOpen && (
          <div className="confirm-modal-overlay">
            <div
              className="confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Archive goal?"
            >
              <h2>Archive goal?</h2>
              <p>
                The goal will be hidden from the active list. Your linked tasks and
                milestones are preserved.
              </p>
              <div className="confirm-modal-actions">
                <button
                  type="button"
                  className="btn-confirm-delete"
                  onClick={async () => {
                    await patchGoal(goal.id, { status: "archived" });
                    setArchiveModalOpen(false);
                    setSelectedGoalId(null);
                  }}
                >
                  Archive Goal
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setArchiveModalOpen(false)}
                >
                  Keep Goal
                </button>
              </div>
            </div>
          </div>
        )}

        <TaskDrawer
          open={taskDrawerOpen}
          task={editingTask}
          goals={goals}
          onClose={() => setTaskDrawerOpen(false)}
          onSave={handleTaskSave}
          onDelete={deleteTask}
        />

        <GoalDrawer
          open={drawerOpen}
          goal={editingGoal}
          onClose={() => setDrawerOpen(false)}
          onSave={handleGoalSave}
          onArchive={async (id) => {
            await patchGoal(id, { status: "archived" });
            setDrawerOpen(false);
            setSelectedGoalId(null);
          }}
        />
      </div>
    );
  }

  // ----- LIST VIEW -----
  const filtered = goals.filter((g) => g.status === filter);

  return (
    <div className="page">
      <div className="goal-row-header">
        <h1 className="page-title" style={{ flex: 1 }}>
          Goals
        </h1>
        <button
          type="button"
          className="btn-text-accent"
          onClick={() => navigate("/ingest")}
          style={{ display: "flex", alignItems: "center", gap: "4px" }}
        >
          <Upload size={16} />
          Import
        </button>
      </div>

      <div className="filter-tabs">
        <button
          className={`filter-tab${filter === "active" ? " active" : ""}`}
          onClick={() => setFilter("active")}
        >
          Active
        </button>
        <button
          className={`filter-tab${filter === "archived" ? " active" : ""}`}
          onClick={() => setFilter("archived")}
        >
          Archived
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          {filter === "active" ? (
            <>
              <h2>No goals yet</h2>
              <p>Tap + to create your first goal, or use Import to bring in goals from a plan.</p>
            </>
          ) : (
            <>
              <h2>No archived goals</h2>
              <p>Goals you archive will appear here.</p>
            </>
          )}
        </div>
      ) : (
        <div role="list">
          {filtered.map((g) => (
            <div
              className="goal-row"
              role="listitem"
              key={g.id}
              onClick={() => setSelectedGoalId(g.id)}
            >
              <div className="goal-row-header">
                <span className="goal-row-title">{g.title}</span>
                <span className={`type-badge type-${g.type}`}>{TYPE_LABELS[g.type]}</span>
                <span className="goal-row-pct">{g.progress_pct}%</span>
              </div>
              <ProgressBar pct={g.progress_pct} />
            </div>
          ))}
        </div>
      )}

      <FAB
        onClick={() => {
          setEditingGoal(null);
          setDrawerOpen(true);
        }}
      />

      <GoalDrawer
        open={drawerOpen}
        goal={editingGoal}
        onClose={() => setDrawerOpen(false)}
        onSave={handleGoalSave}
        onArchive={async (id) => {
          await patchGoal(id, { status: "archived" });
        }}
      />
    </div>
  );
}
