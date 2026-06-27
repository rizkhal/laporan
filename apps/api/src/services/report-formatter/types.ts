// ── Types ──

export type ReportMode = "ringkas" | "standar" | "lengkap" | "audit";

export interface WorkItemData {
  judul: string;
  deskripsi: string;
  kategori: string;
  dampak: string;
  bukti: { hashCommit: string; berkas: string }[];
  keyakinan: string;
  [key: string]: any;
}

export interface RepoAnalysisData {
  repoName: string;
  repoId: number;
  totalCommits: number;
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
  summary: string;
  impact: string;
  risks: string;
  nextSuggestions: string;
  workItems: WorkItemData[];
  hasAnalysis: boolean;
}

export interface CommitRow {
  id: number;
  collectionId: number;
  repoId: number;
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffStat: string;
  patchSnippets: string;
  changedFiles: string;
  createdAt: string;
}

export interface SectionData {
  name: string;
  repos: {
    repoName: string;
    workItems: WorkItemData[];
    summary: string;
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
  }[];
}
