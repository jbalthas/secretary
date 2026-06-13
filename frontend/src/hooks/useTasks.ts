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
    await fetch(API + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  async function patchTask(id: number, body: Partial<Task>) {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  async function deleteTask(id: number) {
    await fetch(`${API}/${id}`, { method: "DELETE" });
    await refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  return { tasks, refresh, createTask, patchTask, deleteTask };
}
