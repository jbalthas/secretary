import { useRef, useState, useEffect } from "react";
import { useTasks } from "../hooks/useTasks";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { usePlan } from "../hooks/usePlan";
import { useNextBestTask } from "../hooks/useNextBestTask";
import { useWorkHours } from "../hooks/useWorkHours";
import { useUpdate } from "../hooks/useUpdate";
import { buildWeekAgenda } from "../lib/agenda";
import { deriveMomentum, nextEventLabel, currentHHMM } from "../lib/nowView";
import type { DayGroup } from "../lib/agenda";
import AgendaItem from "../components/AgendaItem";
import CandidateCard from "../components/CandidateCard";
import RollupCard from "../components/RollupCard";
import WeatherFocusHero from "../components/WeatherFocusHero";
import TodayTimeline from "../components/TodayTimeline";
import type { AgendaItem as AgendaItemType } from "../types/task";
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

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Today() {
  const { tasks, patchTask, refresh } = useTasks();
  const { events, patchEvent } = useCalendarEvents(7);
  const todayKey = localDateKey(new Date());
  const { blocks, patchBlock, patchBlockParent, fetchBlocks } = usePlan(todayKey);
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

  async function handleSetParent(item: AgendaItemType, parentTaskId: number | null) {
    if (item.isBlock && item.blockId != null) {
      await patchBlockParent(item.blockId, parentTaskId);
    } else if (item.taskId != null) {
      await patchTask(item.taskId, { parent_task_id: parentTaskId });
    }
  }

  const submitLabel =
    phase === "submitting" ? "Logging…" : phase === "success-flash" ? "Done" : "Log update";

  const now = new Date();
  const momentum = deriveMomentum(tasks, blocks, todayKey);
  const nowHHMM = currentHHMM(now);
  const contextLine = nextEventLabel(events, now);
  const todayGroup = groups[0];
  const restOfWeek = groups.slice(1);

  return (
    <div className="page today-page">
      <header className="today-header">
        <div>
          <h1>Today</h1>
          <p>{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <span className="today-header__date-mark">{now.getDate()}</span>
      </header>

      <WeatherFocusHero
        task={nextBest}
        contextLine={contextLine}
        doneToday={momentum.doneToday}
        remainingToday={momentum.remainingToday}
      />

      {candStatus ? (
        <CandidateCard
          status={candStatus}
          candidates={candidates}
          onConfirm={handleConfirm}
          onDismiss={handleDismiss}
        />
      ) : (
        <>
          <div className="update-panel">
            <div className="update-panel__heading">
              <strong>Capture progress</strong>
              <span>A quick note keeps your day current.</span>
            </div>
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
          </div>
          {updError && (
            <p style={{ fontSize: 12, color: "var(--destructive)", margin: "-8px 0 12px" }}>
              {updError}
            </p>
          )}
        </>
      )}

      <RollupCard tasks={tasks} blocks={blocks} todayKey={todayKey} workEnd={workEnd} />

      <div className="today-columns">
        <section className="today-section">
          <div className="today-section__heading">
            <h2>Your day</h2>
            <span>{todayGroup?.items.length ?? 0} items</span>
          </div>
          <TodayTimeline
            items={todayGroup?.items ?? []}
            nowHHMM={nowHHMM}
            onToggle={handleToggle}
            onSetParent={handleSetParent}
          />
        </section>

        <section className="today-section today-section--week">
          <div className="today-section__heading">
            <h2>Later this week</h2>
            <span>Next 6 days</span>
          </div>
          {restOfWeek.map((group) => (
            <DaySection key={group.dateKey} group={group} onToggle={handleToggle} />
          ))}
        </section>
      </div>
    </div>
  );
}
