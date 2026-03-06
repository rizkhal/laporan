import { IGithubCommit } from "../types";

export async function generateSummary(
  commits: IGithubCommit[],
): Promise<string> {
  const lines = commits.map((c) => c.commit.message);

  const res = await fetch(`/api/commits/ai/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commits: lines }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to generate summary");
  }

  const data = await res.json();
  return data.summary ?? "Could not generate summary.";
}
