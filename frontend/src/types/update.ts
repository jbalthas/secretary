export type UpdateStatus = "resolved" | "ambiguous" | "no_match";

export interface UpdateCandidate {
  title: string;
  entity_type: "task" | "block";
  entity_id: number;
  score: number;
}

export interface UpdateResponse {
  status: UpdateStatus;
  action?: "done" | "reschedule" | "drop" | null;
  entity_type?: string | null;
  entity_id?: number | null;
  entity_title?: string | null;
  score?: number | null;
  candidates: UpdateCandidate[];
}
