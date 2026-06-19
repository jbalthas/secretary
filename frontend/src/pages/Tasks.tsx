import { useState } from "react";
import { useTasks } from "../hooks/useTasks";
import { useGoals } from "../hooks/useGoals";
import { useTaskLists } from "../hooks/useTaskLists";
import TaskRow from "../components/TaskRow";
import TaskDrawer from "../components/TaskDrawer";
import FAB from "../components/FAB";
import { buildTaskFilters, taskMatchesFilter } from "../lib/taskFilters";
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
  const { tasks, createTask, patchTask, deleteTask } = useTasks();
  const { goals } = useGoals();
  const { listGroups, refresh: refreshLists } = useTaskLists();
  const [filter, setFilter] = useState<Filter>("pending");
  const [sort, setSort] = useState<Sort>("due");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(null);

  const taskFilters = buildTaskFilters(tasks, goals);
  const activeTaskFilter = taskFilters.find(
    (taskFilter) => taskFilter.key === activeFilterKey
  );
  const listFiltered = activeTaskFilter
    ? tasks.filter((task) => taskMatchesFilter(task, activeTaskFilter, goals))
    : tasks;
  const filtered = listFiltered.filter((t) =>
    filter === "pending" ? !t.completed : t.completed
  );
  const sorted = sortTasks(filtered, sort);

  async function handleSave(body: TaskCreate, id?: number) {
    if (id !== undefined) {
      await patchTask(id, body);
    } else {
      await createTask(body);
    }
    await refreshLists();
  }

  return (
    <div className="page">
      <h1 className="page-title">Tasks</h1>

      {taskFilters.length > 0 && (
        <div className="list-filter-panel">
          <button
            className={"list-chip" + (!activeFilterKey ? " active" : "")}
            onClick={() => setActiveFilterKey(null)}
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
                    onClick={() => setActiveFilterKey(parentFilter.key)}
                  >{parentFilter.label}</button>
                  {children.length > 0 && (
                    <div className="list-filter-children">
                      {children.map((child) => (
                        <button
                          key={child.key}
                          className={"list-chip list-chip-child" + (activeFilterKey === child.key ? " active" : "")}
                          onClick={() => setActiveFilterKey(child.key)}
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
                    onClick={() => setActiveFilterKey(goalFilter.key)}
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
        <div>
          {sorted.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onEdit={(t) => {
                setEditingTask(t);
                setDrawerOpen(true);
              }}
              onToggle={(id, completed) => patchTask(id, { completed })}
            />
          ))}
        </div>
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
        listGroups={listGroups}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        onDelete={deleteTask}
      />
    </div>
  );
}
