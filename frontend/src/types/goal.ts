export type GoalType = "career" | "life" | "health" | "learning" | "financial";
export type GoalStatus = "active" | "archived" | "completed";

export interface Milestone {
  id: number;
  goal_id: number;
  title: string;
  target_date: string | null;
  done: boolean;
}

export interface Goal {
  id: number;
  title: string;
  type: GoalType;
  description: string | null;
  target_date: string | null;
  status: GoalStatus;
  external_key: string | null;
  list_name: string | null;
  created_at: string;
  updated_at: string;
  progress_pct: number;
  milestones: Milestone[];
}

export interface GoalCreate {
  title: string;
  type: GoalType;
  description?: string;
  target_date?: string;
  list_name?: string | null;
}

export interface GoalUpdate {
  title?: string;
  type?: GoalType;
  description?: string;
  target_date?: string;
  status?: GoalStatus;
  list_name?: string | null;
}

export interface MilestoneCreate {
  title: string;
  target_date?: string;
}

export interface IngestEntityDiff {
  external_key: string;
  title: string;
  action: "create" | "update";
}

export interface IngestPreviewResult {
  goals: IngestEntityDiff[];
  tasks: IngestEntityDiff[];
  routines: IngestEntityDiff[];
  habits: IngestEntityDiff[];
}
