import { db } from "../../db/index";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import type { CommitRow, WorkItemData, RepoAnalysisData } from "./types";
import { getIndonesianMonth } from "./templates";

// ── Data Loading Helper ──

export function loadReportData(collectionId: number, workspaceId: number) {
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, collectionId)).get();
  if (!collection) throw new Error("Collection not found");

  const wsId = workspaceId || collection.workspaceId;

  const analyses = db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.collectionId, collectionId))
    .all();

  const allRepos = db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.workspaceId, wsId))
    .all();

  const allCommits = db
    .select()
    .from(schema.commits)
    .where(eq(schema.commits.collectionId, collectionId))
    .orderBy(schema.commits.date)
    .all() as CommitRow[];

  const year = collection.year;
  const month = collection.month;
  const period = `${getIndonesianMonth(month)} ${year}`;
  const generatedDate = new Date().toLocaleDateString("id-ID", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Build per-repo analysis data
  const repoAnalyses: RepoAnalysisData[] = [];

  for (const analysis of analyses) {
    const repo = allRepos.find(r => r.id === analysis.repoId);
    if (!repo) continue;

    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    const totalCommits = repoCommits.length;
    const totalFilesChanged = repoCommits.reduce((s, c) => s + c.filesChanged, 0);
    const totalInsertions = repoCommits.reduce((s, c) => s + c.insertions, 0);
    const totalDeletions = repoCommits.reduce((s, c) => s + c.deletions, 0);

    let workItems: WorkItemData[] = [];
    let summary = "";
    let impact = "";
    let risks = "";
    let nextSuggestions = "";
    let hasAnalysis = false;

    if (analysis.status === "completed") {
      hasAnalysis = true;
      try { workItems = JSON.parse(analysis.workItems || "[]"); } catch {}
      summary = analysis.summary || "";
      impact = analysis.impact || "";
      risks = analysis.risks || "";
      nextSuggestions = analysis.nextSuggestions || "";
    }

    repoAnalyses.push({
      repoName: repo.name,
      repoId: repo.id,
      totalCommits,
      totalFilesChanged,
      totalInsertions,
      totalDeletions,
      summary, impact, risks, nextSuggestions,
      workItems, hasAnalysis,
    });
  }

  repoAnalyses.sort((a, b) => a.repoName.localeCompare(b.repoName));

  // Compute aggregated totals for consumer convenience
  const totalRepos = repoAnalyses.length;
  const totalCommitsAll = repoAnalyses.reduce((s, r) => s + r.totalCommits, 0);
  const totalInsertionsAll = repoAnalyses.reduce((s, r) => s + r.totalInsertions, 0);
  const totalDeletionsAll = repoAnalyses.reduce((s, r) => s + r.totalDeletions, 0);
  const totalFilesChangedAll = repoAnalyses.reduce((s, r) => s + r.totalFilesChanged, 0);

  return {
    collection, wsId, analyses, allRepos, allCommits, year, month,
    period, generatedDate, repoAnalyses,
    totalRepos, totalCommits: totalCommitsAll,
    totalInsertions: totalInsertionsAll,
    totalDeletions: totalDeletionsAll,
    totalFilesChanged: totalFilesChangedAll,
  };
}
