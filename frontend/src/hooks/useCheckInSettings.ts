import { useEffect, useState } from "react";

const URL = "/api/v1/settings/check-in-time";

export function useCheckInSettings() {
  const [checkInTime, setCheckInTime] = useState<string | null>(null); // "HH:MM"
  const [checkInEnabled, setCheckInEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(URL);
        if (!res.ok) throw new Error();
        const d = await res.json();
        setCheckInTime(`${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`);
        setCheckInEnabled(d.enabled ?? true);
      } catch {
        setError("Could not load check-in settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(time: string, enabled: boolean): Promise<boolean> {
    const [h, m] = time.split(":").map(Number);
    const res = await fetch(URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hour: h, minute: m, enabled }),
    });
    if (res.ok) { setCheckInTime(time); setCheckInEnabled(enabled); return true; }
    return false;
  }

  return { checkInTime, checkInEnabled, loading, error, save };
}
