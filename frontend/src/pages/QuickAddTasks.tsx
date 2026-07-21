import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIngest } from "../hooks/useIngest";
import { TASKS_PROMPT, normalizeTasksInput } from "../lib/tasksPrompt";
import type { IngestEntityDiff } from "../types/goal";

function DiffGroup({ label, items }: { label: string; items: IngestEntityDiff[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: "0 0 8px" }}>
        {label}
      </h3>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {items.map((item) => (
          <div
            key={item.external_key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 16, color: "var(--text)" }}>{item.title}</span>
            <span className={item.action === "create" ? "diff-badge diff-badge-create" : "diff-badge diff-badge-update"}>
              {item.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuickAddTasks() {
  const navigate = useNavigate();
  const ingest = useIngest();
  const [rawText, setRawText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [normalized, setNormalized] = useState<unknown>(null);

  async function handleCopy() {
    await navigator.clipboard.writeText(TASKS_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePreview() {
    setParseError(null);
    const result = normalizeTasksInput(rawText);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }
    setNormalized(result.payload);
    await ingest.preview(result.payload);
  }

  async function handleConfirm() {
    const ok = await ingest.confirm(normalized);
    if (ok) navigate("/tasks");
  }

  const result = ingest.previewResult;
  const nothingToImport = result && result.tasks.length === 0;

  return (
    <div className="page">
      <h1 className="page-title">Quick Add Tasks</h1>

      {/* LLM Prompt section */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p className="section-label" style={{ margin: 0 }}>LLM Prompt</p>
          <button
            type="button"
            className="btn-text-accent"
            aria-label="Copy LLM prompt to clipboard"
            onClick={handleCopy}
          >
            {copied ? "Copied!" : "Copy prompt"}
          </button>
        </div>
        <pre className="prompt-block" aria-label="LLM prompt text">{TASKS_PROMPT}</pre>
      </section>

      {/* Input section */}
      <section style={{ marginBottom: 24 }}>
        <p className="section-label">Paste the LLM's task list</p>
        <textarea
          aria-label="Task JSON"
          value={rawText}
          onChange={(e) => { setRawText(e.target.value); setParseError(null); setNormalized(null); ingest.reset(); }}
          placeholder="Paste a JSON array of tasks — fences and a bare array are both fine…"
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: 12, gap: 12 }}>
          <button
            type="button"
            className="btn-save"
            onClick={handlePreview}
            disabled={ingest.previewing}
            style={{ width: "auto", opacity: ingest.previewing ? 0.6 : 1, cursor: ingest.previewing ? "not-allowed" : "pointer" }}
          >
            {ingest.previewing ? "Previewing…" : "Run Preview"}
          </button>
        </div>
      </section>

      {/* Preview results section */}
      {result && (
        <section style={{ marginBottom: 24 }}>
          <p className="section-label">
            Preview · {result.tasks.length} tasks
          </p>
          {nothingToImport ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Nothing to import.
            </p>
          ) : (
            <DiffGroup label="Tasks" items={result.tasks} />
          )}
        </section>
      )}

      {/* Confirm section */}
      {result && !nothingToImport && (
        <section style={{ marginBottom: 24 }}>
          <button
            type="button"
            className="btn-save"
            onClick={handleConfirm}
            disabled={ingest.confirming}
            aria-disabled={ingest.confirming}
            style={{ width: "100%", opacity: ingest.confirming ? 0.6 : 1, cursor: ingest.confirming ? "not-allowed" : "pointer" }}
          >
            {ingest.confirming ? "Importing…" : "Confirm Import"}
          </button>
        </section>
      )}

      {/* Validation error section */}
      {ingest.errors.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <p className="section-label" style={{ color: "var(--destructive)" }}>Validation Errors</p>
          <ul className="error-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ingest.errors.map((err, i) => (
              <li key={i} className="error-list-item">{err}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
