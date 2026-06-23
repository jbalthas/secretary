import type { Task } from "../types/task";
import type { ScheduledBlock } from "../types/plan";
import { isAfterWorkHours } from "../lib/timeUtils";
import { deriveRollup } from "../lib/rollup";

interface RollupCardProps {
  tasks: Task[];
  blocks: ScheduledBlock[];
  todayKey: string;
  workEnd: string | null;
}

export default function RollupCard({ tasks, blocks, todayKey, workEnd }: RollupCardProps) {
  if (!isAfterWorkHours(workEnd)) return null;

  const r = deriveRollup(tasks, blocks, todayKey);
  if (r.completedCount === 0 && r.slippedCount === 0) return null;

  return (
    <div className="rollup-card">
      <p className="rollup-heading">Day Rollup</p>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        {r.completedCount} completed&nbsp;&nbsp;•&nbsp;&nbsp;{r.slippedCount} slipped
      </p>
      <div className="rollup-list">
        {r.completed.map((item, i) => (
          <div className="rollup-item" key={`c-${i}`}>
            <span
              style={{
                flex: 1,
                fontSize: 16,
                color: "var(--text)",
                textDecoration: "line-through",
                opacity: 0.5,
              }}
            >
              {item.title}
            </span>
          </div>
        ))}
        {r.slipped.map((item, i) => (
          <div className="rollup-item" key={`s-${i}`}>
            <span style={{ flex: 1, fontSize: 16, color: "var(--text)" }}>{item.title}</span>
            <span
              className="priority-badge"
              style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
            >
              Slipped
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
