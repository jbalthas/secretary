import { useEffect, useState } from "react";
import type { CalendarEvent } from "../types/task";

const API = "/api/v1/events/today";

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  async function refresh() {
    try {
      const res = await fetch(API);
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
  }, []);

  return { events, refresh, patchEvent };
}
