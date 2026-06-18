export type Priority = "high" | "medium" | "low";

export interface Task {
  id: number;
  title: string;
  description?: string;
  priority: Priority;
  due_date?: string;
  reminder_at?: string;
  recurrence_cron?: string;
  estimated_minutes?: number | null;
  list_name?: string | null;
  completed: boolean;
  goal_id?: number | null;
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
  estimated_minutes?: number | null;
  list_name?: string | null;
  goal_id?: number | null;
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
  isBlock?: boolean;
  conflict_with?: string | null;
  blockId?: number;
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
