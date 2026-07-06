import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useExport } from "../hooks/useExport";
import { useAdvisory } from "../hooks/useAdvisory";
import { computeAdvisoryId } from "../lib/advisoryId";
import { ADVISOR_PROMPT } from "../lib/advisorPrompt";
import type { AdvisoryEntityDiff, AdvisoryResult } from "../types/goal";

const MS_PER_DAY = 86_400_000;
const STALE_DAYS = 7;

function daysAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - Date.parse(iso);
  const days = Math.max(0, Math.floor(diff / MS_PER_DAY));
  return `${days}`;
}

function rowKey(group: string, item: AdvisoryEntityDiff): string {
  return `${group}:${item.external_key}`;
}

function AdvisoryDiffGroup({
  label,
  group,
  items,
  accepted,
  onToggle,
}: {
  label: string;
  group: string;
  items: AdvisoryEntityDiff[];
  accepted: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: "0 0 8px" }}>
        {label}
      </h3>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {items.map((item) => {
          const key = rowKey(group, item);
          return (
            <div
              key={key}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  aria-label={`Accept change to ${item.title}`}
                  checked={accepted[key] ?? true}
                  onChange={() => onToggle(key)}
                />
                <span style={{ fontSize: 16, color: "var(--text)", flex: 1 }}>{item.title}</span>
                <span className={item.action === "create" ? "diff-badge diff-badge-create" : "diff-badge diff-badge-update"}>
                  {item.action}
                </span>
              </div>
              <div style={{ margin: "6px 0 0 26px" }}>
                {item.fields.map((f, i) => (
                  <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {f.field}: {f.old !== null && f.old !== undefined ? `${JSON.stringify(f.old)} → ` : "→ "}
                    {JSON.stringify(f.new)}
                  </p>
                ))}
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>
                  {item.rationale}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Advisor() {
  const ex = useExport();
  const advisory = useAdvisory();
  const [promptCopied, setPromptCopied] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  const [lastAdvisoryAt, setLastAdvisoryAt] = useState<string | null>(null);
  const [rawAdvisory, setRawAdvisory] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [fullPayload, setFullPayload] = useState<unknown>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<AdvisoryResult | null>(null);

  async function fetchLastSync() {
    try {
      const res = await fetch("/api/v1/advisory/last-sync");
      if (res.ok) {
        const data = await res.json();
        setLastAdvisoryAt(data.last_advisory_at ?? null);
      }
    } catch {
      // non-blocking — header simply shows "never"
    }
  }

  useEffect(() => {
    fetchLastSync();
  }, []);

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(ADVISOR_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  async function handleCopyBrief() {
    const md = await ex.fetchBundle();
    if (md) {
      await navigator.clipboard.writeText(md);
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2000);
    }
  }

  async function handleSnapshot() {
    setSnapshotMsg(null);
    const result = await ex.triggerSnapshot();
    if (result) {
      setSnapshotMsg(`Snapshot saved (${result.created} created, ${result.skipped} skipped).`);
    }
  }

  async function handleRunPreview() {
    setParseError(null);
    setSummary(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawAdvisory);
    } catch {
      setParseError("Invalid JSON — check the pasted reply and try again.");
      return;
    }
    setFullPayload(parsed);
    await advisory.preview(parsed);
  }

  useEffect(() => {
    if (!advisory.previewResult) return;
    const next: Record<string, boolean> = {};
    for (const item of advisory.previewResult.goals) next[rowKey("goals", item)] = true;
    for (const item of advisory.previewResult.milestones) next[rowKey("milestones", item)] = true;
    for (const item of advisory.previewResult.new_tasks) next[rowKey("new_tasks", item)] = true;
    setAccepted(next);
  }, [advisory.previewResult]);

  function toggleAccepted(key: string) {
    setAccepted((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  const result = advisory.previewResult;
  const acceptedCount = Object.values(accepted).filter(Boolean).length;
  const isStale =
    !!result && Date.now() - Date.parse(result.generated_at) > STALE_DAYS * MS_PER_DAY;

  async function handleConfirm() {
    if (!result || !fullPayload) return;
    const payload = fullPayload as {
      goal_adjustments?: { external_key: string }[];
      milestone_adjustments?: { goal_external_key: string; title: string }[];
      new_tasks?: { external_key: string }[];
    };

    const acceptedPayload = {
      ...payload,
      goal_adjustments: (payload.goal_adjustments ?? []).filter(
        (g) => accepted[rowKey("goals", { external_key: g.external_key } as AdvisoryEntityDiff)] ?? true
      ),
      milestone_adjustments: (payload.milestone_adjustments ?? []).filter((m) => {
        const key = rowKey("milestones", {
          external_key: `${m.goal_external_key}/${m.title}`,
        } as AdvisoryEntityDiff);
        return accepted[key] ?? true;
      }),
      new_tasks: (payload.new_tasks ?? []).filter((_, i) => {
        const key = rowKey("new_tasks", { external_key: `advisory-PREVIEW-${i}` } as AdvisoryEntityDiff);
        return accepted[key] ?? true;
      }),
    };

    const advisory_id = await computeAdvisoryId(fullPayload);
    const res = await advisory.confirm({ advisory_id, payload: acceptedPayload });
    if (res) {
      setSummary(res);
      fetchLastSync();
    }
  }

  function summaryCounts(res: AdvisoryResult) {
    const goals = (res.created.goals ?? 0) + (res.updated.goals ?? 0);
    const milestones = (res.created.milestones ?? 0) + (res.updated.milestones ?? 0);
    const tasks = (res.created.tasks ?? 0) + (res.updated.tasks ?? 0);
    return { goals, milestones, tasks };
  }

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h1 className="page-title">Sync</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          Last advisor sync: {daysAgo(lastAdvisoryAt)}{lastAdvisoryAt ? " days ago" : ""}
        </p>
      </div>

      {/* Advisor prompt section */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p className="section-label" style={{ margin: 0 }}>Advisor prompt</p>
          <button
            type="button"
            className="btn-text-accent"
            aria-label="Copy advisor prompt to clipboard"
            onClick={handleCopyPrompt}
          >
            {promptCopied ? "Copied!" : "Copy advisor prompt"}
          </button>
        </div>
        <pre className="prompt-block" aria-label="Advisor prompt text">{ADVISOR_PROMPT}</pre>
      </section>

      {/* Advisory brief section */}
      <section style={{ marginBottom: 24 }}>
        <p className="section-label">Advisory brief</p>
        <button
          type="button"
          className="btn-save"
          onClick={handleCopyBrief}
          disabled={ex.loading}
          aria-disabled={ex.loading}
          style={{ width: "100%", opacity: ex.loading ? 0.6 : 1, cursor: ex.loading ? "not-allowed" : "pointer" }}
        >
          {ex.loading ? "Loading…" : briefCopied ? "Copied!" : "Copy advisory brief"}
        </button>
        {ex.error && (
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--destructive)" }}>{ex.error}</p>
        )}
      </section>

      {/* Preview section */}
      {ex.bundle && (
        <section style={{ marginBottom: 24 }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Preview</p>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace" }}>
            generated_at: {ex.generatedAt} · session_id: {ex.sessionId}
          </p>
          <pre className="prompt-block" aria-label="Rendered advisory brief">{ex.bundle}</pre>
        </section>
      )}

      {/* Snapshot section */}
      <section style={{ marginBottom: 24 }}>
        <p className="section-label">Snapshot</p>
        <button
          type="button"
          className="btn-save"
          onClick={handleSnapshot}
          disabled={ex.snapshotting}
          aria-disabled={ex.snapshotting}
          style={{ width: "100%", opacity: ex.snapshotting ? 0.6 : 1, cursor: ex.snapshotting ? "not-allowed" : "pointer" }}
        >
          {ex.snapshotting ? "Saving…" : "Take snapshot now"}
        </button>
        {snapshotMsg && (
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>{snapshotMsg}</p>
        )}
      </section>

      {/* Paste advisory response section */}
      <section style={{ marginBottom: 24 }}>
        <p className="section-label">Paste advisor's reply</p>
        <textarea
          aria-label="Advisory JSON reply"
          value={rawAdvisory}
          onChange={(e) => {
            setRawAdvisory(e.target.value);
            setParseError(null);
            setSummary(null);
            advisory.reset();
          }}
          placeholder="Paste the advisor's JSON reply here…"
          style={{
            width: "100%",
            minHeight: 160,
            resize: "vertical",
            fontSize: 14,
            fontFamily: "monospace",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            padding: "10px 12px",
            boxSizing: "border-box",
          }}
        />
        {parseError && (
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--destructive)" }}>{parseError}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            className="btn-save"
            onClick={handleRunPreview}
            disabled={advisory.previewing}
            aria-disabled={advisory.previewing}
            style={{ width: "auto", opacity: advisory.previewing ? 0.6 : 1, cursor: advisory.previewing ? "not-allowed" : "pointer" }}
          >
            {advisory.previewing ? "Previewing…" : "Run preview"}
          </button>
        </div>
      </section>

      {/* Notes callout — ABOVE the diff, display-only */}
      {result?.notes && (
        <section style={{ marginBottom: 24 }}>
          <div
            style={{
              background: "var(--surface)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: 6,
              padding: "12px 16px",
              fontSize: 14,
              color: "var(--text)",
              fontStyle: "italic",
            }}
          >
            {result.notes}
          </div>
        </section>
      )}

      {/* Staleness banner — non-blocking */}
      {isStale && result && (
        <section style={{ marginBottom: 24 }}>
          <div
            style={{
              background: "rgba(234, 179, 8, 0.12)",
              border: "1px solid rgba(234, 179, 8, 0.4)",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--text)",
            }}
          >
            This advisory is {daysAgo(result.generated_at)} days old — consider running a fresh export.
          </div>
        </section>
      )}

      {/* Diff review section */}
      {result && (
        <section style={{ marginBottom: 24 }}>
          <p className="section-label">
            Review · {result.goals.length} goals · {result.milestones.length} milestones · {result.new_tasks.length} new tasks
          </p>
          <AdvisoryDiffGroup label="Goals" group="goals" items={result.goals} accepted={accepted} onToggle={toggleAccepted} />
          <AdvisoryDiffGroup label="Milestones" group="milestones" items={result.milestones} accepted={accepted} onToggle={toggleAccepted} />
          <AdvisoryDiffGroup label="New tasks" group="new_tasks" items={result.new_tasks} accepted={accepted} onToggle={toggleAccepted} />
        </section>
      )}

      {/* Confirm section */}
      {result && (
        <section style={{ marginBottom: 24 }}>
          <button
            type="button"
            className="btn-save"
            onClick={handleConfirm}
            disabled={advisory.confirming || acceptedCount === 0}
            aria-disabled={advisory.confirming || acceptedCount === 0}
            style={{
              width: "100%",
              opacity: advisory.confirming || acceptedCount === 0 ? 0.6 : 1,
              cursor: advisory.confirming || acceptedCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {advisory.confirming ? "Confirming…" : "Confirm"}
          </button>
        </section>
      )}

      {/* Validation error section */}
      {advisory.errors.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <p className="section-label" style={{ color: "var(--destructive)" }}>Validation Errors</p>
          <ul className="error-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {advisory.errors.map((err, i) => (
              <li key={i} className="error-list-item">{err}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Success summary — stays on page, no auto-navigate */}
      {summary && (
        <section style={{ marginBottom: 24 }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            {(() => {
              const counts = summaryCounts(summary);
              return (
                <p style={{ margin: 0, fontSize: 15, color: "var(--text)" }}>
                  {counts.goals} goals · {counts.milestones} milestones · {counts.tasks} tasks adjusted
                  {summary.replayed ? " (already applied)" : ""}
                </p>
              );
            })()}
            <Link to="/goals" className="btn-text-accent" style={{ display: "inline-block", marginTop: 8 }}>
              View in Goals
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
