import type { ReportStrategy, ReportResult } from "./index";
import { loadReportData } from "./index";

// ── AI Article Strategy ──
// Readable blog/article style narrative. Current behavior preserved.
// Adds prose-like narrative wrapping around the same data.

export const articleStrategy: ReportStrategy = {
  id: "article",
  name: "AI Article",
  description:
    "Readable blog-style narrative report. Long paragraphs suitable for internal publishing. Current default behavior.",

  async generate(
    collectionId: number,
    workspaceId: number,
  ): Promise<ReportResult> {
    const data = loadReportData(collectionId, workspaceId);
    const lines: string[] = [];

    // Title
    lines.push(`# Monthly Development Report — ${data.period}`);
    lines.push("");
    lines.push(`*Published: ${data.generatedDate}*`);
    lines.push("");

    // ── Overview ──
    lines.push("## Overview");
    lines.push("");

    const repoList = data.repoAnalyses.map((r) => `**${r.repoName}**`).join(", ");
    lines.push(
      `This month, development activity spanned across ${data.totalRepos} repositories: ${repoList}. ` +
        `In total, the team made **${data.totalCommits} commits**, modifying **${data.totalFilesChanged} files** ` +
        `with **+${data.totalInsertions.toLocaleString()}** lines added and ` +
        `**-${data.totalDeletions.toLocaleString()}** lines removed. ` +
        `The net change of **${(data.totalInsertions + data.totalDeletions).toLocaleString()} lines** ` +
        ` reflects the development velocity during this period.`,
    );
    lines.push("");

    // ── Per-Repository Narrative ──
    lines.push("## Development by Repository");
    lines.push("");

    for (const repo of data.repoAnalyses) {
      lines.push(`### ${repo.repoName}`);
      lines.push("");

      if (repo.summary) {
        lines.push(repo.summary);
        lines.push("");
      }

      lines.push(
        `This repository saw **${repo.totalCommits} commits**, changing **${repo.totalFilesChanged} files** ` +
          `with **+${repo.totalInsertions.toLocaleString()}** additions and ` +
          `**-${repo.totalDeletions.toLocaleString()}** deletions.`,
      );
      lines.push("");

      if (repo.workItems.length > 0) {
        lines.push("**Work items identified:**");
        for (const item of repo.workItems) {
          lines.push("");
          lines.push(`#### ${item.judul}`);
          lines.push("");
          if (item.deskripsi) {
            lines.push(item.deskripsi);
            lines.push("");
          }

          const bukti = item.bukti || [];
          if (bukti.length > 0) {
            const hashes = bukti
              .map((b: any) => `\`${(b.hashCommit || "").slice(0, 8)}\``)
              .join(", ");
            lines.push(`*Supporting commits: ${hashes}*`);
            lines.push("");
          }
        }
      }

      if (repo.impact) {
        lines.push("**Impact:** " + repo.impact);
        lines.push("");
      }

      if (repo.risks) {
        lines.push("**Risks:** " + repo.risks);
        lines.push("");
      }

      if (repo.nextSuggestions) {
        lines.push("**Next steps:** " + repo.nextSuggestions);
        lines.push("");
      }
    }

    // ── Statistics Snapshot ──
    lines.push("## Statistics");
    lines.push("");

    lines.push("| Repository | Commits | Files | Additions | Deletions |");
    lines.push("|------------|---------|-------|-----------|-----------|");
    for (const repo of data.repoAnalyses) {
      lines.push(
        `| ${repo.repoName} | ${repo.totalCommits} | ${repo.totalFilesChanged} | ` +
          `+${repo.totalInsertions.toLocaleString()} | -${repo.totalDeletions.toLocaleString()} |`,
      );
    }
    lines.push(
      `| **Total** | **${data.totalCommits}** | **${data.totalFilesChanged}** | ` +
        `**+${data.totalInsertions.toLocaleString()}** | **-${data.totalDeletions.toLocaleString()}** |`,
    );
    lines.push("");

    // ── Conclusion ──
    lines.push("## Closing Thoughts");
    lines.push("");

    const totalItems = data.repoAnalyses.reduce((s, r) => s + r.workItems.length, 0);
    lines.push(
      `Looking back at **${data.period}**, the development team focused on ` +
        `**${totalItems} work items** distributed across **${data.totalRepos} repositories**. ` +
        `The work ranged from feature development to maintenance and improvements.`,
    );
    lines.push("");

    lines.push(
      `The data shows consistent development activity with **${data.totalCommits} commits** over the month. ` +
        `Each repository contributed to the overall progress, with key changes tracked ` +
        `and analyzed for impact assessment.`,
    );
    lines.push("");

    lines.push(
      `*This report was automatically generated based on Git commit data and AI analysis.*`,
    );
    lines.push("");

    const content = lines.join("\n");
    const estimatedPages = Math.max(
      1,
      Math.round(content.split("\n").length / 45),
    );

    return { content, estimatedPages, style: "article" };
  },
};
