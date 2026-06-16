export type RoutineAction = "send_daily_brief";

export interface Routine {
  id: number;
  name: string;
  cron: string;
  action: RoutineAction;
  enabled: boolean;
  goal_id?: number | null;
  created_at: string;
}

export interface RoutineInput {
  name: string;
  cron: string;
  action: RoutineAction;
  goal_id?: number | null;
}
