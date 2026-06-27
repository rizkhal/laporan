export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface CommitInput {
  hash: string;
  message: string;
  authorName: string;
  date: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedFiles: string[];
  diffStat: { file: string; insertions: number; deletions: number }[];
  patchSnippets: { file: string; patch: string }[];
}

export interface AnalysisOutput {
  workItems: {
    judul: string;
    deskripsi: string;
    kategori: string;
    dampak: "tinggi" | "sedang" | "rendah";
    bukti: { hashCommit: string; berkas: string }[];
    keyakinan: "tinggi" | "sedang" | "rendah";
  }[];
  ringkasan: string;
  dampak: string;
  risiko: string;
  rekomendasi: string;
}
