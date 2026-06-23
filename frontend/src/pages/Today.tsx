import { useRef, useState, useEffect } from "react";
import { useTasks } from "../hooks/useTasks";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { usePlan } from "../hooks/usePlan";
import { useNextBestTask } from "../hooks/useNextBestTask";
import { useWorkHours } from "../hooks/useWorkHours";
import { useUpdate } from "../hooks/useUpdate";
import { buildWeekAgenda } from "../lib/agenda";
import type { DayGroup } from "../lib/agenda";
import AgendaItem from "../components/AgendaItem";
import CandidateCard from "../components/CandidateCard";
import RollupCard from "../components/RollupCard";
import type { AgendaItem as AgendaItemType, Task } from "../types/task";
import type { UpdateCandidate } from "../types/update";

interface DaySectionProps {
  group: DayGroup;
  onToggle: (item: AgendaItemType, completed: boolean) => Promise<void>;
}

function DaySection({ group, onToggle }: DaySectionProps) {
  const allDayItems = group.items.filter((i) => i.time === null);
  const timedItems = group.items.filter((i) => i.time !== null);

  return (
    <section style={{ marginBottom: 24 }}>
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text)",
          margin: "0 0 6px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {group.label}
      </p>

      {group.items.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 2px" }}>
          Nothing scheduled
        </p>
      ) : (
        <>
          {allDayItems.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  margin: "0 0 4px",
                  fontWeight: 400,
                }}
              >
                All day
              </p>
              {allDayItems.map((item) => (
                <AgendaItem key={item.id} item={item} onToggle={onToggle} />
              ))}
            </div>
          )}
          {timedItems.map((item) => (
            <AgendaItem key={item.id} item={item} onToggle={onToggle} />
          ))}
        </>
      )}
    </section>
  );
}

function FocusBanner({ task }: { task: Task | null }) {
  if (!task) return null;
  return (
    <div role="region" aria-label="Suggested focus" style={{
      background: "var(--surface)",
      borderLeft: "3px solid var(--accent)",
      borderRadius: 6,
      padding: 12,
      marginBottom: 16,
    }}>
      <p className="focus-banner-label" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Focus on</p>
      <p className="focus-banner-title" style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 400, color: "var(--text)" }}>{task.title}</p>
    </div>
  );
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Today() {
  const { tasks, patchTask, refresh } = useTasks();
  const { events, patchEvent } = useCalendarEvents();
  const todayKey = localDateKey(new Date());
  const { blocks, patchBlock, fetchBlocks } = usePlan(todayKey);
  const { task: nextBest } = useNextBestTask();
  const { workEnd } = useWorkHours();
  const { submit, confirm } = useUpdate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const groups = buildWeekAgenda(tasks, events, new Date(), blocks);

  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "success-flash">("idle");
  const [candidates, setCandidates] = useState<UpdateCandidate[]>([]);
  const [candStatus, setCandStatus] = useState<"ambiguous" | "no_match" | null>(null);
  const [updError, setUpdError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("update") === "1") {
      textareaRef.current?.focus();
      window.history.replaceState({}, "", "/today");
    }
  }, []);

  async function handleSubmit() {
    if (!text.trim()) return;
    setPhase("submitting");
    setUpdError(null);
    setCandidates([]);
    const data = await submit(text);
    if (data === null) {
      setUpdError("Couldn't send update — check your connection.");
      setPhase("idle");
      return;
    }
    if (data.status === "resolved") {
      setText("");
      setCandStatus(null);
      setCandidates([]);
      setPhase("success-flash");
      await Promise.all([refresh(), fetchBlocks()]);
      setTimeout(() => setPhase("idle"), 1500);
    } else {
      setCandidates(data.candidates);
      setCandStatus(data.status as "ambiguous" | "no_match");
      setPhase("idle");
    }
  }

  async function handleConfirm(c: UpdateCandidate) {
    const data = await confirm(text, c, "done");
    if (data === null) {
      setUpdError("Couldn't send update — check your connection.");
      return;
    }
    if (data.status === "resolved") {
      setText("");
      setCandidates([]);
      setCandStatus(null);
      setPhase("success-flash");
      await Promise.all([refresh(), fetchBlocks()]);
      setTimeout(() => setPhase("idle"), 1500);
    }
  }

  function handleDismiss() {
    setText("");
    setCandidates([]);
    setCandStatus(null);
  }

  async function handleToggle(item: AgendaItemType, completed: boolean) {
    if (item.isBlock && item.blockId != null) {
      await patchBlock(item.blockId, completed);
    } else if (item.isEvent && item.googleId) {
      await patchEvent(item.googleId, completed);
    } else if (item.taskId != null) {
      await patchTask(item.taskId, { completed });
    }
  }

  const submitLabel =
    phase === "submitting" ? "Logging…" : phase === "success-flash" ? "Done" : "Log update";

  return (
    <div className="page">
      <h1 className="page-title">This Week</h1>

      {candStatus ? (
        <CandidateCard
          status={candStatus}
          candidates={candidates}
          onConfirm={handleConfirm}
          onDismiss={handleDismiss}
        />
      ) : (
        <>
          <div className="update-input-row">
            <textarea
              ref={textareaRef}
              className="update-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="What got done? e.g. finished standup"
            />
            <button
              className="btn-save btn-save--inline"
              onClick={handleSubmit}
              disabled={phase === "submitting"}
              style={phase === "submitting" ? { opacity: 0.6 } : undefined}
            >
              {submitLabel}
            </button>
          </div>
          {updError && (
            <p style={{ fontSize: 12, color: "var(--destructive)", margin: "-8px 0 12px" }}>
              {updError}
            </p>
          )}
        </>
      )}

      <FocusBanner task={nextBest} />

      <RollupCard tasks={tasks} blocks={blocks} todayKey={todayKey} workEnd={workEnd} />

      {groups.map((group) => (
        <DaySection key={group.dateKey} group={group} onToggle={handleToggle} />
      ))}
    </div>
  );
}
