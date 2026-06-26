/**
 * Google Docs Export Service
 *
 * Simplified entry point that orchestrates the export pipeline:
 *   Markdown → AST → Chunks → Rate-Limited Worker → Google Docs Document
 *
 * Document creation uses the googleapis library (with proper OAuth2 token refresh),
 * then content insertion uses the chunked pipeline via raw API calls.
 */

import { google } from "googleapis";
import { getAuthenticatedClient } from "./google-auth";
import { runExportWorker, type ExportProgress } from "./google-docs-worker";
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
 *   1. Authenticates with Google (refreshes token via googleapis OAuth2)
 *   2. Creates a new Google Docs document using googleapis library
 *   3. Parses the markdown into a structured AST
 *   4. Runs the rate-limited export worker (populates content via raw fetch)
 *   5. Returns the document ID and URL
 */
export async function exportToGoogleDocs(config: ExportConfig): Promise<ExportResult> {
  const { accessToken, refreshToken, documentTitle, markdownContent, onProgress } = config;

  console.log(`📝 Starting Google Docs export: "${documentTitle}" (${markdownContent.length} chars)`);

  // Step 1: Authenticate and refresh token using googleapis OAuth2 client
  const { oauthClient, freshAccessToken } = await getAuthenticatedClient(accessToken, refreshToken);

  // Step 2: Create document using googleapis library (handles auth properly)
  onProgress?.({ message: "Membuat dokumen...", progress: 5 });

  const docs = google.docs({ version: "v1", auth: oauthClient });
  const createResponse = await docs.documents.create({
    requestBody: { title: documentTitle },
  });

  const documentId = createResponse.data.documentId;
  if (!documentId) {
    throw new Error("Failed to create Google Docs document: no documentId returned");
  }

  console.log(`✅ Document created: ${documentId}`);

  // Step 3: Parse into AST
  onProgress?.({ message: "Menganalisis struktur dokumen...", progress: 10 });
  const ast = parseDocument(markdownContent, documentTitle);
  console.log(`📄 Document has ${ast.chunks.length} sections:`);
  printChunks(ast);

  // Step 4: Run the export worker (uses raw fetch for content operations)
  const exportId = `export-${Date.now()}`;

  const result = await runExportWorker({
    accessToken: freshAccessToken,
    documentId,
    markdownContent,
    documentTitle,
    onProgress: (progress: ExportProgress) => {
      // Track state for resume support
      activeExports.set(exportId, {
        documentId,
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
