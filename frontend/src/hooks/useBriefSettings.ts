import { useEffect, useState } from "react";

const URL = "/api/v1/settings/brief-time";

export function useBriefSettings() {
  const [briefTime, setBriefTime] = useState<string | null>(null); // "HH:MM"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(URL);
        if (!res.ok) throw new Error();
        const d = await res.json();
        setBriefTime(`${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`);
      } catch {
        setError("Could not load brief time. Try refreshing.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(time: string): Promise<boolean> {
    const [h, m] = time.split(":").map(Number);
    const res = await fetch(URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hour: h, minute: m }),
    });
    if (res.ok) { setBriefTime(time); return true; }
    return false;
  }

  return { briefTime, loading, error, save };
}
