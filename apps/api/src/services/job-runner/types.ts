// ── Job Types ──

export type JobType =
  | "clone_repository"
  | "refresh_repository"
  | "collect_commits"
  | "analyze_collection"
  | "generate_report";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobPayload {
  repositoryId?: number;
  collectionId?: number;
  repoId?: number;
  llmProviderId?: number;
  style?: string;
  [key: string]: any;
}
