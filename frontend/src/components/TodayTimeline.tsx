import AgendaItem from "./AgendaItem";
import { markTimeline } from "../lib/nowView";
import type { AgendaItem as AgendaItemType } from "../types/task";

interface TodayTimelineProps {
  items: AgendaItemType[];
  nowHHMM: string;
  onToggle: (item: AgendaItemType, completed: boolean) => Promise<void>;
}

export default function TodayTimeline({ items, nowHHMM, onToggle }: TodayTimelineProps) {
  if (items.length === 0) {
    return <p className="timeline-empty">Nothing scheduled today</p>;
  }

  const marked = markTimeline(items, nowHHMM);

  return (
    <div className="today-timeline">
      {marked.map(({ item, phase }) => (
        <div
          key={item.id}
          className={`timeline-row timeline-row--${phase}`}
        >
          <div className={`timeline-node timeline-node--${phase}`} />
          <div className="timeline-item-body">
            <AgendaItem item={item} onToggle={onToggle} />
          </div>
        </div>
      ))}
    </div>
  );
}
