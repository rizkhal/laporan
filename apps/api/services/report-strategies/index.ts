import { db } from "../../db/index";
import * as schema from "../../db/schema";
import { eq, and } from "drizzle-orm";

// ── Strategy Result ──

export interface ReportResult {
  content: string;
  estimatedPages: number;
  style: string;
}

// ── Strategy Interface ──

export interface ReportStrategy {
  /** Unique identifier for this strategy */
  id: string;

  /** Human-readable name */
  name: string;

  /** Short description shown to the user when selecting */
  description: string;

  /** Generate the report content */
  generate(
    collectionId: number,
    workspaceId: number,
  ): Promise<ReportResult>;
}

// ── Shared Data Loader ──

export interface ReportData {
  period: string;
  generatedDate: string;
  totalRepos: number;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  repoAnalyses: RepoAnalysisData[];
  allCommits: any[];
  allRepos: { id: number; name: string }[];
}

interface WorkItemData {
  judul: string;
  deskripsi: string;
  kategori: string;
  dampak: string;
  bukti: { hashCommit: string; berkas: string }[];
  keyakinan: string;
  [key: string]: any;
}

interface RepoAnalysisData {
  repoName: string;
  repoId: number;
  totalCommits: number;
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
  summary: string;
  impact: string;
  risks: string;
  nextSuggestions: string;
  workItems: WorkItemData[];
  hasAnalysis: boolean;
}

export function loadReportData(
  collectionId: number,
  workspaceId: number,
): ReportData {
  const collection = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
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
    .all();

  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const period = `${months[collection.month - 1] || "Unknown"} ${collection.year}`;
  const generatedDate = new Date().toLocaleDateString("id-ID", {
    year: "numeric", month: "long", day: "numeric",
  });

  const repoAnalyses: RepoAnalysisData[] = [];

  for (const analysis of analyses) {
    const repo = allRepos.find((r) => r.id === analysis.repoId);
    if (!repo) continue;

    const repoCommits = allCommits.filter((c: any) => c.repoId === repo.id);
    const totalCommits = repoCommits.length;
    const totalFilesChanged = repoCommits.reduce((s: number, c: any) => s + c.filesChanged, 0);
    const totalInsertions = repoCommits.reduce((s: number, c: any) => s + c.insertions, 0);
    const totalDeletions = repoCommits.reduce((s: number, c: any) => s + c.deletions, 0);

    let workItems: WorkItemData[] = [];
    let summary = "";
    let impact = "";
    let risks = "";
    let nextSuggestions = "";
    let hasAnalysis = false;

    if (analysis.status === "completed") {
      hasAnalysis = true;
      try {
        workItems = JSON.parse(analysis.workItems || "[]");
      } catch {}
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
      summary,
      impact,
      risks,
      nextSuggestions,
      workItems,
      hasAnalysis,
    });
  }

  repoAnalyses.sort((a, b) => a.repoName.localeCompare(b.repoName));

  return {
    period,
    generatedDate,
    totalRepos: repoAnalyses.length,
    totalCommits: allCommits.length,
    totalInsertions: repoAnalyses.reduce((s, r) => s + r.totalInsertions, 0),
    totalDeletions: repoAnalyses.reduce((s, r) => s + r.totalDeletions, 0),
    totalFilesChanged: repoAnalyses.reduce((s, r) => s + r.totalFilesChanged, 0),
    repoAnalyses,
    allCommits,
    allRepos: allRepos.map((r) => ({ id: r.id, name: r.name })),
  };
}

// ── Registry ──

const strategies = new Map<string, ReportStrategy>();

export function registerStrategy(strategy: ReportStrategy): void {
  strategies.set(strategy.id, strategy);
}

export function getStrategy(id: string): ReportStrategy | undefined {
  return strategies.get(id);
}

export function getAllStrategies(): ReportStrategy[] {
  return Array.from(strategies.values());
}

// ── Upsert Report Helper ──

// ── Generate Report via Strategy ──

export async function generateReportViaStrategy(
  collectionId: number,
  workspaceId: number,
  style: string = "office",
): Promise<ReportResult> {
  const strategy = getStrategy(style);
  if (!strategy) {
    throw new Error(`Unknown report style: "${style}". Available styles: ${getAllStrategies().map(s => s.id).join(", ")}`);
  }

  const result = await strategy.generate(collectionId, workspaceId);

  // Persist the report
  const collection = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();

  const existing = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.collectionId, collectionId))
    .get();

  if (existing) {
    db.update(schema.reports)
      .set({
        content: result.content,
        style,
        title: collection?.title || "Report",
        isEdited: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.reports.id, existing.id))
      .run();
  } else {
    db.insert(schema.reports)
      .values({
        collectionId,
        title: collection?.title || "Report",
        style,
        content: result.content,
      })
      .run();
  }

  return result;
}

// ── Register built-in strategies ──

import { simpleStrategy } from "./simple";
import { executiveStrategy } from "./executive";
import { officeStrategy } from "./office";

registerStrategy(simpleStrategy);
registerStrategy(executiveStrategy);
registerStrategy(officeStrategy);
