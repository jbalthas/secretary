import { useEffect, useState } from "react";
import type { Task, TaskCreate } from "../types/task";

const API = "/api/v1/tasks";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);

  async function refresh() {
    const res = await fetch(API + "/");
    setTasks(await res.json());
  }

  async function createTask(body: TaskCreate) {
    const res = await fetch(API + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Could not create task");
    await refresh();
  }
  async function patchTask(id: number, body: Partial<Task>) {
    const res = await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Could not update task");
    await refresh();
  }

  async function deleteTask(id: number) {
    const res = await fetch(`${API}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Could not delete task");
    await refresh();
  }
  useEffect(() => {
    refresh();
  }, []);

  return { tasks, refresh, createTask, patchTask, deleteTask };
}
