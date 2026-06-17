import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePlan } from "../hooks/usePlan";
import { useTasks } from "../hooks/useTasks";
import { useWorkHours } from "../hooks/useWorkHours";
import type { ProposedBlock } from "../types/plan";

type Phase = "loading" | "approved" | "proposing" | "editing" | "fully_booked" | "saving" | "done";

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function isAfterWorkHours(workEnd: string | null): boolean {
  if (!workEnd) return false;
  const now = new Date();
  const [h, m] = workEnd.split(":").map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  return now >= end;
}

function withStartAndDuration(block: ProposedBlock, timeStr: string, minutes: number): ProposedBlock {
  const start = new Date(block.start_dt);
  const [h, m] = timeStr.split(":").map(Number);
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + Math.max(1, minutes) * 60000);
  return { ...block, start_dt: start.toISOString(), end_dt: end.toISOString() };
}

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 12,
  marginBottom: 10,
};

const smallBtn: React.CSSProperties = {
  minWidth: 40,
  minHeight: 40,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 16,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  padding: "8px 10px",
  fontSize: 16,
};

export default function Organize() {
  const todayKey = localDateKey(new Date());
  const { blocks, loading, fetchBlocks, propose, approve, replan } = usePlan(todayKey);
  const { tasks } = useTasks();
  const { workEnd } = useWorkHours();

  const [phase, setPhase] = useState<Phase>("loading");
  const [draftBlocks, setDraftBlocks] = useState<ProposedBlock[]>([]);
  const [unplacedTaskIds, setUnplacedTaskIds] = useState<number[]>([]);
  const [isReplan, setIsReplan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proposedOnce = useRef(false);

  async function startProposal(replanMode: boolean) {
    setError(null);
    setPhase("proposing");
    const result = await propose(todayKey);
    if (!result) {
      setError("Could not generate a plan. Try again.");
      setPhase(replanMode ? "approved" : "editing");
      return;
    }
    if (result.fully_booked) {
      setPhase("fully_booked");
      return;
    }
    setDraftBlocks(result.blocks);
    setUnplacedTaskIds(result.unplaced_task_ids);
    setIsReplan(replanMode);
    setPhase("editing");
  }

  // Decide initial state once existing blocks have loaded.
  useEffect(() => {
    if (loading || proposedOnce.current) return;
    proposedOnce.current = true;
    if (blocks.length > 0) {
      setPhase("approved");
    } else {
      startProposal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function moveBlock(index: number, direction: -1 | 1) {
    setDraftBlocks((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeBlock(index: number) {
    setDraftBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateBlock(index: number, timeStr: string, minutes: number) {
    setDraftBlocks((prev) =>
      prev.map((b, i) => (i === index ? withStartAndDuration(b, timeStr, minutes) : b))
    );
  }

  async function handleApprove() {
    setError(null);
    setPhase("saving");
    try {
      if (isReplan) {
        await replan(todayKey, draftBlocks);
      } else {
        await approve(todayKey, draftBlocks);
      }
      setPhase("done");
    } catch (e) {
      if (e instanceof Error && e.message === "already_approved") {
        await fetchBlocks();
        setPhase("approved");
      } else {
        setError("Could not save. Try again.");
        setPhase("editing");
      }
    }
  }

  function handleReplan() {
    if (!window.confirm("Re-plan will replace your approved plan. Continue?")) return;
    startProposal(true);
  }

  const unplacedTitles = unplacedTaskIds
    .map((id) => tasks.find((t) => t.id === id)?.title)
    .filter((t): t is string => Boolean(t));

  return (
    <div className="page">
      <h1 className="page-title">Organize</h1>

      {error && (
        <p style={{ fontSize: 13, color: "var(--destructive, #ef4444)", marginBottom: 12 }}>{error}</p>
      )}

      {(phase === "loading" || phase === "proposing") && (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          {phase === "proposing" ? "Building your plan…" : "Loading…"}
        </p>
      )}

      {phase === "fully_booked" && (
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
          {isAfterWorkHours(workEnd)
            ? "Your work hours for today are done — there's no time left to schedule. Adjust your hours in Settings, or plan again tomorrow."
            : "No free time today — your calendar is fully booked."}
        </p>
      )}

      {phase === "approved" && (
        <>
          <p style={{ fontSize: 15, color: "var(--text)", marginBottom: 12 }}>
            Plan approved for today.
          </p>
          {blocks.map((b) => (
            <div key={b.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{b.title}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{toTimeInput(b.start_dt)}</span>
              </div>
              {b.conflict_with && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--destructive, #ef4444)" }}>
                  Conflicts with: {b.conflict_with}
                </p>
              )}
            </div>
          ))}
          <button type="button" className="btn-save" onClick={handleReplan} style={{ marginTop: 8 }}>
            Re-plan
          </button>
        </>
      )}

      {(phase === "editing" || phase === "saving") && (
        <>
          {draftBlocks.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No blocks to schedule.</p>
          ) : (
            draftBlocks.map((b, i) => {
              const minutes = durationMinutes(b.start_dt, b.end_dt);
              return (
                <div key={`${b.task_id ?? "x"}-${i}`} style={cardStyle}>
                  <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{b.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <input
                      type="time"
                      aria-label={`Start time for ${b.title}`}
                      value={toTimeInput(b.start_dt)}
                      onChange={(e) => updateBlock(i, e.target.value, minutes)}
                      style={inputStyle}
                    />
                    <input
                      type="number"
                      aria-label={`Duration in minutes for ${b.title}`}
                      min={5}
                      step={5}
                      value={minutes}
                      onChange={(e) => updateBlock(i, toTimeInput(b.start_dt), Number(e.target.value))}
                      style={{ ...inputStyle, width: 80 }}
                    />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>min</span>
                    <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                      <button type="button" style={smallBtn} aria-label="Move up" onClick={() => moveBlock(i, -1)}>↑</button>
                      <button type="button" style={smallBtn} aria-label="Move down" onClick={() => moveBlock(i, 1)}>↓</button>
                      <button
                        type="button"
                        style={{ ...smallBtn, color: "var(--destructive, #ef4444)" }}
                        aria-label="Remove"
                        onClick={() => removeBlock(i)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {unplacedTitles.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", margin: "0 0 8px" }}>
                Didn&apos;t fit
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 14 }}>
                {unplacedTitles.map((title, i) => (
                  <li key={i}>{title}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            className="btn-save"
            onClick={handleApprove}
            disabled={phase === "saving" || draftBlocks.length === 0}
            style={{ marginTop: 16, opacity: phase === "saving" || draftBlocks.length === 0 ? 0.6 : 1, cursor: phase === "saving" ? "not-allowed" : "pointer" }}
          >
            {phase === "saving" ? "Saving…" : isReplan ? "Approve Re-plan" : "Approve"}
          </button>
        </>
      )}

      {phase === "done" && (
        <>
          <p style={{ fontSize: 15, color: "var(--text)", marginBottom: 12 }}>Plan approved.</p>
          <Link to="/today" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Back to Today
          </Link>
        </>
      )}
    </div>
  );
}
