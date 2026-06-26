/**
 * Google Docs Export Service
 *
 * Entry point that orchestrates the export pipeline:
 *   Markdown → AST → Chunks → Rate-Limited Worker → Google Docs Document
 *
 * All API calls use the googleapis library which handles OAuth2 token refresh
 * transparently (no raw fetch() for authenticated requests).
 */

import { google } from "googleapis";
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

// ── OAuth2 Client Builder ──

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
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
 * Export the report to Google Docs using the chunked pipeline.
 *
 * Flow:
 *   1. Build OAuth2 client + refresh token
 *   2. Create googleapis docs client (handles auth transparently)
 *   3. Create a new Google Docs document
 *   4. Parse markdown into structured AST chunks
 *   5. Run rate-limited worker to populate content
 *   6. Return document URL
 */
export async function exportToGoogleDocs(config: ExportConfig): Promise<ExportResult> {
  const { accessToken, refreshToken, documentTitle, markdownContent, onProgress } = config;

  console.log(`📝 Starting Google Docs export: "${documentTitle}" (${markdownContent.length} chars)`);

  // Step 1: Build authenticated OAuth2 client (googleapis handles refresh)
  onProgress?.({ message: "Mengautentikasi...", progress: 2 });

  const oauthClient = createOAuth2Client();
  oauthClient.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Create docs client using the authenticated OAuth2 client
  const docs = google.docs({ version: "v1", auth: oauthClient });

  // Step 2: Create document using googleapis library
  onProgress?.({ message: "Membuat dokumen...", progress: 5 });

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

  // Step 4: Run the export worker (uses the same docs client with OAuth2 refresh)
  const exportId = `export-${Date.now()}`;

  const result = await runExportWorker({
    docsClient: docs,
    documentId,
    markdownContent,
    documentTitle,
    onProgress: (progress: ExportProgress) => {
      activeExports.set(exportId, {
        documentId,
        totalChunks: progress.totalChunks,
        currentChunk: progress.currentChunk,
        chunkLabels: [],
      });
      onProgress?.({
        message: progress.message,
        progress: progress.progress,
      });
    },
  });

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

export function getExportState(exportId: string): ExportJobState | undefined {
  return activeExports.get(exportId);
}

export { parseDocument } from "./google-docs-ast";
