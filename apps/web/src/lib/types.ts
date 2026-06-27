// ── Domain Types ──

export interface Collection {
  id: number;
  year: number;
  month: number;
  title: string;
  status: string;
  repoIds: number[] | null;
}

export interface Analysis {
  id: number;
  repoId: number;
  status: string;
  workItems: string;
  category: string;
  summary: string;
  impact: string;
  risks: string;
  nextSuggestions: string;
  isEdited: boolean;
  error: string;
}

export interface Report {
  id: number;
  title: string;
  content: string;
  style?: string;
  isEdited: boolean;
  updatedAt?: string;
}

export interface Repo {
  id: number;
  name: string;
}

export interface LlmProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Commit {
  id: number;
  repoId: number;
  hash: string;
  authorName: string;
  date: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  patchSnippets: string;
  changedFiles: string;
}

export interface ShareInfo {
  slug: string;
  visibility: string;
  url: string;
}

export type ToastType = "success" | "error" | "loading";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}
