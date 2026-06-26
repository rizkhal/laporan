/**
 * Google Docs Export Worker
 *
 * Rate-limited orchestrator for Google Docs export jobs.
 * All API calls go through the googleapis library (handles OAuth2 refresh).
 * Processes one chunk at a time with strict rate limiting.
 */

import { type DocumentAST, parseDocument, printChunks } from "./google-docs-ast";
import { executeChunk } from "./google-docs-executor";

// ── Types ──

export interface ExportProgress {
  chunkId: string;
  chunkLabel: string;
  currentChunk: number;
  totalChunks: number;
  progress: number;
  message: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

export interface WorkerOptions {
  /** googleapis docs client with authenticated OAuth2 client */
  docsClient: any;
  documentId: string;
  markdownContent: string;
  documentTitle: string;
  onProgress?: ProgressCallback;
  resumeFromChunk?: number;
}

export interface WorkerResult {
  success: boolean;
  documentId: string;
  documentUrl: string;
  completedChunks: number;
  totalChunks: number;
  error?: string;
}

// ── Constants ──

const RATE_LIMIT_DELAY_MS = 800;

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply heading styles and insert native TOC.
 * Uses the googleapis docs client for all API calls.
 */
async function applyHeadingStyles(
  docsClient: any,
  documentId: string,
  ast: DocumentAST,
  tocPosition?: number,
): Promise<void> {
  // Read document to find heading paragraphs
  const docRes = await docsClient.documents.get({ documentId });
  const doc: any = docRes.data;

  // Collect heading targets from AST
  const headingTargets: { text: string; gdocsLevel: string }[] = [];

  for (const chunk of ast.chunks) {
    for (const seg of chunk.segments) {
      if (seg.type === "heading" && seg.level >= 1 && seg.level <= 4) {
        const gdocsLevel = getGdocsLevel(seg.level);
        headingTargets.push({ text: seg.content, gdocsLevel });
      }
    }
  }

  // Scan document paragraphs and match heading text
  const styleRequests: any[] = [];

  function walkElements(elements: any[]): void {
    for (const el of elements) {
      if (el.paragraph) {
        const paraText = extractParagraphText(el.paragraph);
        if (paraText) {
          for (const target of headingTargets) {
            const cleanTarget = target.text.replace(/\*\*/g, "").trim();
            if (paraText.trim() === cleanTarget) {
              const si = el.startIndex;
              const ei = el.endIndex;
              if (si && ei) {
                styleRequests.push({
                  updateParagraphStyle: {
                    range: { startIndex: si, endIndex: ei },
                    paragraphStyle: {
                      namedStyleType: target.gdocsLevel,
                      spaceAbove: { magnitude: 12, unit: "PT" },
                      spaceBelow: { magnitude: 6, unit: "PT" },
                    },
                    fields: "namedStyleType,spaceAbove,spaceBelow",
                  },
                });

                styleRequests.push({
                  updateTextStyle: {
                    range: { startIndex: si, endIndex: ei },
                    textStyle: { bold: true },
                    fields: "bold",
                  },
                });
              }
            }
          }
        }
      }

      if (el.table) {
        for (const row of el.table.tableRows) {
          for (const cell of row.tableCells) {
            if (cell.content) walkElements(cell.content);
          }
        }
      }
    }
  }

  walkElements(doc.body?.content || []);

  // Apply heading styles in batches of 50
  if (styleRequests.length > 0) {
    for (let i = 0; i < styleRequests.length; i += 50) {
      const batch = styleRequests.slice(i, i + 50);
      try {
        await docsClient.documents.batchUpdate({
          documentId,
          requestBody: { requests: batch },
        });
      } catch (err: any) {
        console.warn(`⚠️ Batch style update error (batch ${i}):`, err.message);
      }
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // Insert native TOC at tracked position
  if (tocPosition && tocPosition > 0) {
    // Find and remove placeholder [DAFTAR ISI]
    let freshDoc: any;
    try {
      const readRes = await docsClient.documents.get({ documentId });
      freshDoc = readRes.data;
    } catch {
      return; // Can't read document, skip TOC
    }

    let placeholderStart = -1;

    function findPlaceholder(elements: any[]): void {
      for (const el of elements) {
        if (el.paragraph) {
          const text = extractParagraphText(el.paragraph);
          if (text?.includes("[DAFTAR ISI]")) {
            placeholderStart = el.startIndex;
            return;
          }
        }
        if (el.table) {
          for (const row of el.table.tableRows) {
            for (const cell of row.tableCells) {
              if (cell.content) findPlaceholder(cell.content);
            }
          }
        }
      }
    }

    findPlaceholder(freshDoc.body?.content || []);

    const tocRequests: any[] = [];

    if (placeholderStart > 0) {
      tocRequests.push({
        insertTableOfContents: {
          location: { index: placeholderStart },
        },
      });
    } else if (tocPosition > 0) {
      tocRequests.push({
        insertTableOfContents: {
          location: { index: tocPosition },
        },
      });
    }

    if (tocRequests.length > 0) {
      try {
        await docsClient.documents.batchUpdate({
          documentId,
          requestBody: { requests: tocRequests },
        });
      } catch (tocErr: any) {
        console.warn("⚠️ Native TOC insertion failed:", tocErr.message);
      }
    }
  }
}

function extractParagraphText(para: any): string | null {
  if (!para?.elements) return null;
  let text = "";
  for (const el of para.elements) {
    if (el.textRun?.content) text += el.textRun.content;
  }
  return text.trim() || null;
}

function getGdocsLevel(mdLevel: number): string {
  if (mdLevel <= 2) return "HEADING_1"; // # and ## → HEADING_1 for TOC
  if (mdLevel === 3) return "HEADING_2";
  if (mdLevel === 4) return "HEADING_3";
  return "HEADING_1";
}

// ── Main Export Worker ──

export async function runExportWorker(options: WorkerOptions): Promise<WorkerResult> {
  const { docsClient, markdownContent, documentTitle, onProgress, resumeFromChunk } = options;
  const { documentId } = options;

  // Step 1: Parse markdown into AST
  const ast = parseDocument(markdownContent, documentTitle);
  const totalChunks = ast.chunks.length;

  console.log(`📄 Export Worker starting: "${documentTitle}" (${totalChunks} chunks)`);
  printChunks(ast);

  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // Step 2: Process chunks
  const startChunk = resumeFromChunk || 0;
  let completedChunks = startChunk;
  const failedChunks: string[] = [];
  let currentTocPosition: number | undefined;

  for (let i = startChunk; i < totalChunks; i++) {
    const chunk = ast.chunks[i];
    const chunkNum = i + 1;

    onProgress?.({
      chunkId: chunk.id,
      chunkLabel: chunk.label,
      currentChunk: chunkNum,
      totalChunks,
      progress: Math.round((i / totalChunks) * 100),
      message: `Menulis ${chunk.label}...`,
    });

    console.log(`  🏗️  Chunk ${chunkNum}/${totalChunks}: ${chunk.label}`);

    const result = await executeChunk({
      docsClient,
      documentId,
      chunk,
      isFirstChunk: i === 0,
      isLastChunk: i === totalChunks - 1,
      tocPosition: currentTocPosition,
    });

    if (result.tocPosition) currentTocPosition = result.tocPosition;

    if (!result.success) {
      failedChunks.push(chunk.id);
      console.error(`  ❌ Chunk ${chunkNum} failed: ${result.error}`);
    } else {
      completedChunks = i + 1;
      console.log(`  ✅ Chunk ${chunkNum} completed`);
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Step 3: Apply heading styles and insert TOC
  onProgress?.({
    chunkId: "styles",
    chunkLabel: "Formatting",
    currentChunk: totalChunks,
    totalChunks,
    progress: 95,
    message: "Menerapkan format heading...",
  });

  try {
    await applyHeadingStyles(docsClient, documentId, ast, currentTocPosition);
  } catch (styleErr: any) {
    console.warn("⚠️ Heading style application error:", styleErr.message);
  }

  onProgress?.({
    chunkId: "done",
    chunkLabel: "Selesai",
    currentChunk: totalChunks,
    totalChunks,
    progress: 100,
    message: "Dokumen selesai dibuat.",
  });

  const overallSuccess = completedChunks === totalChunks;

  return {
    success: overallSuccess,
    documentId,
    documentUrl,
    completedChunks,
    totalChunks,
    error: failedChunks.length > 0
      ? `${failedChunks.length} chunk(s) failed: ${failedChunks.join(", ")}`
      : undefined,
  };
}
