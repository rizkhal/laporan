import type { ReportStrategy, ReportResult } from "./index";
import { loadReportData } from "./index";

// ── Executive Summary Strategy ──
// Management and leadership focused. Business impact, not technical implementation.

export const executiveStrategy: ReportStrategy = {
  id: "executive",
  name: "Executive Summary",
  description:
    "Management and leadership focused. Emphasizes business impact, key metrics, risks, and recommendations. 3–10 pages.",

  async generate(
    collectionId: number,
    workspaceId: number,
  ): Promise<ReportResult> {
    const data = loadReportData(collectionId, workspaceId);
    const lines: string[] = [];

    // Title
    lines.push(`# Executive Summary — ${data.period}`);
    lines.push("");
    lines.push(`*Prepared: ${data.generatedDate}*`);
    lines.push("");

    // ── Executive Summary ──
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(
      `This report summarizes development activity for **${data.period}**. ` +
        `The engineering team completed **${data.totalCommits} commits** across **${data.totalRepos} repositories**, ` +
        `resulting in **${(data.totalInsertions + data.totalDeletions).toLocaleString()} total changes** ` +
        `(+${data.totalInsertions.toLocaleString()} additions, -${data.totalDeletions.toLocaleString()} deletions).`,
    );
    lines.push("");

    const totalWorkItems = data.repoAnalyses.reduce(
      (s, r) => s + r.workItems.length,
      0,
    );
    lines.push(
      `A total of **${totalWorkItems} work items** were identified through automated analysis, ` +
        `spanning feature development, bug fixes, improvements, and infrastructure maintenance.`,
    );
    lines.push("");

    // ── Major Achievements ──
    lines.push("## Major Achievements");
    lines.push("");

    const allItems = data.repoAnalyses.flatMap((r) =>
      r.workItems.map((w) => ({ ...w, repo: r.repoName })),
    );

    if (allItems.length > 0) {
      // Sort by impact: tinggi first
      const sorted = [...allItems].sort((a, b) => {
        const order: Record<string, number> = {
          tinggi: 0,
          sedang: 1,
          rendah: 2,
        };
        return (order[(a.dampak || "").toLowerCase()] ?? 1) -
          (order[(b.dampak || "").toLowerCase()] ?? 1);
      });

      for (const item of sorted.slice(0, 10)) {
        lines.push(`### ${item.judul}`);
        lines.push("");
        if (item.deskripsi) {
          lines.push(item.deskripsi);
          lines.push("");
        }
        lines.push(
          `*Repository:* \`${item.repo}\`` +
            (item.dampak ? ` | *Business Impact:* ${item.dampak}` : ""),
        );
        lines.push("");
      }
    } else {
      lines.push("No specific achievements were identified in this period.");
      lines.push("");
    }

    // ── Key Metrics ──
    lines.push("## Key Metrics");
    lines.push("");

    lines.push("### Development Activity");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Active Repositories | ${data.totalRepos} |`);
    lines.push(`| Total Commits | ${data.totalCommits} |`);
    lines.push(`| Files Modified | ${data.totalFilesChanged} |`);
    lines.push(`| Lines Added | +${data.totalInsertions.toLocaleString()} |`);
    lines.push(`| Lines Removed | -${data.totalDeletions.toLocaleString()} |`);
    lines.push(`| Net Change | ${(data.totalInsertions - data.totalDeletions) >= 0 ? "+" : ""}${(data.totalInsertions - data.totalDeletions).toLocaleString()} |`);
    lines.push(`| Work Items Completed | ${totalWorkItems} |`);
    lines.push("");

    lines.push("### Per Repository");
    lines.push("");
    lines.push("| Repository | Commits | Changes | Work Items |");
    lines.push("|------------|---------|---------|------------|");
    for (const repo of data.repoAnalyses) {
      const changes = repo.totalInsertions + repo.totalDeletions;
      lines.push(
        `| ${repo.repoName} | ${repo.totalCommits} | ${changes.toLocaleString()} | ${repo.workItems.length} |`,
      );
    }
    lines.push("");

    // ── Risks ──
    const hasRisks = data.repoAnalyses.some((r) => r.risks);
    if (hasRisks) {
      lines.push("## Risks & Concerns");
      lines.push("");
      for (const repo of data.repoAnalyses) {
        if (repo.risks) {
          lines.push(`### ${repo.repoName}`);
          lines.push("");
          lines.push(repo.risks);
          lines.push("");
        }
      }
    }

    // ── Recommendations ──
    const hasRecommendations = data.repoAnalyses.some(
      (r) => r.nextSuggestions,
    );
    if (hasRecommendations) {
      lines.push("## Recommendations");
      lines.push("");
      for (const repo of data.repoAnalyses) {
        if (repo.nextSuggestions) {
          lines.push(`### ${repo.repoName}`);
          lines.push("");
          lines.push(repo.nextSuggestions);
          lines.push("");
        }
      }
    }

    // ── Conclusion ──
    lines.push("## Conclusion");
    lines.push("");

    const categories = new Map<string, number>();
    for (const item of allItems) {
      const cat = item.kategori || "other";
      categories.set(cat, (categories.get(cat) || 0) + 1);
    }

    const categorySummary = [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `${count} ${cat}`)
      .join(", ");

    lines.push(
      `During **${data.period}**, development efforts were distributed across ` +
        `${data.totalRepos} repositories with focus areas including ${categorySummary}. ` +
        `Overall, the team demonstrated consistent delivery with **${data.totalCommits} commits** and ` +
        `**${totalWorkItems} identified work items**.`,
    );
    lines.push("");

    const content = lines.join("\n");
    const estimatedPages = Math.max(
      1,
      Math.round(content.split("\n").length / 50),
    );

    return { content, estimatedPages, style: "executive" };
  },
};
