import type { RepoAnalysisData } from "../report-formatter/types";
import { loadReportData } from "../report-formatter/data-loader";

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

// ── Re-export for strategy consumers ──
export { loadReportData };
export type { RepoAnalysisData };

// ── Aggregated report data shape ──

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

// ── Register built-in strategies ──

import { simpleStrategy } from "./simple";
import { executiveStrategy } from "./executive";
import { officeStrategy } from "./office";

registerStrategy(simpleStrategy);
registerStrategy(executiveStrategy);
registerStrategy(officeStrategy);
