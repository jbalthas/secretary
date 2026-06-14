import { useEffect, useState } from "react";
import type { Routine, RoutineInput } from "../types/routine";

const BASE = "/api/v1/routines";

export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) setRoutines(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function create(body: RoutineInput): Promise<boolean> {
    const res = await fetch(`${BASE}/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { await refresh(); return true; }
    return false;
  }

  async function update(id: number, body: Partial<RoutineInput>): Promise<boolean> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { await refresh(); return true; }
    return false;
  }

  async function remove(id: number): Promise<boolean> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
    if (res.ok) { await refresh(); return true; }
    return false;
  }

  return { routines, loading, create, update, remove, refresh };
}
