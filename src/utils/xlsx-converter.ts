import * as XLSX from "xlsx";
import { IWeekGroup } from "../types";

/**
 * Export Excel dengan AI summary, generate per commit
 */
export async function exportWeekToExcel(group: IWeekGroup) {
  if (!group.commits || group.commits.length === 0) {
    throw new Error("No commits to export");
  }

  const data: any[] = [];
  data.push(["SHA", "Author", "Date", "AI Summary"]);

  for (const commit of group.commits) {
    try {
      const res = await fetch(`/api/commits/ai/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commit: commit.message, type: "daily" }),
      });

      if (!res.ok) throw new Error("Failed to generate AI summary");

      const respData = await res.json();
      const summary: string = respData.summary ?? "";

      data.push([commit.sha, commit.author, commit.date, summary]);
    } catch (err: any) {
      console.error("AI summary error for commit", commit.sha, err);
      data.push([commit.sha, commit.author, commit.date, ""]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Week ${group.week}`);

  XLSX.writeFile(wb, `Commits_Week_${group.week}_AI.xlsx`);
}
