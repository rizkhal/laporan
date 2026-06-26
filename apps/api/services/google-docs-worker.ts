/**
 * Google Docs Export Worker
 *
 * Rate-limited orchestrator for Google Docs export jobs.
 * All API calls go through the googleapis library (handles OAuth2 refresh).
 *
 * Post-processing pipeline:
 *   1. Match heading text → apply HEADING_1/2/3 styles
 *   2. Find "DAFTAR ISI" → insert native TOC after it
 *   3. No manual TOC text, no markdown artifacts
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the full text content from a paragraph element.
 */
function extractParagraphText(para: any): string | null {
  if (!para?.elements) return null;
  let text = "";
  for (const el of para.elements) {
    if (el.textRun?.content) text += el.textRun.content;
  }
  return text.trim() || null;
}

/**
 * Map markdown heading level to Google Docs named style.
 *
 * RULE 2: Proper heading hierarchy
 *   - Title / Section (##) → HEADING_1
 *   - Topic (###) → HEADING_2
 *   - Subtopic (####) → HEADING_3
 */
function getGdocsLevel(mdLevel: number): string {
  if (mdLevel <= 2) return "HEADING_1";
  if (mdLevel === 3) return "HEADING_2";
  if (mdLevel === 4) return "HEADING_3";
  return "HEADING_1";
}

// ── Post-processing pipeline ──

/**
 * Apply heading styles to the document.
 *
 * Reads the document once, finds all paragraphs that match heading text
 * from the AST, and applies native Google Docs heading styles (HEADING_1/2/3).
 *
 * This runs AFTER all content is inserted, so the text is clean
 * (no markdown `#` prefix — that was stripped by the executor).
 */
async function applyHeadingStyles(
  docsClient: any,
  documentId: string,
  ast: DocumentAST,
): Promise<void> {
  // Read the complete document
  const docRes = await docsClient.documents.get({ documentId });
  const doc: any = docRes.data;

  // Build heading targets from AST (in order they appear)
  const headingTargets: { text: string; gdocsLevel: string }[] = [];

  for (const chunk of ast.chunks) {
    for (const seg of chunk.segments) {
      if (seg.type === "heading" && seg.level >= 1 && seg.level <= 4) {
        const cleanContent = seg.content.replace(/\*\*/g, "").trim();
        if (cleanContent) {
          headingTargets.push({
            text: cleanContent,
            gdocsLevel: getGdocsLevel(seg.level),
          });
        }
      }
    }
  }

  if (headingTargets.length === 0) return;

  // Walk the document body sequentially, matching paragraphs to heading targets
  // Use a pointer into headingTargets to handle sequential matching
  let targetIdx = 0;
  const styleRequests: any[] = [];

  function walkElements(elements: any[]): void {
    for (const el of elements) {
      if (targetIdx >= headingTargets.length) return;

      if (el.paragraph) {
        const paraText = extractParagraphText(el.paragraph);
        if (paraText && el.startIndex && el.endIndex) {
          const target = headingTargets[targetIdx];
          const cleanPara = paraText.replace(/\*\*/g, "").trim();

          if (cleanPara === target.text) {
            // Apply heading style
            styleRequests.push({
              updateParagraphStyle: {
                range: { startIndex: el.startIndex, endIndex: el.endIndex },
                paragraphStyle: {
                  namedStyleType: target.gdocsLevel,
                  spaceAbove: { magnitude: 12, unit: "PT" },
                  spaceBelow: { magnitude: 6, unit: "PT" },
                },
                fields: "namedStyleType,spaceAbove,spaceBelow",
              },
            });

            // Bold the heading text
            styleRequests.push({
              updateTextStyle: {
                range: { startIndex: el.startIndex, endIndex: el.endIndex },
                textStyle: { bold: true },
                fields: "bold",
              },
            });

            targetIdx++;
          }
        }
      }

      // Recurse into tables
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
}

/**
 * Insert native Table of Contents after the "DAFTAR ISI" heading.
 *
 * RULES 1 + 5:
 *   - ONLY insert native Google Docs Table of Contents object
 *   - No text, no bullet list, no manual TOC
 *   - Based on heading styles
 */
async function insertNativeToc(
  docsClient: any,
  documentId: string,
): Promise<void> {
  // Read the document to find the "DAFTAR ISI" paragraph
  let doc: any;
  try {
    const res = await docsClient.documents.get({ documentId });
    doc = res.data;
  } catch {
    return;
  }

  // Find "DAFTAR ISI" paragraph end index
  let daftarIsiEnd = -1;

  function findDaftarIsi(elements: any[]): boolean {
    for (const el of elements) {
      if (el.paragraph) {
        const text = extractParagraphText(el.paragraph);
        if (text?.trim() === "DAFTAR ISI") {
          daftarIsiEnd = el.endIndex;
          return true;
        }
      }
      if (el.table) {
        for (const row of el.table.tableRows) {
          for (const cell of row.tableCells) {
            if (cell.content && findDaftarIsi(cell.content)) return true;
          }
        }
      }
    }
    return false;
  }

  findDaftarIsi(doc.body?.content || []);

  if (daftarIsiEnd <= 0) {
    console.warn("⚠️ Could not find DAFTAR ISI heading in document, skipping TOC");
    return;
  }

  // Insert native TOC right after the DAFTAR ISI paragraph
  try {
    await docsClient.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertTableOfContents: {
              location: { index: daftarIsiEnd },
            },
          },
        ],
      },
    });
    console.log("  ✅ Native TOC inserted after DAFTAR ISI");
  } catch (tocErr: any) {
    console.warn("⚠️ Native TOC insertion failed:", tocErr.message);
  }
}

// ── Main Export Worker ──

/**
 * Run the full export pipeline:
 *   1. Parse markdown into AST (no markdown prefixes in Google Docs)
 *   2. Process chunks with rate limiting (insert clean text)
 *   3. Apply heading styles (HEADING_1/2/3)
 *   4. Insert native TOC after DAFTAR ISI heading
 *   5. Return document URL
 */
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
    });

    if (!result.success) {
      failedChunks.push(chunk.id);
      console.error(`  ❌ Chunk ${chunkNum} failed: ${result.error}`);
    } else {
      completedChunks = i + 1;
      console.log(`  ✅ Chunk ${chunkNum} completed`);
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Step 3: Apply heading styles
  onProgress?.({
    chunkId: "styles",
    chunkLabel: "Formatting",
    currentChunk: totalChunks,
    totalChunks,
    progress: 90,
    message: "Menerapkan format heading...",
  });

  try {
    await applyHeadingStyles(docsClient, documentId, ast);
  } catch (styleErr: any) {
    console.warn("⚠️ Heading style application error:", styleErr.message);
  }

  // Step 4: Insert native TOC
  onProgress?.({
    chunkId: "toc",
    chunkLabel: "TOC",
    currentChunk: totalChunks,
    totalChunks,
    progress: 95,
    message: "Menyisipkan daftar isi...",
  });

  try {
    await insertNativeToc(docsClient, documentId);
  } catch (tocErr: any) {
    console.warn("⚠️ TOC insertion error:", tocErr.message);
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
