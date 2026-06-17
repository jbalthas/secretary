import { useEffect, useState } from "react";

const URL = "/api/v1/settings/work-hours";

export function useWorkHours() {
  const [workStart, setWorkStart] = useState<string | null>(null); // "HH:MM"
  const [workEnd, setWorkEnd] = useState<string | null>(null); // "HH:MM"
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(URL);
        if (res.ok) {
          const d = await res.json();
          setWorkStart(d.work_start);
          setWorkEnd(d.work_end);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(work_start: string, work_end: string): Promise<boolean> {
    const res = await fetch(URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work_start, work_end }),
    });
    if (res.ok) {
      setWorkStart(work_start);
      setWorkEnd(work_end);
      return true;
    }
    return false;
  }

  return { workStart, workEnd, loading, save };
}
