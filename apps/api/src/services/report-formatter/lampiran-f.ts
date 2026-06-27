import type { CommitRow, RepoAnalysisData } from "./types";
import { getCategoryLabel } from "./templates";
import { buildWorkItemCommitMap } from "./sections";

export function generateLampiranF(
  repoAnalyses: RepoAnalysisData[],
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran F — Ringkasan Repositori");
  parts.push("");
  parts.push("Ringkasan setiap repositori yang mencakup gambaran umum aktivitas dan hasil analisis.");
  parts.push("");

  buildWorkItemCommitMap(repoAnalyses, allCommits, allRepos);

  for (const repo of repoAnalyses) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.repoId);

    parts.push(`**Repositori:** ${repo.repoName}`);
    parts.push("");

    parts.push(`**Ringkasan:** ${repo.summary || "Belum ada ringkasan yang tersedia."}`);
    parts.push("");

    // Stats
    parts.push("| Metrik | Nilai |");
    parts.push("|--------|-------|");
    parts.push(`| Total Commit | ${repo.totalCommits} |`);
    parts.push(`| Berkas Diubah | ${repo.totalFilesChanged} |`);
    parts.push(`| Baris Ditambahkan | +${repo.totalInsertions.toLocaleString()} |`);
    parts.push(`| Baris Dihapus | -${repo.totalDeletions.toLocaleString()} |`);
    parts.push(`| Item Pekerjaan | ${repo.workItems.length} |`);
    parts.push("");

    // Work items
    if (repo.workItems.length > 0) {
      parts.push("**Item Pekerjaan:**");
      for (const item of repo.workItems) {
        const bukti = item.bukti || [];
        const commitCount = bukti.length;
        parts.push(`${item.judul} (${getCategoryLabel(item.kategori || "")}, dampak ${item.dampak || "N/A"}, ${commitCount} bukti commit)`);
      }
      parts.push("");
    }

    // Impact & Risks from analysis
    if (repo.impact) {
      parts.push(`**Dampak:** ${repo.impact}`);
      parts.push("");
    }
    if (repo.risks) {
      parts.push(`**Risiko:** ${repo.risks}`);
      parts.push("");
    }
    if (repo.nextSuggestions) {
      parts.push(`**Rekomendasi:** ${repo.nextSuggestions}`);
      parts.push("");
    }

    parts.push("---");
    parts.push("");
  }

  return parts.join("\n");
}
