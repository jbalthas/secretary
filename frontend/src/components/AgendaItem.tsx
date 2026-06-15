import type { AgendaItem as AgendaItemType } from "../types/task";

interface Props {
  item: AgendaItemType;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const date = new Date(0);
  date.setUTCHours(h, m);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

export default function AgendaItem({ item }: Props) {
  const timeLabel = item.time ? formatTime(item.time) : null;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 0",
    minHeight: 48,
    borderBottom: "1px solid var(--border)",
  };

  const titleStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 16,
    fontStyle: item.isEvent ? "italic" : "normal",
    color: "var(--text)",
  };

  const timeStyle: React.CSSProperties = {
    fontSize: 14,
    color: "var(--text-secondary)",
    flexShrink: 0,
  };

  return (
    <div style={rowStyle} className={item.isEvent ? "agenda-item--event" : undefined}>
      <span style={titleStyle}>{item.title}</span>
      {!item.isEvent && item.priority && (
        <span
          className={`priority-badge priority-${item.priority}`}
          aria-label={`Priority: ${item.priority}`}
        >
          {item.priority === "high" ? "High" : item.priority === "medium" ? "Med" : "Low"}
        </span>
      )}
      {timeLabel && <span style={timeStyle}>{timeLabel}</span>}
    </div>
  );
}
