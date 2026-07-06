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
  parent_list_name: string | null;
  created_at: string;
  updated_at: string;
  progress_pct: number;
  milestones: Milestone[];
  priority_rank?: number | null;
}

export interface GoalCreate {
  title: string;
  type: GoalType;
  description?: string;
  target_date?: string;
  list_name?: string | null;
  parent_list_name?: string | null;
}

export interface GoalUpdate {
  title?: string;
  type?: GoalType;
  description?: string;
  target_date?: string;
  status?: GoalStatus;
  list_name?: string | null;
  parent_list_name?: string | null;
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

export interface AdvisoryFieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

export interface AdvisoryEntityDiff {
  external_key: string;
  title: string;
  action: "update" | "create";
  rationale: string;
  fields: AdvisoryFieldChange[];
}

export interface AdvisoryPreviewResult {
  goals: AdvisoryEntityDiff[];
  milestones: AdvisoryEntityDiff[];
  new_tasks: AdvisoryEntityDiff[];
  notes: string | null;
  session_id: string;
  generated_at: string;
}

export interface AdvisoryResult {
  created: Record<string, number>;
  updated: Record<string, number>;
  advisory_id: string;
  replayed: boolean;
}
