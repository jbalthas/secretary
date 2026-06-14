export interface CalendarEvent {
  google_id: string;
  title: string;
  start_dt: string | null;
  end_dt: string | null;
  all_day: boolean;
  start_date: string | null;
}

export interface CalendarStatus {
  connected: boolean;
  last_synced_at: string | null;
}
