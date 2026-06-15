import { useTasks } from "../hooks/useTasks";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { buildAgenda } from "../lib/agenda";
import AgendaItem from "../components/AgendaItem";
import type { AgendaItem as AgendaItemType } from "../types/task";

export default function Today() {
  const { tasks, patchTask } = useTasks();
  const { events, patchEvent } = useCalendarEvents();
  const agenda = buildAgenda(tasks, events);

  const allDayItems = agenda.filter((i) => i.time === null);
  const timedItems = agenda.filter((i) => i.time !== null);

  async function handleToggle(item: AgendaItemType, completed: boolean) {
    if (item.isEvent && item.googleId) {
      await patchEvent(item.googleId, completed);
    } else if (item.taskId != null) {
      await patchTask(item.taskId, { completed });
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Today</h1>

      {agenda.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 48,
            gap: 8,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text)",
              margin: 0,
            }}
          >
            Nothing scheduled today
          </p>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            Add a task with a due time or check back when events sync.
          </p>
        </div>
      ) : (
        <>
          {allDayItems.length > 0 && (
            <section>
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
                <AgendaItem key={item.id} item={item} onToggle={handleToggle} />
              ))}
            </section>
          )}
          {timedItems.map((item) => (
            <AgendaItem key={item.id} item={item} onToggle={handleToggle} />
          ))}
        </>
      )}
    </div>
  );
}
