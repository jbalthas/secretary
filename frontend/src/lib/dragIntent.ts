export type DropIntent = "nest" | "before" | "after";

/**
 * Classifies where a dragged item was dropped relative to a target row/card,
 * per D-03 (locked): center band = nest as subtask, top/bottom edge bands =
 * reorder in the flat list. This function only classifies pointer position —
 * it does not itself reorder anything. The consuming component is
 * responsible for calling taskHierarchy's moveInOrder()/applyManualOrder()
 * when the intent is "before"/"after" so the reorder actually takes effect
 * (in-memory/session-level per Claude's discretion over the persistence
 * mechanism — see taskHierarchy.ts's moveInOrder/applyManualOrder docstring).
 * "nest" intent instead triggers a parent_task_id mutation via the backend.
 */
export function resolveDropIntent(pointerY: number, rectTop: number, rectHeight: number): DropIntent {
  const relative = (pointerY - rectTop) / rectHeight;
  if (relative < 0.25) return "before";
  if (relative > 0.75) return "after";
  return "nest";
}
