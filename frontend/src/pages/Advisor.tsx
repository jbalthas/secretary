import { useState } from "react";
import { useExport } from "../hooks/useExport";
import { ADVISOR_PROMPT } from "../lib/advisorPrompt";

export default function Advisor() {
  const ex = useExport();
  const [promptCopied, setPromptCopied] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

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

  return (
    <div className="page">
      <h1 className="page-title">Sync</h1>

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
    </div>
  );
}
