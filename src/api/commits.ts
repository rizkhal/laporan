import { IDBCommit } from "../types";

// Get commits from database (Database First approach)
export async function getCommits(): Promise<{
  commits: IDBCommit[];
  lastSync: string | null;
  count: number;
  message?: string;
}> {
  const res = await fetch(`/api/commits`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to load commits");
  }

  return res.json();
}

// Sync commits from GitHub and save to database
export async function syncCommits(): Promise<{
  commits: IDBCommit[];
  lastSync: string;
  count: number;
  message: string;
}> {
  const res = await fetch(`/api/commits/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to sync commits");
  }

  return res.json();
}

export async function generateSummary(commits: IDBCommit[]): Promise<string> {
  const commitsMapped = commits.map((c) => c.message);

  const commitMessages: string[] = commitsMapped.filter(
    (m) => typeof m === "string",
  );

  const lines = commitMessages.map((m) => `- ${m}`).join("\n");

  const res = await fetch(`/api/commits/ai/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commit: lines, type: "weekly" }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to generate summary");
  }

  const data = await res.json();
  return data.summary ?? "Could not generate summary.";
}
