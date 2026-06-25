import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

interface RepoAnalysis {
  repoName: string;
  repoCategory: string;
  totalCommits: number;
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
  analysis: {
    summary: string;
    impact: string;
    risks: string;
    nextSuggestions: string;
    workItems: any[];
  } | null;
}

function getDefaultTemplate(): string {
  return `# Laporan Bulanan Developer

**Periode:** {{period}}
**Dibuat:** {{generatedDate}}

---

## Ringkasan Eksekutif

{{executiveSummary}}

---

## Rincian Repositori

{{repoBreakdown}}

---

## Ringkasan Item Pekerjaan

{{workItemsSummary}}

---

## Risiko & Mitigasi

{{risks}}

---

## Rekomendasi Selanjutnya

{{nextSteps}}

---

*Laporan dibuat secara otomatis.*
`;
}

export function getTemplate(collectionId: number): string {
  const template = db.select().from(schema.reportTemplates).where(eq(schema.reportTemplates.isDefault, true)).get();
  return template?.content || getDefaultTemplate();
}

export async function generateReport(collectionId: number): Promise<string> {
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, collectionId)).get();
  if (!collection) throw new Error("Collection not found");

  const analyses = db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.collectionId, collectionId))
    .all();

  const allRepos = db.select().from(schema.repositories).all();
  const period = `${new Date(collection.year, collection.month - 1).toLocaleString("id-ID", { month: "long" })} ${collection.year}`;

  // Collect per-repo analyses
  const repoAnalyses: RepoAnalysis[] = [];

  for (const analysis of analyses) {
    const repo = allRepos.find(r => r.id === analysis.repoId);
    if (!repo) continue;

    const commits = db
      .select()
      .from(schema.commits)
      .where(
        and(eq(schema.commits.collectionId, collectionId), eq(schema.commits.repoId, repo.id))
      )
      .all();

    const totalCommits = commits.length;
    const totalFilesChanged = commits.reduce((s, c) => s + c.filesChanged, 0);
    const totalInsertions = commits.reduce((s, c) => s + c.insertions, 0);
    const totalDeletions = commits.reduce((s, c) => s + c.deletions, 0);

    repoAnalyses.push({
      repoName: repo.name,
      repoCategory: repo.category,
      totalCommits,
      totalFilesChanged,
      totalInsertions,
      totalDeletions,
      analysis: analysis.status === "completed" ? {
        summary: analysis.summary || "",
        impact: analysis.impact || "",
        risks: analysis.risks || "",
        nextSuggestions: analysis.nextSuggestions || "",
        workItems: JSON.parse(analysis.workItems || "[]"),
      } : null,
    });
  }

  // Build executive summary
  const totalCommits = repoAnalyses.reduce((s, r) => s + r.totalCommits, 0);
  const totalInsertions = repoAnalyses.reduce((s, r) => s + r.totalInsertions, 0);
  const totalDeletions = repoAnalyses.reduce((s, r) => s + r.totalDeletions, 0);
  const totalChanges = repoAnalyses.reduce((s, r) => s + r.totalInsertions + r.totalDeletions, 0);
  const totalFiles = repoAnalyses.reduce((s, r) => s + r.totalFilesChanged, 0);

  const execSummary = [
    `Selama **${period}**, tim melakukan **${totalCommits} commit** di **${repoAnalyses.length} repositori**, mengubah **${totalFiles} berkas** dengan **${totalInsertions.toLocaleString()} baris ditambahkan** dan **${totalDeletions.toLocaleString()} baris dihapus** (total **${totalChanges.toLocaleString()} perubahan**).`,
    ...repoAnalyses.map(r => r.analysis?.summary || `Belum ada analisis tersedia untuk ${r.repoName}.`),
  ].join("\n\n");

  // Build repo breakdown
  const repoBreakdown = repoAnalyses.map(r => {
    const items = r.analysis?.workItems || [];
    const itemsText = items.map((wi: any) => {
      const judul = wi.judul || wi.title;
      const kategori = wi.kategori || wi.category;
      const dampak = wi.dampak || wi.impact;
      const keyakinan = wi.keyakinan || wi.confidence;
      return `- **${judul}** (${kategori}, dampak ${dampak}, keyakinan ${keyakinan})`;
    }).join("\n");

    const lines = [
      `### ${r.repoName}`,
      "",
      `- **Kategori:** ${r.repoCategory}`,
      `- **Commit:** ${r.totalCommits}`,
      `- **Berkas Diubah:** ${r.totalFilesChanged}`,
      `- **Perubahan:** +${r.totalInsertions}/-${r.totalDeletions}`,
      "",
      r.analysis ? `**Ringkasan:** ${r.analysis.summary}` : "*Analisis belum tersedia atau gagal.*",
    ];

    if (itemsText) {
      lines.push("", "**Item Pekerjaan:**", itemsText);
    }

    if (r.analysis?.impact) {
      lines.push("", `**Dampak:** ${r.analysis.impact}`);
    }

    return lines.join("\n");
  }).join("\n\n---\n\n");

  // Build work items summary
  const allItems = repoAnalyses.flatMap(r =>
    (r.analysis?.workItems || []).map((wi: any) => ({ ...wi, repo: r.repoName }))
  );

  const workItemsSummary = allItems.length > 0
    ? allItems.map((wi: any) => {
        const judul = wi.judul || wi.title;
        const kategori = wi.kategori || wi.category;
        const dampak = wi.dampak || wi.impact;
        return `- **[${wi.repo}]** ${judul} (_${kategori}_, dampak ${dampak})`;
      }).join("\n")
    : "Tidak ada item pekerjaan yang teridentifikasi.";

  // Build risks
  const risks = repoAnalyses
    .filter(r => r.analysis?.risks)
    .map(r => `**${r.repoName}:** ${r.analysis!.risks}`)
    .join("\n\n") || "Tidak ada risiko yang teridentifikasi.";

  // Build next steps
  const nextSteps = repoAnalyses
    .filter(r => r.analysis?.nextSuggestions)
    .map(r => `**${r.repoName}:** ${r.analysis!.nextSuggestions}`)
    .join("\n\n") || "Tidak ada rekomendasi khusus untuk langkah selanjutnya.";

  const template = getTemplate(collectionId);
  const report = template
    .replace(/\{\{period\}\}/g, period)
    .replace(/\{\{generatedDate\}\}/g, new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" }))
    .replace(/\{\{executiveSummary\}\}/g, execSummary)
    .replace(/\{\{repoBreakdown\}\}/g, repoBreakdown)
    .replace(/\{\{workItemsSummary\}\}/g, workItemsSummary)
    .replace(/\{\{risks\}\}/g, risks)
    .replace(/\{\{nextSteps\}\}/g, nextSteps);

  return report;
}
