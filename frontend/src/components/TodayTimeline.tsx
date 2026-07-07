import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import AgendaItem from "./AgendaItem";
import { markTimeline } from "../lib/nowView";
import { groupAgendaItemsByParent, moveInOrder, applyManualOrder } from "../lib/taskHierarchy";
import { resolveDropIntent } from "../lib/dragIntent";
import type { AgendaItem as AgendaItemType } from "../types/task";

interface TodayTimelineProps {
  items: AgendaItemType[];
  nowHHMM: string;
  onToggle: (item: AgendaItemType, completed: boolean) => Promise<void>;
  onSetParent: (item: AgendaItemType, parentTaskId: number | null) => Promise<void>;
}

// Mirrors the backend's one-level nesting rule (app/services/task_hierarchy.py):
// only a standalone Task (not a planned block, not itself nested, not a
// calendar event) can be a valid nest target.
function isNestable(item: AgendaItemType): boolean {
  return !item.isEvent && item.taskId != null && !item.isBlock && item.parentTaskId == null;
}

export default function TodayTimeline({ items, nowHHMM, onToggle, onSetParent }: TodayTimelineProps) {
  const [manualOrderIds, setManualOrderIds] = useState<string[]>([]);
  const [errorsById, setErrorsById] = useState<Record<string, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (items.length === 0) {
    return <p className="timeline-empty">Nothing scheduled today</p>;
  }

  const { topLevel, childrenByTaskId } = groupAgendaItemsByParent(items);
  const orderedTopLevel = applyManualOrder(topLevel, manualOrderIds);
  const marked = markTimeline(orderedTopLevel, nowHHMM);

  const itemById = new Map<string, AgendaItemType>();
  for (const item of items) itemById.set(item.id, item);

  async function trySetParent(item: AgendaItemType, parentTaskId: number | null) {
    setErrorsById((prev) => {
      if (!(item.id in prev)) return prev;
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    try {
      await onSetParent(item, parentTaskId);
    } catch {
      setErrorsById((prev) => ({ ...prev, [item.id]: "Couldn't update — try again" }));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeItem = itemById.get(String(event.active.id));
    if (!activeItem) return;

    if (event.over == null) {
      // Dropped in empty timeline space (D-10): un-nest if currently nested,
      // no-op if it was already top-level.
      if (activeItem.parentTaskId != null) {
        trySetParent(activeItem, null);
      }
      return;
    }

    const overItem = itemById.get(String(event.over.id));
    if (!overItem || overItem.id === activeItem.id) return;

    // dnd-kit does not expose a raw pointer-Y coordinate on drag events; the
    // dragged element's live translated top is used as a proxy against the
    // hovered row's measured rect, per resolveDropIntent's documented contract.
    const pointerY = event.active.rect.current.translated?.top ?? event.over.rect.top;
    const intent = resolveDropIntent(pointerY, event.over.rect.top, event.over.rect.height);

    if (intent === "nest") {
      if (isNestable(overItem) && overItem.taskId != null) {
        trySetParent(activeItem, overItem.taskId);
      }
      return;
    }

    // "before"/"after" (D-03's reorder gesture) only applies to the flat
    // top-level list — nested children are excluded from this in-memory,
    // session-level manual order (persistence is intentionally out of scope).
    if (activeItem.parentTaskId == null && overItem.parentTaskId == null) {
      const baseOrder = manualOrderIds.length > 0 ? manualOrderIds : topLevel.map((i) => i.id);
      setManualOrderIds(moveInOrder(baseOrder, activeItem.id, overItem.id, intent));
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="today-timeline">
        {marked.map(({ item, phase }) => (
          <div key={item.id} className={`timeline-row timeline-row--${phase}`}>
            <div className={`timeline-node timeline-node--${phase}`} />
            <div className="timeline-item-body">
              <AgendaItem
                item={item}
                onToggle={onToggle}
                onSetParent={trySetParent}
                childItems={childrenByTaskId.get(item.taskId ?? -1)}
                errorsById={errorsById}
              />
            </div>
          </div>
        ))}
      </div>
    </DndContext>
  );
}
