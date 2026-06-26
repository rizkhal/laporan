/**
 * Google Docs Export Service
 *
 * Simplified entry point that orchestrates the export pipeline:
 *   Markdown → AST → Chunks → Rate-Limited Worker → Google Docs Document
 *
 * This replaces the old per-segment processing with the new chunked pipeline.
 * The pipeline is designed for production use with proper rate limiting,
 * error handling, and resume support.
 */

import { getAuthenticatedClient, refreshAccessToken } from "./google-auth";
import { runExportWorker, type WorkerResult, type ExportProgress } from "./google-docs-worker";
import { parseDocument, printChunks } from "./google-docs-ast";

// ── Types ──

export interface ExportConfig {
  accessToken: string;
  refreshToken: string;
  documentTitle: string;
  markdownContent: string;
  onProgress?: (progress: { message: string; progress: number }) => void;
}

export interface ExportResult {
  documentId: string;
  documentUrl: string;
}

// ── Worker State ──

interface ExportJobState {
  documentId: string;
  totalChunks: number;
  currentChunk: number;
  chunkLabels: string[];
}

const activeExports = new Map<string, ExportJobState>();

/**
 * Export the report to Google Docs using the new chunked pipeline.
 *
 * This function:
 *   1. Authenticates with Google (refreshes token if needed)
 *   2. Parses the markdown into a structured AST
 *   3. Runs the rate-limited export worker
 *   4. Returns the document ID and URL
 */
export async function exportToGoogleDocs(config: ExportConfig): Promise<ExportResult> {
  const { accessToken, refreshToken, documentTitle, markdownContent, onProgress } = config;

  console.log(`📝 Starting Google Docs export: "${documentTitle}" (${markdownContent.length} chars)`);

  // Step 1: Authenticate and refresh token if needed
  const { oauthClient, freshAccessToken } = await getAuthenticatedClient(accessToken, refreshToken);

  // Step 2: Parse into AST for preview/logging
  const ast = parseDocument(markdownContent, documentTitle);
  console.log(`📄 Document has ${ast.chunks.length} sections:`);
  printChunks(ast);

  // Step 3: Run the export worker
  const exportId = `export-${Date.now()}`;

  const result = await runExportWorker({
    accessToken: freshAccessToken,
    documentId: "", // Will be created by the worker
    markdownContent,
    documentTitle,
    onProgress: (progress: ExportProgress) => {
      // Track state for resume support
      activeExports.set(exportId, {
        documentId: progress.chunkId === "done" ? result?.documentId || "" : "",
        totalChunks: progress.totalChunks,
        currentChunk: progress.currentChunk,
        chunkLabels: [],
      });

      // Forward progress to caller
      onProgress?.({
        message: progress.message,
        progress: progress.progress,
      });
    },
  });

  // Clean up state
  activeExports.delete(exportId);

  if (!result.success) {
    throw new Error(
      result.error || "Google Docs export failed. Check the logs for details.",
    );
  }

  console.log(`✅ Google Docs export complete: ${result.documentUrl}`);

  return {
    documentId: result.documentId,
    documentUrl: result.documentUrl,
  };
}

/**
 * Get the state of an active export.
 * Used by the frontend to show progress.
 */
export function getExportState(exportId: string): ExportJobState | undefined {
  return activeExports.get(exportId);
}

/**
 * Legacy export support: parse markdown into segments for preview use.
 */
export { parseDocument } from "./google-docs-ast";
