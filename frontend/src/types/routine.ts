export type RoutineAction = "send_daily_brief";

export interface Routine {
  id: number;
  name: string;
  cron: string;
  action: RoutineAction;
  enabled: boolean;
  created_at: string;
}

export interface RoutineInput {
  name: string;
  cron: string;
  action: RoutineAction;
}
