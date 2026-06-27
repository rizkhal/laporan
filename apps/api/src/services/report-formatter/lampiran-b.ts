import type { CommitRow, RepoAnalysisData } from "./types";
import { buildWorkItemCommitMap } from "./sections";

export function generateLampiranB(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  repoAnalyses: RepoAnalysisData[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran B — Rincian Aktivitas Pengembangan");
  parts.push("");
  parts.push("Rincian setiap commit yang tercatat selama periode pelaporan, termasuk keterkaitannya dengan item pekerjaan yang teridentifikasi.");
  parts.push("");

  const workItemCommitMap = buildWorkItemCommitMap(repoAnalyses, allCommits, allRepos);

  // Build a lookup: hash → work item names
  const hashToWorkItems = new Map<string, string[]>();
  for (const ref of workItemCommitMap) {
    for (const c of ref.commits) {
      const h = c.hash.toLowerCase();
      if (!hashToWorkItems.has(h)) hashToWorkItems.set(h, []);
      hashToWorkItems.get(h)!.push(ref.workItem.judul);
    }
  }

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    if (repoCommits.length === 0) continue;

    parts.push(`**Repositori:** ${repo.name}`);
    parts.push("");

    for (const c of repoCommits) {
      const relatedItems = hashToWorkItems.get(c.hash.toLowerCase()) || [];

      parts.push(`#### Commit ${c.hash.slice(0, 8)}`);
      parts.push("");
      parts.push(`**Tanggal:** ${new Date(c.date).toLocaleDateString("id-ID")}`);
      parts.push(`**Author:** ${c.authorName}`);
      parts.push(`**Pesan:** ${c.message}`);
      parts.push(`**Perubahan:** \`+${c.insertions}/-${c.deletions}\` baris di ${c.filesChanged} berkas`);
      parts.push("");

      if (relatedItems.length > 0) {
        parts.push("**Item Pekerjaan Terkait:**");
        for (const item of [...new Set(relatedItems)]) {
          parts.push(item);
        }
        parts.push("");
      }

      // Changed files
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      if (changedFiles.length > 0) {
        parts.push("**Berkas yang Diubah:**");
        for (const f of changedFiles) {
          parts.push('`' + f + '`');
        }
        parts.push("");
      }
    }

    parts.push("---");
    parts.push("");
  }

  return parts.join("\n");
}
