import type { ReportStrategy, ReportResult, ReportData } from "./index";
import { loadReportData } from "./index";

// ── Simple Report Strategy ──
// Quick internal monthly recap with minimal formatting.

export const simpleStrategy: ReportStrategy = {
  id: "simple",
  name: "Simple Report",
  description:
    "Quick internal monthly recap with executive summary, work items, statistics, and conclusion. Minimal formatting, 5–15 pages.",

  async generate(
    collectionId: number,
    workspaceId: number,
  ): Promise<ReportResult> {
    const data = loadReportData(collectionId, workspaceId);
    const lines: string[] = [];

    // Title
    lines.push(`# Monthly Development Report — ${data.period}`);
    lines.push("");
    lines.push(`*Generated: ${data.generatedDate}*`);
    lines.push("");

    // ── Executive Summary ──
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(
      `During **${data.period}**, the team made **${data.totalCommits} commits** across **${data.totalRepos} repositories**, ` +
        `changing **${data.totalFilesChanged} files** with **+${data.totalInsertions.toLocaleString()}** additions and ` +
        `**-${data.totalDeletions.toLocaleString()}** deletions (total **${(data.totalInsertions + data.totalDeletions).toLocaleString()} changes` +
        `).`,
    );
    lines.push("");

    if (data.repoAnalyses.length > 0) {
      lines.push("**Repositories tracked:**");
      for (const repo of data.repoAnalyses) {
        lines.push(
          `- **${repo.repoName}** — ${repo.totalCommits} commits, ` +
            `+${repo.totalInsertions}/-${repo.totalDeletions} changes` +
            (repo.summary ? ` — ${repo.summary}` : ""),
        );
      }
      lines.push("");
    }

    // ── Work Items ──
    const allWorkItems = data.repoAnalyses.flatMap((r) =>
      r.workItems.map((w) => ({ ...w, repo: r.repoName })),
    );

    if (allWorkItems.length > 0) {
      lines.push("## Work Items");
      lines.push("");

      for (const item of allWorkItems) {
        lines.push(`### ${item.judul}`);
        lines.push("");
        if (item.deskripsi) {
          lines.push(item.deskripsi);
          lines.push("");
        }
        lines.push(
          `*Repository:* \`${item.repo}\` | *Category:* ${item.kategori || "N/A"}` +
            (item.dampak ? ` | *Impact:* ${item.dampak}` : ""),
        );
        lines.push("");

        const bukti = item.bukti || [];
        if (bukti.length > 0) {
          lines.push("**Evidence:**");
          for (const b of bukti) {
            const hash = (b.hashCommit || "").slice(0, 8);
            const file = b.berkas || "";
            lines.push(`- \`${hash}\` — \`${file}\``);
          }
          lines.push("");
        }
      }
    }

    // ── Statistics ──
    lines.push("## Statistics");
    lines.push("");

    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Total Repositories | ${data.totalRepos} |`);
    lines.push(`| Total Commits | ${data.totalCommits} |`);
    lines.push(`| Files Changed | ${data.totalFilesChanged} |`);
    lines.push(`| Insertions | +${data.totalInsertions.toLocaleString()} |`);
    lines.push(`| Deletions | -${data.totalDeletions.toLocaleString()} |`);
    lines.push(`| Total Changes | ${(data.totalInsertions + data.totalDeletions).toLocaleString()} |`);
    lines.push(`| Work Items Identified | ${allWorkItems.length} |`);
    lines.push("");

    for (const repo of data.repoAnalyses) {
      lines.push(`**${repo.repoName}**`);
      lines.push("");
      lines.push("| Metric | Value |");
      lines.push("|--------|-------|");
      lines.push(`| Commits | ${repo.totalCommits} |`);
      lines.push(`| Files Changed | ${repo.totalFilesChanged} |`);
      lines.push(`| Insertions | +${repo.totalInsertions.toLocaleString()} |`);
      lines.push(`| Deletions | -${repo.totalDeletions.toLocaleString()} |`);
      lines.push(`| Work Items | ${repo.workItems.length} |`);
      lines.push("");
    }

    // ── Commit Log ──
    lines.push("## Commit Log");
    lines.push("");
    for (const repo of data.repoAnalyses) {
      const repoCommits = data.allCommits.filter((c: any) => c.repoId === repo.repoId);
      if (repoCommits.length === 0) continue;

      lines.push(`### ${repo.repoName}`);
      lines.push("");
      for (const c of repoCommits) {
        lines.push(
          `- \`${(c as any).hash.slice(0, 8)}\` — ${(c as any).message} ` +
            `(*${(c as any).authorName}*, ${(c as any).filesChanged} files, +${(c as any).insertions}/-${(c as any).deletions})`,
        );
      }
      lines.push("");
    }

    // ── Conclusion ──
    lines.push("## Conclusion");
    lines.push("");
    lines.push(
      `In **${data.period}**, development activity focused on **${allWorkItems.length} work items** across **${data.totalRepos} repositories**. ` +
        `The team completed **${data.totalCommits} commits** with a net change of ` +
        `**+${data.totalInsertions.toLocaleString()}/-${data.totalDeletions.toLocaleString()}** lines of code.`,
    );
    lines.push("");

    if (data.repoAnalyses.some((r) => r.risks)) {
      lines.push("**Key Risks:**");
      for (const repo of data.repoAnalyses) {
        if (repo.risks) {
          lines.push(`- *${repo.repoName}:* ${repo.risks}`);
        }
      }
      lines.push("");
    }

    if (data.repoAnalyses.some((r) => r.nextSuggestions)) {
      lines.push("**Next Steps:**");
      for (const repo of data.repoAnalyses) {
        if (repo.nextSuggestions) {
          lines.push(`- *${repo.repoName}:* ${repo.nextSuggestions}`);
        }
      }
      lines.push("");
    }

    const content = lines.join("\n");
    const estimatedPages = Math.max(1, Math.round(content.split("\n").length / 45));

    return { content, estimatedPages, style: "simple" };
  },
};
