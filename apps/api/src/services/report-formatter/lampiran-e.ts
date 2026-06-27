import type { CommitRow, RepoAnalysisData } from "./types";
import { getCategoryLabel } from "./templates";

export function generateLampiranE(
  repoAnalyses: RepoAnalysisData[],
  allCommits: CommitRow[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran E — Pemetaan Bukti");
  parts.push("");
  parts.push("Pemetaan bukti untuk setiap item pekerjaan. Setiap item dilengkapi dengan referensi commit dan berkas yang mendukung.");
  parts.push("");

  for (const repo of repoAnalyses) {
    if (!repo.hasAnalysis || repo.workItems.length === 0) continue;

    parts.push(`**Repositori:** ${repo.repoName}`);
    parts.push("");

    for (const item of repo.workItems) {
      const bukti = item.bukti || item.evidence || [];

      parts.push(`#### ${item.judul}`);
      parts.push("");

      if (item.deskripsi) {
        parts.push(`**Deskripsi:** ${item.deskripsi}`);
        parts.push("");
      }

      parts.push(`**Kategori:** ${getCategoryLabel(item.kategori || "")}`);
      parts.push(`**Dampak:** ${item.dampak || "N/A"}`);
      parts.push(`**Keyakinan:** ${item.keyakinan || "N/A"}`);
      parts.push("");

      if (bukti.length > 0) {
        parts.push("**Bukti Commit:**");
        for (const b of bukti) {
          const raw = b as any;
          const hash = (raw.hashCommit || raw.commitHash || "").slice(0, 8);
          // Find the full commit to show its message
          const match = allCommits.find(c => c.hash.toLowerCase().startsWith(hash));
          const message = match ? match.message.substring(0, 80) : "(tidak ditemukan)";
          parts.push('`' + hash + '` — ' + message);
        }
        parts.push("");

        parts.push("**Berkas Terkait:**");
        const uniqueFiles = [...new Set(bukti.map(b => { const raw = b as any; return raw.berkas || raw.file || ""; }).filter(Boolean))];
        for (const f of uniqueFiles) {
          parts.push('`' + f + '`');
        }
        parts.push("");
      } else {
        parts.push("Tidak ada bukti spesifik yang tercatat untuk item ini.");
        parts.push("");
      }

      parts.push("---");
      parts.push("");
    }
  }

  return parts.join("\n");
}
