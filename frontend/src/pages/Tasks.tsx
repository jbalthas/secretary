import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useTasks } from "../hooks/useTasks";
import { useGoals } from "../hooks/useGoals";
import { useTaskLists } from "../hooks/useTaskLists";
import TaskCard from "../components/TaskCard";
import TasksHero from "../components/TasksHero";
import MomentumRing from "../components/MomentumRing";
import TaskDrawer from "../components/TaskDrawer";
import FAB from "../components/FAB";
import GroupTileGrid from "../components/GroupTileGrid";
import { buildTaskFilters, taskMatchesFilter } from "../lib/taskFilters";
import { groupTasksByParent } from "../lib/taskHierarchy";
import type { Task, TaskCreate, Priority } from "../types/task";

type Filter = "pending" | "completed";
type Sort = "due" | "priority";

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function sortTasks(tasks: Task[], sort: Sort): Task[] {
  return [...tasks].sort((a, b) => {
    if (sort === "due") {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    // priority
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

export default function Tasks() {
  const navigate = useNavigate();
  const { tasks, createTask, patchTask, deleteTask } = useTasks();
  const { goals } = useGoals();
  const { listGroups, refresh: refreshLists } = useTaskLists();
  const [filter, setFilter] = useState<Filter>("pending");
  const [sort, setSort] = useState<Sort>("due");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"grid" | "drill">("grid");
  const [unsorted, setUnsorted] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const taskFilters = buildTaskFilters(tasks, goals);
  const activeTaskFilter = taskFilters.find(
    (taskFilter) => taskFilter.key === activeFilterKey
  );
  const listFiltered = unsorted
    ? tasks.filter((task) => !task.goal_id && !task.parent_list_name && !task.list_name)
    : activeTaskFilter
    ? tasks.filter((task) => taskMatchesFilter(task, activeTaskFilter, goals))
    : tasks;
  const filtered = listFiltered.filter((t) =>
    filter === "pending" ? !t.completed : t.completed
  );
  const sorted = sortTasks(filtered, sort);
  const { parents, childrenByParentId } = groupTasksByParent(sorted);

  // Momentum ring covers the active-chip set across both tabs (listFiltered), not just the visible tab.
  const momentumTotal = listFiltered.length;
  const momentumDone = listFiltered.filter((t) => t.completed).length;

  // Hero surfaces the top of the post-grouping parent set; hidden in Completed view / when empty.
  // Derived from `parents` (not `sorted[0]`) so a nested child never renders twice — once as hero,
  // once nested under its own parent's card.
  const heroTask = filter === "pending" && parents.length > 0 ? parents[0] : null;

  async function handleSave(body: TaskCreate, id?: number) {
    if (id !== undefined) {
      await patchTask(id, body);
    } else {
      await createTask(body);
    }
    await refreshLists();
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDragError(null);
    const draggedId = Number(event.active.id);
    if (!event.over) {
      const dragged = tasks.find((t) => t.id === draggedId);
      if (dragged?.parent_task_id != null) {
        try {
          await patchTask(dragged.id, { parent_task_id: null });
        } catch {
          setDragError("Couldn't un-nest task — try again");
        }
      }
      return;
    }
    const targetId = Number(event.over.id);
    if (targetId !== draggedId) {
      try {
        await patchTask(draggedId, { parent_task_id: targetId });
      } catch {
        setDragError("Couldn't nest task — try again");
      }
    }
  }

  function backToGrid() {
    setMode("grid");
    setActiveFilterKey(null);
    setUnsorted(false);
  }

  return (
    <div className="page tasks-page">
      {mode === "grid" ? (
        <>
          <div className="tasks-header">
            <h1 className="page-title">Tasks</h1>
            <button
              type="button"
              className="btn-text-accent"
              onClick={() => navigate("/ingest/tasks")}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <Upload size={16} />
              Import
            </button>
            <MomentumRing done={momentumDone} total={momentumTotal} />
          </div>

          <GroupTileGrid
            tasks={tasks}
            goals={goals}
            onSelect={(key) => {
              const isUnsorted = key === "__unsorted__";
              setActiveFilterKey(isUnsorted ? null : key);
              setUnsorted(isUnsorted);
              setMode("drill");
            }}
          />
        </>
      ) : (
        <>
          <button className="tasks-back-button" onClick={backToGrid}>
            <ArrowLeft size={16} />
            All groups
          </button>

          <div className="tasks-header">
            <h1 className="page-title">Tasks</h1>
            <MomentumRing done={momentumDone} total={momentumTotal} />
          </div>

          {heroTask && (
            <TasksHero
              task={heroTask}
              goals={goals}
              onStart={() => {
                setEditingTask(heroTask);
                setDrawerOpen(true);
              }}
            />
          )}

          {taskFilters.length > 0 && (
            <div className="list-filter-panel">
              <button
                className={"list-chip" + (!activeFilterKey && !unsorted ? " active" : "")}
                onClick={() => {
                  setActiveFilterKey(null);
                  setUnsorted(false);
                }}
              >All</button>
              {taskFilters
                .filter((item) => item.kind === "parent-list")
                .map((parentFilter) => {
                  const children = taskFilters.filter(
                    (item) => item.kind === "list" && item.parentName === parentFilter.label
                  );
                  return (
                    <div className="list-filter-group" key={parentFilter.key}>
                      <button
                        className={"list-chip list-chip-parent" + (activeFilterKey === parentFilter.key ? " active" : "")}
                        onClick={() => {
                          setActiveFilterKey(parentFilter.key);
                          setUnsorted(false);
                        }}
                      >{parentFilter.label}</button>
                      {children.length > 0 && (
                        <div className="list-filter-children">
                          {children.map((child) => (
                            <button
                              key={child.key}
                              className={"list-chip list-chip-child" + (activeFilterKey === child.key ? " active" : "")}
                              onClick={() => {
                                setActiveFilterKey(child.key);
                                setUnsorted(false);
                              }}
                            >{child.label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              {taskFilters.some((item) => item.kind === "goal") && (
                <div className="list-filter-group list-filter-goals">
                  <span className="list-filter-label">Goals</span>
                  <div className="list-filter-children">
                    {taskFilters.filter((item) => item.kind === "goal").map((goalFilter) => (
                      <button
                        key={goalFilter.key}
                        className={"list-chip list-chip-child" + (activeFilterKey === goalFilter.key ? " active" : "")}
                        onClick={() => {
                          setActiveFilterKey(goalFilter.key);
                          setUnsorted(false);
                        }}
                      >{goalFilter.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="filter-sort-row">
            <div className="filter-tabs">
              <button
                className={`filter-tab${filter === "pending" ? " active" : ""}`}
                onClick={() => setFilter("pending")}
              >
                Pending
              </button>
              <button
                className={`filter-tab${filter === "completed" ? " active" : ""}`}
                onClick={() => setFilter("completed")}
              >
                Completed
              </button>
            </div>
            <select
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort"
            >
              <option value="due">Sort: Due date</option>
              <option value="priority">Sort: Priority</option>
            </select>
          </div>

          {sorted.length === 0 ? (
            <div className="empty-state">
              {filter === "pending" ? (
                <>
                  <h2>No tasks yet</h2>
                  <p>Tap + to add your first task.</p>
                </>
              ) : (
                <>
                  <h2>Nothing completed yet</h2>
                  <p>Finish a task and it will appear here.</p>
                </>
              )}
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {dragError && <div className="tasks-card-error">{dragError}</div>}
              <div className="tasks-card-grid">
                {parents.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    goals={goals}
                    childTasks={childrenByParentId.get(task.id)}
                    onEdit={(t) => {
                      setEditingTask(t);
                      setDrawerOpen(true);
                    }}
                    onToggle={(id, completed) => patchTask(id, { completed })}
                  />
                ))}
              </div>
            </DndContext>
          )}
        </>
      )}

      <FAB
        onClick={() => {
          setEditingTask(null);
          setDrawerOpen(true);
        }}
      />

      <TaskDrawer
        open={drawerOpen}
        task={editingTask}
        goals={goals}
        tasks={tasks}
        listGroups={listGroups}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        onDelete={deleteTask}
      />
    </div>
  );
}
