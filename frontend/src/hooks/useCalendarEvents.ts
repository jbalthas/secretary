import { useEffect, useState } from "react";
import type { CalendarEvent } from "../types/task";

function localTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useCalendarEvents(days: number = 1) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  async function refresh() {
    try {
      const url =
        days <= 1
          ? "/api/v1/events/today"
          : `/api/v1/events/range?start=${localTodayKey()}&days=${days}`;
      const res = await fetch(url);
      if (res.ok) {
        setEvents(await res.json());
      } else {
        setEvents([]);
      }
    } catch {
      setEvents([]);
    }
  }

  async function patchEvent(google_id: string, done: boolean) {
    await fetch(`/api/v1/events/${google_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    await refresh();
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return { events, refresh, patchEvent };
}
