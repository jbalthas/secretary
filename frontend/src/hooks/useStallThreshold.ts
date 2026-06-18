import { useEffect, useState } from "react";

const URL = "/api/v1/settings/stall-threshold";

export function useStallThreshold() {
  const [days, setDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(URL);
        if (res.ok) setDays((await res.json()).stall_threshold_days);
      } finally { setLoading(false); }
    })();
  }, []);
  async function save(stall_threshold_days: number): Promise<boolean> {
    const res = await fetch(URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stall_threshold_days }),
    });
    if (res.ok) { setDays(stall_threshold_days); return true; }
    return false;
  }
  return { days, loading, save };
}
