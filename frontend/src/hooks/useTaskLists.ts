import { useCallback, useEffect, useState } from "react";
import type { TaskListGroup } from "../types/taskList";

export function useTaskLists() {
  const [listGroups, setListGroups] = useState<TaskListGroup[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/tasks/list-hierarchy");
    if (!response.ok) return;
    setListGroups(await response.json());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { listGroups, refresh };
}
