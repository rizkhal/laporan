/**
 * Google Docs Export Worker
 *
 * Rate-limited orchestrator for Google Docs export jobs.
 * Processes one chunk at a time with strict rate limiting.
 * Supports resume from last successful chunk.
 */

import { type DocumentAST, type DocumentChunk, parseDocument, printChunks } from "./google-docs-ast";
import { executeChunk, type ChunkResult } from "./google-docs-executor";

// ── Types ──

export interface ExportJobState {
  documentId: string;
  documentTitle: string;
  title: string;
  totalChunks: number;
  currentChunk: number;
  chunkLabels: string[];
  completedChunks: string[];
  failedChunks: string[];
  tocPosition?: number;
}

export interface ExportProgress {
  chunkId: string;
  chunkLabel: string;
  currentChunk: number;
  totalChunks: number;
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

export interface WorkerOptions {
  accessToken: string;
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

const RATE_LIMIT_DELAY_MS = 800; // ms between API calls
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply heading styles after all content is inserted.
 *
 * Reads the document, finds paragraphs matching our headings,
 * and applies native Google Docs heading styles.
 * Also inserts the native TOC at the tracked position.
 */
async function applyHeadingStyles(
  accessToken: string,
  documentId: string,
  ast: DocumentAST,
  tocPosition?: number,
): Promise<void> {
  // Read document to find heading paragraphs
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const doc: any = await res.json();
  if (!res.ok) throw new Error(doc?.error?.message || "Failed to read document");

  // Collect all heading text we inserted, with their expected Google Docs heading levels
  const headingTargets: { text: string; gdocsLevel: string }[] = [];

  for (const chunk of ast.chunks) {
    for (const seg of chunk.segments) {
      if (seg.type === "heading" && seg.level >= 1 && seg.level <= 4) {
        const gdocsLevel = getGdocsLevel(seg.level, seg.content);
        headingTargets.push({ text: seg.content, gdocsLevel });
      }
    }
  }

  // Now scan the document paragraphs and match them
  const styleRequests: any[] = [];

  function walkElements(elements: any[]): void {
    for (const el of elements) {
      if (el.paragraph) {
        const para = el.paragraph;
        const paraText = extractParagraphText(para);

        if (paraText) {
          // Check if this text matches any of our headings
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

                // Also bold the heading text
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
            if (cell.content) {
              walkElements(cell.content);
            }
          }
        }
      }
    }
  }

  walkElements(doc.body?.content || []);

  // Apply heading styles in batches
  if (styleRequests.length > 0) {
    // Split into batches of 50 to avoid request size limits
    for (let i = 0; i < styleRequests.length; i += 50) {
      const batch = styleRequests.slice(i, i + 50);
      await fetch(
        `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ requests: batch }),
        },
      );
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // Phase 2: Insert native TOC at tracked position
  if (tocPosition && tocPosition > 0) {
    // First, find and remove the placeholder [DAFTAR ISI] text
    const readRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const freshDoc: any = await readRes.json();

    // Find our placeholder text
    let placeholderStart = -1;
    let placeholderEnd = -1;

    function findPlaceholder(elements: any[]): void {
      for (const el of elements) {
        if (el.paragraph) {
          const text = extractParagraphText(el.paragraph);
          if (text?.includes("[DAFTAR ISI]")) {
            placeholderStart = el.startIndex;
            placeholderEnd = el.endIndex;
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

    // Insert native TOC at placeholder position
    const tocRequests: any[] = [];

    // First, clear the placeholder (use insertText to overwrite)
    if (placeholderStart > 0 && placeholderEnd > placeholderStart) {
      tocRequests.push({
        insertText: {
          location: { index: placeholderStart },
          text: "",
        },
      });
    }

    // Insert the native TOC element
    if (placeholderStart > 0) {
      tocRequests.push({
        insertTableOfContents: {
          location: { index: placeholderStart + 1 },
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
      // Try to insert TOC; it might fail on some Google Workspace plans
      try {
        await fetch(
          `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ requests: tocRequests }),
          },
        );
      } catch (tocErr: any) {
        console.warn("⚠️ Could not insert native TOC (may not be supported on this account):", tocErr.message);
      }
    }
  }
}

function extractParagraphText(para: any): string | null {
  if (!para?.elements) return null;
  let text = "";
  for (const el of para.elements) {
    if (el.textRun?.content) {
      text += el.textRun.content;
    }
  }
  return text.trim() || null;
}

function getGdocsLevel(mdLevel: number, content: string): string {
  // ## sections (major sections like Pengembangan Sistem) → HEADING_1
  if (mdLevel === 2) return "HEADING_1";
  // ### topics → HEADING_2
  if (mdLevel === 3) return "HEADING_2";
  // #### subtopics → HEADING_3
  if (mdLevel === 4) return "HEADING_3";
  // # title → HEADING_1
  return "HEADING_1";
}

// ── Main Export Worker ──

/**
 * Run the full export pipeline:
 *   1. Parse markdown into AST
 *   2. Create Google Docs document
 *   3. Process chunks with rate limiting
 *   4. Apply heading styles
 *   5. Insert native TOC
 *   6. Return document URL
 */
export async function runExportWorker(options: WorkerOptions): Promise<WorkerResult> {
  const { accessToken, markdownContent, documentTitle, onProgress, resumeFromChunk } = options;
  let { documentId } = options;

  // Step 1: Parse markdown into AST
  const ast = parseDocument(markdownContent, documentTitle);
  const totalChunks = ast.chunks.length;

  console.log(`📄 Export Worker starting: "${documentTitle}" (${totalChunks} chunks)`);
  printChunks(ast);

  // Build the document URL
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // Step 3: Process chunks
  const startChunk = resumeFromChunk || 0;
  let completedChunks = startChunk;
  const failedChunks: string[] = [];
  let currentTocPosition: number | undefined;

  for (let i = startChunk; i < totalChunks; i++) {
    const chunk = ast.chunks[i];
    const chunkNum = i + 1;

    // Report progress
    onProgress?.({
      chunkId: chunk.id,
      chunkLabel: chunk.label,
      currentChunk: chunkNum,
      totalChunks,
      progress: Math.round((i / totalChunks) * 100),
      message: `Menulis ${chunk.label}...`,
    });

    console.log(`  🏗️  Chunk ${chunkNum}/${totalChunks}: ${chunk.label}`);

    // Execute the chunk
    const result = await executeChunk({
      accessToken,
      documentId,
      chunk,
      isFirstChunk: i === 0,
      isLastChunk: i === totalChunks - 1,
      tocPosition: currentTocPosition,
    });

    // Track TOC position
    if (result.tocPosition) {
      currentTocPosition = result.tocPosition;
    }

    if (!result.success) {
      failedChunks.push(chunk.id);
      console.error(`  ❌ Chunk ${chunkNum} failed: ${result.error}`);
    } else {
      completedChunks = i + 1;
      console.log(`  ✅ Chunk ${chunkNum} completed`);
    }

    // Rate limiting: sleep between chunks
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Step 4: Apply heading styles and insert TOC
  onProgress?.({
    chunkId: "styles",
    chunkLabel: "Formatting",
    currentChunk: totalChunks,
    totalChunks,
    progress: 95,
    message: "Menerapkan format heading...",
  });

  try {
    await applyHeadingStyles(accessToken, documentId, ast, currentTocPosition);
  } catch (styleErr: any) {
    console.warn("⚠️ Heading style application error:", styleErr.message);
  }

  // Step 5: Final progress
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
