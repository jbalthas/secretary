import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIngest } from "../hooks/useIngest";
import { INGEST_PROMPT } from "../lib/ingestPrompt";
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

export default function Ingest() {
  const navigate = useNavigate();
  const ingest = useIngest();
  const [rawJson, setRawJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(INGEST_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawJson(typeof reader.result === "string" ? reader.result : "");
      setParseError(null);
      ingest.reset();
    };
    reader.readAsText(file);
  }

  async function handlePreview() {
    setParseError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      setParseError("Invalid JSON — check your payload and try again.");
      return;
    }
    await ingest.preview(parsed);
  }

  async function handleConfirm() {
    const ok = await ingest.confirm(JSON.parse(rawJson));
    if (ok) navigate("/goals");
  }

  const result = ingest.previewResult;
  const nothingToImport =
    result &&
    result.goals.length === 0 &&
    result.tasks.length === 0 &&
    result.routines.length === 0 &&
    result.habits.length === 0;

  return (
    <div className="page">
      <h1 className="page-title">Import Data</h1>

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
        <pre className="prompt-block" aria-label="LLM prompt text">{INGEST_PROMPT}</pre>
      </section>

      {/* Input section */}
      <section style={{ marginBottom: 24 }}>
        <p className="section-label">Paste JSON or upload a file</p>
        <textarea
          aria-label="JSON payload"
          value={rawJson}
          onChange={(e) => { setRawJson(e.target.value); setParseError(null); ingest.reset(); }}
          placeholder="Paste your JSON payload here…"
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12 }}>
          <label
            htmlFor="ingest-file"
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            Choose file
          </label>
          <input
            id="ingest-file"
            type="file"
            accept=".json"
            onChange={handleFile}
            style={{ display: "none" }}
          />
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
            Preview · {result.goals.length} goals · {result.tasks.length} tasks · {result.routines.length} routines · {result.habits.length} habits
          </p>
          {nothingToImport ? (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Nothing to import — the payload contained no recognizable entities.
            </p>
          ) : (
            <>
              <DiffGroup label="Goals" items={result.goals} />
              <DiffGroup label="Tasks" items={result.tasks} />
              <DiffGroup label="Routines" items={result.routines} />
              <DiffGroup label="Habits" items={result.habits} />
            </>
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
