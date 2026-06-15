export type Priority = "high" | "medium" | "low";

export interface Task {
  id: number;
  title: string;
  description?: string;
  priority: Priority;
  due_date?: string;
  reminder_at?: string;
  recurrence_cron?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  priority?: Priority;
  due_date?: string;
  reminder_at?: string;
  recurrence_cron?: string;
}

export interface AgendaItem {
  id: string;
  title: string;
  time: string | null;
  priority: Priority | null;
  isEvent: boolean;
  completed: boolean;
  taskId?: number;
  googleId?: string;
}

export interface CalendarEvent {
  google_id: string;
  title: string;
  start_dt: string | null;
  end_dt: string | null;
  all_day: boolean;
  start_date: string | null;
  done: boolean;
}
