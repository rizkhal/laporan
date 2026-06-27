import type { CommitRow } from "./types";

export function generateLampiranGitDiff(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran G — Diff Perubahan Kode");
  parts.push("");
  parts.push("Diff atau perubahan kode untuk setiap commit yang tercatat selama periode pelaporan. Bagian ini menunjukkan secara spesifik baris kode yang ditambahkan (\"+\") dan dihapus (\"-\") pada setiap berkas yang diubah.");
  parts.push("");

  let totalPatches = 0;

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    if (repoCommits.length === 0) continue;

    parts.push(`**Repositori:** ${repo.name}`);
    parts.push("");

    for (const c of repoCommits) {
      let patchSnippets: { file: string; patch: string }[] = [];
      try { patchSnippets = JSON.parse(c.patchSnippets || "[]"); } catch {}
      let diffStat: { file: string; insertions: number; deletions: number }[] = [];
      try { diffStat = JSON.parse(c.diffStat || "[]"); } catch {}

      if (patchSnippets.length === 0 && diffStat.length === 0) continue;

      parts.push(`#### Commit \`${c.hash.slice(0, 8)}\``);
      parts.push("");
      parts.push(`**Pesan:** ${c.message}`);
      parts.push(`**Author:** ${c.authorName} — ${new Date(c.date).toLocaleDateString("id-ID")}`);
      parts.push(`**Perubahan:** \+${c.insertions} / -${c.deletions} baris di ${c.filesChanged} berkas`);
      parts.push("");

      if (diffStat.length > 0) {
        parts.push("| Berkas | + | - |");
        parts.push("|-------|---|----|");
        for (const f of diffStat) {
          const ins = f.insertions > 0 ? `+${f.insertions}` : "-";
          const del = f.deletions > 0 ? `-${f.deletions}` : "-";
          parts.push(`| \`${f.file}\` | ${ins} | ${del} |`);
        }
        parts.push("");
      }

      // Render actual patch content
      if (patchSnippets.length > 0) {
        parts.push("**Diff:**");
        parts.push("");
        parts.push("```diff");
        for (const snippet of patchSnippets) {
          // The patch starts with "diff --git a/file b/file"
          // We trim leading whitespace but preserve the content
          parts.push(snippet.patch);
          totalPatches++;
        }
        parts.push("```");
        parts.push("");
      }

      parts.push("---");
      parts.push("");
    }

    parts.push("---");
    parts.push("");
  }

  if (totalPatches === 0) {
    parts.push("_Tidak ada data diff yang tersedia untuk periode ini._");
    parts.push("");
  }

  return parts.join("\n");
}
