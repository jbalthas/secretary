import { useEffect, useState } from "react";
import type { CalendarStatus } from "../types/calendar";
import type { Routine } from "../types/routine";
import { useBriefSettings } from "../hooks/useBriefSettings";
import { useWorkHours } from "../hooks/useWorkHours";
import { useStallThreshold } from "../hooks/useStallThreshold";
import { useGoogleHome } from "../hooks/useGoogleHome";
import { useRoutines } from "../hooks/useRoutines";
import { useGoals } from "../hooks/useGoals";
import { useCheckInSettings } from "../hooks/useCheckInSettings";
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

  const { ttsEnabled, loading: ghLoading, error: ghError, setEnabled, speak } = useGoogleHome();
  const [ttsText, setTtsText] = useState("");
  const [ghSpeaking, setGhSpeaking] = useState(false);
  const [ghSpeakError, setGhSpeakError] = useState<string | null>(null);

  const { workStart, workEnd, loading: whLoading, save: saveWorkHours } = useWorkHours();
  const [whStart, setWhStart] = useState("");
  const [whEnd, setWhEnd] = useState("");
  const [whSaving, setWhSaving] = useState(false);
  const [whError, setWhError] = useState<string | null>(null);

  const { days: stallDays, loading: stallLoading, save: saveStall } = useStallThreshold();
  const [stallInput, setStallInput] = useState("");
  const [stallSaving, setStallSaving] = useState(false);
  const [stallError, setStallError] = useState<string | null>(null);

  const { checkInTime, checkInEnabled, loading: ciLoading, error: ciLoadError, save: saveCheckIn } = useCheckInSettings();
  const [ciTime, setCiTime] = useState("");
  const [ciEnabled, setCiEnabled] = useState(true);
  const [ciSaving, setCiSaving] = useState(false);
  const [ciError, setCiError] = useState<string | null>(null);

  const { routines, loading: routinesLoading, create, update, remove } = useRoutines();
  const { goals } = useGoals();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);

  // Sync time input when briefTime loads
  useEffect(() => {
    if (briefTime !== null) setTimeInput(briefTime);
  }, [briefTime]);

  // Sync work hours inputs when they load
  useEffect(() => {
    if (workStart !== null) setWhStart(workStart);
    if (workEnd !== null) setWhEnd(workEnd);
  }, [workStart, workEnd]);

  // Sync stall threshold input when it loads
  useEffect(() => {
    if (stallDays !== null) setStallInput(String(stallDays));
  }, [stallDays]);

  // Sync check-in inputs when they load
  useEffect(() => { if (checkInTime !== null) setCiTime(checkInTime); }, [checkInTime]);
  useEffect(() => { setCiEnabled(checkInEnabled); }, [checkInEnabled]);

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

  async function handleSaveStall() {
    const n = Number(stallInput);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setStallError("Enter a number between 1 and 365.");
      return;
    }
    setStallError(null);
    setStallSaving(true);
    try {
      const ok = await saveStall(n);
      if (!ok) setStallError("Failed to save. Check your connection and try again.");
    } finally { setStallSaving(false); }
  }

  async function handleSaveWorkHours() {
    setWhError(null);
    setWhSaving(true);
    try {
      const ok = await saveWorkHours(whStart, whEnd);
      if (!ok) setWhError("Failed to save. Check your connection and try again.");
    } finally {
      setWhSaving(false);
    }
  }

  async function handleSpeak() {
    setGhSpeakError(null);
    setGhSpeaking(true);
    try {
      const ok = await speak(ttsText);
      if (!ok) setGhSpeakError("Failed to speak. Check your connection and try again.");
    } finally {
      setGhSpeaking(false);
    }
  }

  async function handleSaveCheckIn() {
    setCiError(null); setCiSaving(true);
    try {
      const ok = await saveCheckIn(ciTime, ciEnabled);
      if (!ok) setCiError("Failed to save. Check your connection and try again.");
    } finally { setCiSaving(false); }
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

      {/* Work Hours section */}
      <section style={{ marginBottom: 24 }}>
        <p style={SECTION_LABEL_STYLE}>Work Hours</p>

        <div style={CARD_STYLE}>
          {whLoading && workStart === null ? (
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div className="drawer-field" style={{ flex: 1 }}>
                  <label htmlFor="work-start">Start</label>
                  <input
                    id="work-start"
                    type="time"
                    value={whStart}
                    onChange={(e) => setWhStart(e.target.value)}
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
                <div className="drawer-field" style={{ flex: 1 }}>
                  <label htmlFor="work-end">End</label>
                  <input
                    id="work-end"
                    type="time"
                    value={whEnd}
                    onChange={(e) => setWhEnd(e.target.value)}
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
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
                Used to plan your day. Times follow the Pi's timezone.
              </p>
              {whError && (
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--destructive)" }}>
                  {whError}
                </p>
              )}
              <button
                type="button"
                className="btn-save"
                onClick={handleSaveWorkHours}
                disabled={whSaving}
                style={{ opacity: whSaving ? 0.6 : 1, cursor: whSaving ? "not-allowed" : "pointer" }}
              >
                {whSaving ? "Saving…" : "Save Work Hours"}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Guidance section */}
      <section style={{ marginBottom: 24 }}>
        <p style={SECTION_LABEL_STYLE}>Guidance</p>

        <div style={CARD_STYLE}>
          {stallLoading && stallDays === null ? (
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
          ) : (
            <>
              <div className="drawer-field" style={{ marginBottom: 8 }}>
                <label htmlFor="stall-threshold">Stall threshold (days)</label>
                <input
                  id="stall-threshold"
                  type="number"
                  min={1}
                  max={365}
                  value={stallInput}
                  onChange={(e) => setStallInput(e.target.value)}
                  style={{
                    background: "var(--bg)",
                    border: `1px solid ${stallError ? "var(--destructive)" : "var(--border)"}`,
                    borderRadius: 6,
                    color: "var(--text)",
                    padding: "8px 10px",
                    fontSize: 16,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
                Goals with no task completions for this many days trigger a nudge. Default: 7.
              </p>
              {stallError && (
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--destructive)" }}>
                  {stallError}
                </p>
              )}
              <button
                type="button"
                className="btn-save"
                onClick={handleSaveStall}
                disabled={stallSaving}
                style={{ opacity: stallSaving ? 0.6 : 1, cursor: stallSaving ? "not-allowed" : "pointer" }}
              >
                {stallSaving ? "Saving…" : "Save Settings"}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Google Home section */}
      <section style={{ marginBottom: 24 }}>
        <p style={SECTION_LABEL_STYLE}>Google Home</p>

        <div style={CARD_STYLE}>
          {ghLoading && ttsEnabled === null ? (
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
          ) : ghError ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--destructive)" }}>{ghError}</p>
          ) : (
            <>
              <input
                type="text"
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Say something on the speaker"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text)",
                  padding: "8px 10px",
                  fontSize: 16,
                  width: "100%",
                  boxSizing: "border-box",
                  marginBottom: 12,
                }}
              />
              {ghSpeakError && (
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--destructive)" }}>
                  {ghSpeakError}
                </p>
              )}
              <button
                type="button"
                className="btn-save"
                onClick={handleSpeak}
                disabled={ghSpeaking}
                style={{ opacity: ghSpeaking ? 0.6 : 1, cursor: ghSpeaking ? "not-allowed" : "pointer", marginBottom: 16 }}
              >
                {ghSpeaking ? "Speaking…" : "Speak"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  id="tts-enabled"
                  type="checkbox"
                  checked={ttsEnabled ?? false}
                  onChange={() => setEnabled(!ttsEnabled)}
                />
                <label htmlFor="tts-enabled" style={{ fontSize: 14, color: "var(--text)", cursor: "pointer" }}>
                  Announce on Google Home
                </label>
              </div>
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

      {/* Check-in Notification section */}
      <section style={{ marginBottom: 24 }}>
        <p style={SECTION_LABEL_STYLE}>Check-in Notification</p>

        <div style={CARD_STYLE}>
          {ciLoading && checkInTime === null ? (
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>Loading…</p>
          ) : ciLoadError ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--destructive)" }}>{ciLoadError}</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input
                  id="checkin-enabled"
                  type="checkbox"
                  checked={ciEnabled}
                  onChange={() => setCiEnabled(!ciEnabled)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <label htmlFor="checkin-enabled" style={{ fontSize: 14, color: "var(--text)", cursor: "pointer" }}>
                  Enable mid-day check-in
                </label>
              </div>
              <div className="drawer-field" style={{ marginBottom: 8 }}>
                <label htmlFor="checkin-time">Check-in time</label>
                <input
                  id="checkin-time"
                  type="time"
                  value={ciTime}
                  onChange={(e) => setCiTime(e.target.value)}
                  disabled={!ciEnabled}
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
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
                A Pushover reminder to log progress. Default: 12:00.
              </p>
              {ciError && (
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--destructive)" }}>{ciError}</p>
              )}
              <button
                type="button"
                className="btn-save"
                onClick={handleSaveCheckIn}
                disabled={ciSaving}
                style={{ opacity: ciSaving ? 0.6 : 1, cursor: ciSaving ? "not-allowed" : "pointer" }}
              >
                {ciSaving ? "Saving…" : "Save Check-in Settings"}
              </button>
            </>
          )}
        </div>
      </section>

      <RoutineDrawer
        open={drawerOpen}
        routine={editingRoutine}
        goals={goals}
        onClose={() => setDrawerOpen(false)}
        onSave={(body, id) => id !== undefined ? update(id, body) : create(body)}
        onDelete={remove}
      />
    </div>
  );
}
