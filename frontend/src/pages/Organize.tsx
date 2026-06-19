import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  GripVertical,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { usePlan } from "../hooks/usePlan";
import { useTasks } from "../hooks/useTasks";
import { useWorkHours } from "../hooks/useWorkHours";
import {
  sortOrganizeTasks,
  type OrganizeTaskSort,
} from "../lib/organizeTaskSort";
import { appendCurrentTasksToPlan } from "../lib/organizePlan";
import type { ProposedBlock } from "../types/plan";
import type { Task } from "../types/task";

type Phase = "loading" | "proposing" | "editing" | "saving" | "done";

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function durationMinutes(start: string, end: string): number {
  return Math.max(5, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function withStartAndDuration(block: ProposedBlock, timeStr: string, minutes: number): ProposedBlock {
  if (!/^\d{2}:\d{2}$/.test(timeStr) || !Number.isFinite(minutes)) return block;
  const start = new Date(block.start_dt);
  const [hours, mins] = timeStr.split(":").map(Number);
  if (hours > 23 || mins > 59) return block;
  start.setHours(hours, mins, 0, 0);
  return {
    ...block,
    start_dt: start.toISOString(),
    end_dt: new Date(start.getTime() + Math.max(5, minutes) * 60000).toISOString(),
  };
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTimeRange(startIso: string, endIso: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(startIso))} – ${formatter.format(new Date(endIso))}`;
}

function priorityLabel(task: Task): string {
  if (task.due_date && new Date(task.due_date).getTime() <= Date.now()) return "Due";
  return `${task.priority[0].toUpperCase()}${task.priority.slice(1)}`;
}

function taskBlock(task: Task, startTime: string): ProposedBlock {
  const start = new Date();
  const [hours, minutes] = startTime.split(":").map(Number);
  start.setHours(hours, minutes, 0, 0);
  const duration = task.estimated_minutes || 30;
  return {
    task_id: task.id,
    title: task.title,
    start_dt: start.toISOString(),
    end_dt: new Date(start.getTime() + duration * 60000).toISOString(),
  };
}

export default function Organize() {
  const today = new Date();
  const todayKey = localDateKey(today);
  const { blocks, loading, fetchBlocks, propose, approve, replan } = usePlan(todayKey);
  const { tasks, refresh: refreshTasks } = useTasks();
  const { events } = useCalendarEvents();
  const { workStart, workEnd, loading: workHoursLoading } = useWorkHours();

  const [phase, setPhase] = useState<Phase>("loading");
  const [draftBlocks, setDraftBlocks] = useState<ProposedBlock[]>([]);
  const [isReplacement, setIsReplacement] = useState(false);
  const [calendarFull, setCalendarFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskSort, setTaskSort] = useState<OrganizeTaskSort>("priority");
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("18:00");
  const [scheduleWindowReady, setScheduleWindowReady] = useState(false);
  const initialized = useRef(false);
  const planApprovedAt = useRef<Date | null>(null);
  const manuallyRemovedTaskIds = useRef(new Set<number>());

  const incompleteTasks = useMemo(() => tasks.filter((task) => !task.completed), [tasks]);
  const scheduledTaskIds = useMemo(
    () => new Set(draftBlocks.flatMap((block) => (block.task_id == null ? [] : [block.task_id]))),
    [draftBlocks],
  );
  const queuedTasks = useMemo(() => {
    const unscheduled = incompleteTasks.filter((task) => !scheduledTaskIds.has(task.id));
    return sortOrganizeTasks(unscheduled, taskSort);
  }, [incompleteTasks, scheduledTaskIds, taskSort]);
  const timedEvents = useMemo(
    () =>
      events
        .filter((event) => !event.all_day && event.start_dt && event.end_dt)
        .sort((a, b) => new Date(a.start_dt!).getTime() - new Date(b.start_dt!).getTime()),
    [events],
  );
  const sortedDrafts = useMemo(
    () => draftBlocks.map((block, index) => ({ block, index })).sort((a, b) =>
      new Date(a.block.start_dt).getTime() - new Date(b.block.start_dt).getTime()),
    [draftBlocks],
  );
  const scheduleItems = useMemo(
    () =>
      [
        ...timedEvents.map((event) => ({
          kind: "event" as const,
          start: new Date(event.start_dt!).getTime(),
          event,
        })),
        ...sortedDrafts.map(({ block, index }) => ({
          kind: "task" as const,
          start: new Date(block.start_dt).getTime(),
          block,
          index,
        })),
      ].sort((a, b) => a.start - b.start),
    [sortedDrafts, timedEvents],
  );

  const hasValidWindow = scheduleStart < scheduleEnd;

  async function loadProposal() {
    if (!hasValidWindow) {
      setError("Choose an end time that is later than the start time.");
      setPhase("editing");
      return;
    }
    setError(null);
    setPhase("proposing");
    const result = await propose(todayKey, scheduleStart, scheduleEnd);
    if (!result) {
      setError("Could not build a plan. You can still add tasks manually.");
      setDraftBlocks([]);
      setPhase("editing");
      return;
    }
    setDraftBlocks(result.blocks);
    setCalendarFull(result.fully_booked);
    setPhase("editing");
  }

  useEffect(() => {
    if (workHoursLoading || scheduleWindowReady) return;
    setScheduleStart(workStart || "09:00");
    setScheduleEnd(workEnd || "18:00");
    setScheduleWindowReady(true);
  }, [scheduleWindowReady, workEnd, workHoursLoading, workStart]);

  useEffect(() => {
    if (loading || !scheduleWindowReady || initialized.current) return;
    initialized.current = true;
    if (blocks.length > 0) {
      planApprovedAt.current = blocks.reduce((latest, block) => {
        const approvedAt = new Date(block.approved_at);
        return approvedAt > latest ? approvedAt : latest;
      }, new Date(blocks[0].approved_at));
      setDraftBlocks(
        blocks.map(({ task_id, title, start_dt, end_dt }) => ({ task_id, title, start_dt, end_dt })),
      );
      setIsReplacement(true);
      setPhase("editing");
    } else {
      void loadProposal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, scheduleWindowReady]);

  useEffect(() => {
    if (!initialized.current) return;
    setDraftBlocks((current) =>
      appendCurrentTasksToPlan(
        current,
        incompleteTasks.filter((task) => !manuallyRemovedTaskIds.current.has(task.id)),
        scheduleStart,
        new Date(),
        planApprovedAt.current,
        scheduleEnd,
      ),
    );
  }, [incompleteTasks, scheduleEnd, scheduleStart]);

  useEffect(() => {
    function refreshCurrentTasks() {
      void refreshTasks();
    }

    function refreshVisibleTasks() {
      if (document.visibilityState === "visible") refreshCurrentTasks();
    }

    window.addEventListener("focus", refreshCurrentTasks);
    document.addEventListener("visibilitychange", refreshVisibleTasks);
    return () => {
      window.removeEventListener("focus", refreshCurrentTasks);
      document.removeEventListener("visibilitychange", refreshVisibleTasks);
    };
    // Refresh only in response to browser lifecycle events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nextStartTime(): string {
    const fallback = scheduleStart;
    if (draftBlocks.length === 0) return fallback;
    const latestEnd = draftBlocks.reduce((latest, block) => {
      const end = new Date(block.end_dt);
      return end > latest ? end : latest;
    }, new Date(draftBlocks[0].end_dt));
    latestEnd.setMinutes(Math.ceil(latestEnd.getMinutes() / 15) * 15, 0, 0);
    return `${String(latestEnd.getHours()).padStart(2, "0")}:${String(latestEnd.getMinutes()).padStart(2, "0")}`;
  }

  function scheduleTask(task: Task) {
    manuallyRemovedTaskIds.current.delete(task.id);
    setDraftBlocks((current) => [...current, taskBlock(task, nextStartTime())]);
  }

  function removeBlock(index: number) {
    setDraftBlocks((current) => {
      const taskId = current[index]?.task_id;
      if (taskId != null) manuallyRemovedTaskIds.current.add(taskId);
      return current.filter((_, blockIndex) => blockIndex !== index);
    });
  }

  function updateBlock(index: number, time: string, duration: number) {
    setDraftBlocks((current) =>
      current.map((block, blockIndex) =>
        blockIndex === index ? withStartAndDuration(block, time, duration) : block,
      ),
    );
  }

  async function autoArrange() {
    manuallyRemovedTaskIds.current.clear();
    setIsReplacement(isReplacement || blocks.length > 0);
    await loadProposal();
  }

  async function savePlan() {
    setError(null);
    setPhase("saving");
    try {
      if (isReplacement || blocks.length > 0) {
        await replan(todayKey, draftBlocks);
      } else {
        await approve(todayKey, draftBlocks);
      }
      await fetchBlocks();
      planApprovedAt.current = new Date();
      setPhase("done");
    } catch (saveError) {
      if (saveError instanceof Error && saveError.message === "already_approved") {
        setIsReplacement(true);
        await replan(todayKey, draftBlocks);
        await fetchBlocks();
        setPhase("done");
      } else {
        setError("Your plan could not be saved. Please try again.");
        setPhase("editing");
      }
    }
  }

  if (phase === "loading" || phase === "proposing") {
    return (
      <div className="page organize-page">
        <div className="organize-loading">
          <Sparkles size={20} />
          <span>{phase === "proposing" ? "Arranging your day…" : "Loading your day…"}</span>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="page organize-page">
        <div className="organize-success">
          <span className="organize-success-icon"><Check size={24} /></span>
          <h1>Your day is organized.</h1>
          <p>{draftBlocks.length} task{draftBlocks.length === 1 ? "" : "s"} placed on today&apos;s plan.</p>
          <Link to="/today" className="organize-primary-button">
            View today <ArrowRight size={17} />
          </Link>
          <button type="button" className="organize-text-button" onClick={() => setPhase("editing")}>
            Keep editing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page organize-page">
      <header className="organize-header">
        <div>
          <h1 className="organize-title">Organize</h1>
          <p className="organize-date">{formatLongDate(today)}</p>
        </div>
        <div className="organize-header-tools">
          <fieldset className="organize-window">
            <legend>Arrange between</legend>
            <label>
              <span>Start</span>
              <input
                type="time"
                value={scheduleStart}
                onChange={(event) => setScheduleStart(event.target.value)}
                onInput={(event) => setScheduleStart(event.currentTarget.value)}
                aria-label="Auto-arrange start time"
              />
            </label>
            <span className="organize-window-separator">to</span>
            <label>
              <span>End</span>
              <input
                type="time"
                value={scheduleEnd}
                onChange={(event) => setScheduleEnd(event.target.value)}
                onInput={(event) => setScheduleEnd(event.currentTarget.value)}
                aria-label="Auto-arrange end time"
              />
            </label>
          </fieldset>
          <div className="organize-header-actions">
            <button
              type="button"
              className="organize-secondary-button"
              onClick={() => void autoArrange()}
              disabled={!hasValidWindow}
            >
              <Sparkles size={16} /> Auto-arrange
            </button>
            <button
              type="button"
              className="organize-primary-button"
              onClick={() => void savePlan()}
              disabled={phase === "saving"}
            >
              <Check size={17} /> {phase === "saving" ? "Saving…" : isReplacement ? "Save changes" : "Save plan"}
            </button>
          </div>
        </div>
      </header>

      {calendarFull ? (
        <div className="organize-notice" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>Your day is booked from 8 AM to 8 PM, but it still belongs to you.</strong>
            <span>
              Plan your whole life here—not just work. Place anything that matters where it belongs, even if it
              overlaps a commitment.
            </span>
          </div>
        </div>
      ) : null}

      {error ? <div className="organize-error">{error}</div> : null}

      <div className="organize-workspace">
        <aside className="organize-task-panel" aria-label="Unscheduled tasks">
          <div className="organize-panel-heading">
            <div>
              <h2>Tasks</h2>
              <p>{queuedTasks.length} waiting to be placed</p>
            </div>
            <div className="organize-task-tools">
              <label className="organize-sort-control">
                <span>Sort tasks</span>
                <select
                  value={taskSort}
                  onChange={(event) => setTaskSort(event.target.value as OrganizeTaskSort)}
                  aria-label="Sort tasks"
                >
                  <option value="priority">Priority</option>
                  <option value="list">List</option>
                </select>
              </label>
              <span className="organize-count">{queuedTasks.length}</span>
            </div>
          </div>

          <div className="organize-task-list">
            {queuedTasks.length === 0 ? (
              <div className="organize-empty-queue">
                <Check size={18} />
                <span>Everything is on the schedule.</span>
              </div>
            ) : (
              queuedTasks.map((task) => (
                <article className="organize-task-card" key={task.id}>
                  <div className="organize-task-copy">
                    <h3>{task.title}</h3>
                    <div className="organize-task-meta">
                      <span className={`organize-priority organize-priority--${task.priority}`}>
                        {priorityLabel(task)}
                      </span>
                      <span><Clock3 size={13} /> {task.estimated_minutes || 30} min</span>
                      {task.list_name ? <span>{task.list_name}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="organize-add-button"
                    aria-label={`Add ${task.title} to schedule`}
                    onClick={() => scheduleTask(task)}
                  >
                    <Plus size={18} />
                  </button>
                </article>
              ))
            )}
          </div>
        </aside>

        <main className="organize-schedule-panel" aria-label="Today's schedule">
          <div className="organize-panel-heading organize-schedule-heading">
            <div>
              <h2>Today&apos;s schedule</h2>
              <p>{scheduleStart} – {scheduleEnd} · {draftBlocks.length} flexible block{draftBlocks.length === 1 ? "" : "s"}</p>
            </div>
            <CalendarDays size={19} />
          </div>

          <div className="organize-legend" aria-label="Schedule legend">
            <span><i className="organize-legend-dot organize-legend-dot--event" /> Calendar</span>
            <span><i className="organize-legend-dot organize-legend-dot--task" /> Flexible task</span>
          </div>

          <div className="organize-timeline">
            {scheduleItems.map((item) => {
              if (item.kind === "event") {
                return (
                  <article className="organize-calendar-block" key={item.event.google_id}>
                    <div className="organize-time-column">
                      {toTimeInput(item.event.start_dt!)}
                    </div>
                    <div className="organize-calendar-content">
                      <span className="organize-fixed-label">Fixed</span>
                      <h3>{item.event.title}</h3>
                      <p>{formatTimeRange(item.event.start_dt!, item.event.end_dt!)}</p>
                    </div>
                  </article>
                );
              }
              const minutes = durationMinutes(item.block.start_dt, item.block.end_dt);
              return (
                <article className="organize-planned-block" key={`${item.block.task_id ?? "custom"}-${item.index}`}>
                  <div className="organize-time-column">
                    {toTimeInput(item.block.start_dt)}
                  </div>
                  <div className="organize-planned-content">
                    <GripVertical className="organize-grip" size={18} aria-hidden="true" />
                    <div className="organize-planned-copy">
                      <h3>{item.block.title}</h3>
                      <div className="organize-block-controls">
                        <label>
                          <span>Start</span>
                          <input
                            type="time"
                            value={toTimeInput(item.block.start_dt)}
                            onChange={(event) => updateBlock(item.index, event.target.value, minutes)}
                            onInput={(event) => updateBlock(item.index, event.currentTarget.value, minutes)}
                            aria-label={`Start time for ${item.block.title}`}
                          />
                        </label>
                        <label>
                          <span>Duration</span>
                          <div className="organize-duration-input">
                            <input
                              type="number"
                              min={5}
                              step={5}
                              value={minutes}
                              onChange={(event) => {
                                const nextDuration = event.target.valueAsNumber;
                                if (Number.isFinite(nextDuration)) {
                                  updateBlock(item.index, toTimeInput(item.block.start_dt), nextDuration);
                                }
                              }}
                              onInput={(event) => {
                                const nextDuration = event.currentTarget.valueAsNumber;
                                if (Number.isFinite(nextDuration)) {
                                  updateBlock(item.index, toTimeInput(item.block.start_dt), nextDuration);
                                }
                              }}
                              aria-label={`Duration for ${item.block.title}`}
                            />
                            <span>min</span>
                          </div>
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="organize-remove-button"
                      aria-label={`Remove ${item.block.title} from schedule`}
                      onClick={() => removeBlock(item.index)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              );
            })}

            {timedEvents.length === 0 && draftBlocks.length === 0 ? (
              <div className="organize-empty-schedule">
                <Clock3 size={22} />
                <h3>Start shaping your day</h3>
                <p>Add a task from the queue and set the time that works for you.</p>
              </div>
            ) : null}
          </div>

          <div className="organize-schedule-footer">
            <span>Changes stay local until you save.</span>
            {isReplacement ? (
              <button type="button" className="organize-text-button" onClick={() => void autoArrange()}>
                <RotateCcw size={14} /> Reset to suggested plan
              </button>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
