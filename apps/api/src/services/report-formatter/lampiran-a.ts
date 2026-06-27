import type { CommitRow, ReportMode } from "./types";

// ── Lampiran A: Daftar Commit ──

export function generateLampiranA(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  mode: ReportMode,
): string {
  const parts: string[] = [];
  parts.push("### Lampiran A — Daftar Commit");
  parts.push("");
  parts.push("Daftar seluruh commit yang tercatat selama periode pelaporan, dikelompokkan berdasarkan repositori.");
  parts.push("");

  let totalCommitCount = 0;

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    if (repoCommits.length === 0) continue;

    totalCommitCount += repoCommits.length;

    parts.push(`**Repositori:** ${repo.name}`);
    parts.push(`**Total commit:** ${repoCommits.length}`);
    parts.push("");

    parts.push("| Hash | Tanggal | Author | Pesan | Perubahan |");
    parts.push("|------|---------|--------|-------|-----------|");

    for (const c of repoCommits) {
      const shortHash = c.hash.slice(0, 8);
      const date = new Date(c.date).toLocaleDateString("id-ID");
      const author = c.authorName;
      const message = c.message.replace(/\|/g, "\\|").substring(0, 80);
      const changes = `+${c.insertions}/-${c.deletions}`;
      parts.push(`| \`${shortHash}\` | ${date} | ${author} | ${message} | ${changes} |`);
    }

    parts.push("");
  }

  if (totalCommitCount === 0) {
    parts.push("Tidak ada commit yang tercatat pada periode ini.");
    parts.push("");
  }

  return parts.join("\n");
}
