import { useEffect, useState } from "react";
import type { Goal, GoalCreate, GoalUpdate } from "../types/goal";

const API = "/api/v1/goals";

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);

  async function refresh() {
    const res = await fetch(API + "/");
    setGoals(await res.json());
  }

  async function createGoal(body: GoalCreate) {
    await fetch(API + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  async function patchGoal(id: number, body: Partial<GoalUpdate>) {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  return { goals, refresh, createGoal, patchGoal };
}
