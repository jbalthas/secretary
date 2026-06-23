import { useState } from "react";
import type { UpdateCandidate } from "../types/update";

interface CandidateCardProps {
  status: "ambiguous" | "no_match";
  candidates: UpdateCandidate[];
  onConfirm: (c: UpdateCandidate) => void;
  onDismiss: () => void;
}

export default function CandidateCard({
  status,
  candidates,
  onConfirm,
  onDismiss,
}: CandidateCardProps) {
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const bannerText =
    status === "ambiguous"
      ? "Multiple matches — pick the right one:"
      : "No exact match — did you mean:";

  const visible = candidates.filter((c) => !skipped.has(c.entity_id));

  function handleSkip(id: number) {
    setSkipped((prev) => new Set(prev).add(id));
  }

  return (
    <div className="candidate-card">
      <div className="organize-notice" style={{ marginBottom: 12 }}>
        <div>
          <span>{bannerText}</span>
        </div>
      </div>

      {visible.map((c) => (
        <div className="candidate-row" key={`${c.entity_type}-${c.entity_id}`}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 400, color: "var(--text)" }}>
            {c.title}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              flexShrink: 0,
            }}
          >
            {c.entity_type}
          </span>
          <button className="btn-candidate-confirm" onClick={() => onConfirm(c)}>
            Confirm match
          </button>
          <button className="btn-candidate-skip" onClick={() => handleSkip(c.entity_id)}>
            Skip
          </button>
        </div>
      ))}

      <button className="btn-text-accent" onClick={onDismiss} style={{ marginTop: 8 }}>
        None of these — dismiss
      </button>
    </div>
  );
}
