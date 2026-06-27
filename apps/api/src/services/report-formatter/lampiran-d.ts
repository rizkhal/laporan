import type { CommitRow, RepoAnalysisData } from "./types";
import { getDirectory, getWeekNumber, getCategoryLabel } from "./templates";
import { SECTION_MAP } from "./constants";

export function generateLampiranD(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  repoAnalyses: RepoAnalysisData[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran D — Statistik Pengembangan");
  parts.push("");
  parts.push("Statistik pengembangan yang mencakup ringkasan perubahan, berkas yang sering dimodifikasi, dan distribusi pekerjaan.");
  parts.push("");

  // ── Table 1: Per-Repository Summary ──

  parts.push("#### Tabel D.1 — Ringkasan per Repositori");
  parts.push("");

  parts.push("| Repositori | Commit | Berkas Diubah | Penambahan | Pengurangan | Item Pekerjaan |");
  parts.push("|------------|--------|---------------|------------|-------------|----------------|");

  let grandTotalCommits = 0;
  let grandTotalFiles = 0;
  let grandTotalInsertions = 0;
  let grandTotalDeletions = 0;
  let grandTotalItems = 0;

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    const analysis = repoAnalyses.find(r => r.repoName === repo.name);
    const totalCommits = repoCommits.length;
    const totalFiles = repoCommits.reduce((s, c) => s + c.filesChanged, 0);
    const totalIns = repoCommits.reduce((s, c) => s + c.insertions, 0);
    const totalDel = repoCommits.reduce((s, c) => s + c.deletions, 0);
    const totalItems = analysis ? analysis.workItems.length : 0;

    grandTotalCommits += totalCommits;
    grandTotalFiles += totalFiles;
    grandTotalInsertions += totalIns;
    grandTotalDeletions += totalDel;
    grandTotalItems += totalItems;

    if (totalCommits > 0 || totalItems > 0) {
      parts.push(`| ${repo.name} | ${totalCommits} | ${totalFiles} | +${totalIns.toLocaleString()} | -${totalDel.toLocaleString()} | ${totalItems} |`);
    }
  }

  parts.push(`| **Total** | **${grandTotalCommits}** | **${grandTotalFiles}** | **+${grandTotalInsertions.toLocaleString()}** | **-${grandTotalDeletions.toLocaleString()}** | **${grandTotalItems}** |`);
  parts.push("");

  // ── Table 2: Top Modified Files ──

  parts.push("#### Tabel D.2 — Berkas Paling Sering Dimodifikasi");
  parts.push("");

  const fileFrequency = new Map<string, { count: number; repos: Set<string> }>();
  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    for (const c of repoCommits) {
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      for (const f of changedFiles) {
        if (!fileFrequency.has(f)) fileFrequency.set(f, { count: 0, repos: new Set() });
        const stat = fileFrequency.get(f)!;
        stat.count++;
        stat.repos.add(repo.name);
      }
    }
  }

  const topFiles = [...fileFrequency.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30);

  if (topFiles.length > 0) {
    parts.push("| Berkas | Jumlah Commit | Repositori |");
    parts.push("|--------|---------------|------------|");
    for (const [file, stat] of topFiles) {
      const repoList = [...stat.repos].join(", ");
      parts.push(`| \`${file}\` | ${stat.count} | ${repoList} |`);
    }
    parts.push("");
  }

  // ── Table 3: Top Modified Directories ──

  parts.push("#### Tabel D.3 — Direktori Paling Sering Dimodifikasi");
  parts.push("");

  const dirFrequency = new Map<string, { count: number; files: Set<string> }>();
  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    for (const c of repoCommits) {
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      for (const f of changedFiles) {
        const dir = getDirectory(f);
        if (!dirFrequency.has(dir)) dirFrequency.set(dir, { count: 0, files: new Set() });
        const stat = dirFrequency.get(dir)!;
        stat.count++;
        stat.files.add(f);
      }
    }
  }

  const topDirs = [...dirFrequency.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  if (topDirs.length > 0) {
    parts.push("| Direktori | Jumlah Perubahan | Berkas Unik |");
    parts.push("|-----------|-----------------|-------------|");
    for (const [dir, stat] of topDirs) {
      parts.push(`| \`${dir}\` | ${stat.count} | ${stat.files.size} |`);
    }
    parts.push("");
  }

  // ── Table 4: Commits per Week ──

  parts.push("#### Tabel D.4 — Distribusi Commit per Minggu");
  parts.push("");

  const weekMap = new Map<string, { commits: number; insertions: number; deletions: number }>();
  for (const c of allCommits) {
    const weekNum = getWeekNumber(c.date);
    const key = `Minggu ${weekNum}`;
    if (!weekMap.has(key)) weekMap.set(key, { commits: 0, insertions: 0, deletions: 0 });
    const stat = weekMap.get(key)!;
    stat.commits++;
    stat.insertions += c.insertions;
    stat.deletions += c.deletions;
  }

  const sortedWeeks = [...weekMap.entries()].sort((a, b) => {
    const numA = parseInt(a[0].replace("Minggu ", ""));
    const numB = parseInt(b[0].replace("Minggu ", ""));
    return numA - numB;
  });

  if (sortedWeeks.length > 0) {
    parts.push("| Periode | Commit | Penambahan | Pengurangan |");
    parts.push("|---------|--------|------------|-------------|");
    for (const [week, stat] of sortedWeeks) {
      parts.push(`| ${week} | ${stat.commits} | +${stat.insertions} | -${stat.deletions} |`);
    }
    parts.push("");
  }

  // ── Table 5: Work Items per Category ──

  parts.push("#### Tabel D.5 — Distribusi Item Pekerjaan per Kategori");
  parts.push("");

  const categoryCount = new Map<string, number>();
  for (const repo of repoAnalyses) {
    for (const item of repo.workItems) {
      const cat = item.kategori || item.category || "other";
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
    }
  }

  if (categoryCount.size > 0) {
    const sortedCats = [...categoryCount.entries()].sort((a, b) => b[1] - a[1]);
    parts.push("| Kategori | Jumlah Item |");
    parts.push("|----------|-------------|");
    for (const [cat, count] of sortedCats) {
      parts.push(`| ${getCategoryLabel(cat)} | ${count} |`);
    }
    parts.push("");

    // ── Table 6: Work Items per Section ──

    const sectionItemCount = new Map<string, number>();
    for (const repo of repoAnalyses) {
      for (const item of repo.workItems) {
        const kategori = (item.kategori || "other").toLowerCase();
        const sectionName = SECTION_MAP[kategori] || "PENGEMBANGAN SISTEM";
        sectionItemCount.set(sectionName, (sectionItemCount.get(sectionName) || 0) + 1);
      }
    }

    parts.push("#### Tabel D.6 — Distribusi Item Pekerjaan per Bagian Laporan");
    parts.push("");

    const sortedSections = [...sectionItemCount.entries()].sort((a, b) => b[1] - a[1]);
    parts.push("| Bagian Laporan | Jumlah Item |");
    parts.push("|----------------|-------------|");
    for (const [section, count] of sortedSections) {
      parts.push(`| ${section} | ${count} |`);
    }
    parts.push("");
  }

  return parts.join("\n");
}
