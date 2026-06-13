import { useTasks } from "../hooks/useTasks";
import { buildAgenda } from "../lib/agenda";
import AgendaItem from "../components/AgendaItem";

export default function Today() {
  const { tasks } = useTasks();
  const agenda = buildAgenda(tasks);

  const allDayItems = agenda.filter((i) => i.time === null);
  const timedItems = agenda.filter((i) => i.time !== null);

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
                <AgendaItem key={item.id} item={item} />
              ))}
            </section>
          )}
          {timedItems.map((item) => (
            <AgendaItem key={item.id} item={item} />
          ))}
        </>
      )}
    </div>
  );
}
