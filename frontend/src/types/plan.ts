export interface ProposedBlock {
  task_id: number | null;
  title: string;
  start_dt: string; // ISO UTC
  end_dt: string;
}

export interface ProposedDayPlan {
  date: string; // YYYY-MM-DD
  blocks: ProposedBlock[];
  unplaced_task_ids: number[];
  fully_booked: boolean;
}

export interface ScheduledBlock {
  id: number;
  task_id: number | null;
  title: string;
  start_dt: string;
  end_dt: string;
  date_key: string;
  approved_at: string;
  completed: boolean;
  conflict_with: string | null;
}
