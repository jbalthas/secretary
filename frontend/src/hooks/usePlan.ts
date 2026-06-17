import { useEffect, useState } from "react";
import type { ProposedBlock, ProposedDayPlan, ScheduledBlock } from "../types/plan";

const API = "/api/v1/plan";

export function usePlan(dateKey: string) {
  const [blocks, setBlocks] = useState<ScheduledBlock[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchBlocks() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/blocks?date=${dateKey}`);
      setBlocks(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }

  async function propose(date: string): Promise<ProposedDayPlan | null> {
    const res = await fetch(`${API}/propose?date=${date}`);
    return res.ok ? await res.json() : null;
  }

  async function approve(date: string, blocks: ProposedBlock[]): Promise<ScheduledBlock[] | null> {
    const res = await fetch(`${API}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, blocks }),
    });
    if (res.status === 409) throw new Error("already_approved");
    return res.ok ? await res.json() : null;
  }

  async function replan(date: string, blocks: ProposedBlock[]): Promise<ScheduledBlock[]> {
    const res = await fetch(`${API}/replan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, blocks }),
    });
    return await res.json();
  }

  async function deleteBlock(id: number) {
    await fetch(`${API}/blocks/${id}`, { method: "DELETE" });
    await fetchBlocks();
  }

  useEffect(() => {
    fetchBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  return { blocks, loading, fetchBlocks, propose, approve, replan, deleteBlock };
}
