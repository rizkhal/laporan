import type { CommitRow, RepoAnalysisData } from "./types";

export function generateLampiranC(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  repoAnalyses: RepoAnalysisData[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran C — Perubahan Berkas");
  parts.push("");
  parts.push("Daftar seluruh berkas yang mengalami perubahan selama periode pelaporan, dikelompokkan berdasarkan repositori.");
  parts.push("");

  // Build work item → commit hash map for linking
  const workItemFileMap = new Map<string, string[]>();
  for (const repo of repoAnalyses) {
    if (!repo.hasAnalysis) continue;
    for (const item of repo.workItems) {
      const bukti = item.bukti || [];
      for (const b of bukti) {
        const file = b.berkas || "";
        if (file && !workItemFileMap.has(file)) {
          workItemFileMap.set(file, [item.judul]);
        } else if (file) {
          const existing = workItemFileMap.get(file)!;
          if (!existing.includes(item.judul)) existing.push(item.judul);
        }
      }
    }
  }

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    if (repoCommits.length === 0) continue;

    // Aggregate file stats
    const fileStats = new Map<string, { changes: string; count: number }>();
    for (const c of repoCommits) {
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      for (const f of changedFiles) {
        if (!fileStats.has(f)) fileStats.set(f, { changes: "", count: 0 });
        const stat = fileStats.get(f)!;
        stat.count++;
      }
    }

    // Also get diffStat for per-file insertions/deletions
    for (const c of repoCommits) {
      let diffStat: { file: string; insertions: number; deletions: number }[] = [];
      try { diffStat = JSON.parse(c.diffStat || "[]"); } catch {}
      for (const d of diffStat) {
        if (!fileStats.has(d.file)) fileStats.set(d.file, { changes: "", count: 1 });
        // Accumulate the latest diff stat
        fileStats.set(d.file, {
          changes: `+${d.insertions}/-${d.deletions}`,
          count: fileStats.get(d.file)?.count || 1,
        });
      }
    }

    // Sort by count descending
    const sortedFiles = [...fileStats.entries()].sort((a, b) => b[1].count - a[1].count);

    parts.push(`**Repositori:** ${repo.name}`);
    parts.push(`**Total berkas unik:** ${sortedFiles.length}`);
    parts.push("");

    parts.push("| Berkas | Perubahan | Item Pekerjaan Terkait |");
    parts.push("|--------|-----------|----------------------|");

    for (const [file, stats] of sortedFiles) {
      const relatedItems = workItemFileMap.get(file);
      const itemStr = relatedItems ? relatedItems.join(", ") : "-";
      const changesDisplay = stats.changes ? '`' + stats.changes + '`' : '`' + stats.count + 'x' + '`';
      parts.push('| `' + file + '` | ' + changesDisplay + ' | ' + itemStr + ' |');
    }

    parts.push("");
  }

  return parts.join("\n");
}
