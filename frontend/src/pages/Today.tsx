import { useTasks } from "../hooks/useTasks";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { buildWeekAgenda } from "../lib/agenda";
import type { DayGroup } from "../lib/agenda";
import AgendaItem from "../components/AgendaItem";
import type { AgendaItem as AgendaItemType } from "../types/task";

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

export default function Today() {
  const { tasks, patchTask } = useTasks();
  const { events, patchEvent } = useCalendarEvents();
  const groups = buildWeekAgenda(tasks, events);

  async function handleToggle(item: AgendaItemType, completed: boolean) {
    if (item.isEvent && item.googleId) {
      await patchEvent(item.googleId, completed);
    } else if (item.taskId != null) {
      await patchTask(item.taskId, { completed });
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">This Week</h1>
      {groups.map((group) => (
        <DaySection key={group.dateKey} group={group} onToggle={handleToggle} />
      ))}
    </div>
  );
}
