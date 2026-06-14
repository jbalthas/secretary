import { useEffect, useState } from "react";
import type { CalendarStatus } from "../types/calendar";
import type { Routine } from "../types/routine";
import { useBriefSettings } from "../hooks/useBriefSettings";
import { useRoutines } from "../hooks/useRoutines";
import RoutineDrawer from "../components/RoutineDrawer";

const STATUS_URL = "/api/v1/calendar/status";
const DISCONNECT_URL = "/api/v1/calendar/disconnect";
const CONNECT_URL = "/auth/google";

function fmt(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-secondary)",
  margin: "0 0 12px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px 16px",
};

export default function Settings() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const { briefTime, loading: briefLoading, error: briefLoadError, save: saveBriefTime } = useBriefSettings();
  const [timeInput, setTimeInput] = useState("");
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const { routines, loading: routinesLoading, create, update, remove } = useRoutines();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);

  // Sync time input when briefTime loads
  useEffect(() => {
    if (briefTime !== null) setTimeInput(briefTime);
  }, [briefTime]);

  async function loadStatus() {
    const res = await fetch(STATUS_URL);
    if (res.ok) setStatus(await res.json());
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch(DISCONNECT_URL, { method: "POST" });
      if (res.ok) setStatus(await res.json());
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function handleSaveBriefTime() {
    setBriefError(null);
    setBriefSaving(true);
    try {
      const ok = await saveBriefTime(timeInput);
      if (!ok) setBriefError("Failed to save. Check your connection and try again.");
    } finally {
      setBriefSaving(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      {/* Google Calendar section */}
      <section style={{ marginBottom: 24 }}>
        <p style={SECTION_LABEL_STYLE}>Google Calendar</p>

        <div style={CARD_STYLE}>
          {status === null ? (
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
          ) : status.connected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Connected</span>
              </div>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-secondary)" }}>
                Last synced: {fmt(status.last_synced_at)}
              </p>
              <button
                onClick={disconnect}
                disabled={busy}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  fontSize: 14,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-secondary)", flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Not connected</span>
              </div>
              <a
                href={CONNECT_URL}
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 14,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Connect Google Calendar
              </a>
            </>
          )}
        </div>
      </section>

      {/* Daily Brief section */}
      <section style={{ marginBottom: 24 }}>
        <p style={SECTION_LABEL_STYLE}>Daily Brief</p>

        <div style={CARD_STYLE}>
          {briefLoading && briefTime === null ? (
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
          ) : briefLoadError ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--destructive)" }}>{briefLoadError}</p>
          ) : (
            <>
              <div className="drawer-field" style={{ marginBottom: 12 }}>
                <label htmlFor="brief-time">Brief time</label>
                <input
                  id="brief-time"
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    padding: "8px 10px",
                    fontSize: 16,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {briefError && (
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--destructive)" }}>
                  {briefError}
                </p>
              )}
              <button
                type="button"
                className="btn-save"
                onClick={handleSaveBriefTime}
                disabled={briefSaving}
                style={{ opacity: briefSaving ? 0.6 : 1, cursor: briefSaving ? "not-allowed" : "pointer" }}
              >
                {briefSaving ? "Saving…" : "Save Brief Time"}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Routines section */}
      <section style={{ marginBottom: 24 }}>
        <p style={SECTION_LABEL_STYLE}>Routines</p>

        {routinesLoading ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
        ) : routines.length === 0 ? (
          <div className="empty-state">
            <h2>No routines yet</h2>
            <p>Add a routine to automate recurring actions.</p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            {routines.map((r) => (
              <div
                key={r.id}
                className="task-row"
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, padding: 8, borderBottom: "1px solid var(--border)" }}
                onClick={() => { setEditingRoutine(r); setDrawerOpen(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") { setEditingRoutine(r); setDrawerOpen(true); } }}
              >
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.name}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "monospace" }}>{r.cron}</span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => { setEditingRoutine(null); setDrawerOpen(true); }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          + Add Routine
        </button>
      </section>

      <RoutineDrawer
        open={drawerOpen}
        routine={editingRoutine}
        onClose={() => setDrawerOpen(false)}
        onSave={(body, id) => id !== undefined ? update(id, body) : create(body)}
        onDelete={remove}
      />
    </div>
  );
}
