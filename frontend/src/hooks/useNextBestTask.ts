import { useEffect, useState } from "react";
import type { Task } from "../types/task";

export function useNextBestTask() {
  const [task, setTask] = useState<Task | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/guidance/next-best-task");
        if (res.ok) {
          const d = await res.json();
          setTask(d ?? null);
        }
      } catch {
        // silent fail — banner is supplementary (11-UI-SPEC States)
      }
    })();
  }, []);
  return { task };
}
