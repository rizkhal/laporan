/**
 * Google Docs Chunk Executor
 *
 * Executes a single document chunk against the Google Docs API
 * using the googleapis library (handles OAuth2 token refresh automatically).
 */

import { type DocumentChunk, type Segment } from "./google-docs-ast";

// ── Types ──

export interface ChunkResult {
  chunkId: string;
  success: boolean;
  error?: string;
  tocPosition?: number;
}

export interface ExecuteOptions {
  /** googleapis docs client (v1) with authenticated OAuth2 client */
  docsClient: any;
  documentId: string;
  chunk: DocumentChunk;
  isFirstChunk: boolean;
  isLastChunk: boolean;
  tocPosition?: number;
}

// ── Document helpers using googleapis client ──

async function getDoc(docsClient: any, documentId: string): Promise<any> {
  const res = await docsClient.documents.get({ documentId });
  return res.data;
}

function getBodyEnd(doc: any): number {
  const content = doc?.body?.content;
  if (!content || content.length === 0) return 1;
  const last = content[content.length - 1];
  return last?.endIndex || 2;
}

function findLastTable(doc: any): any | null {
  const content = doc?.body?.content || [];
  let lastTable: any = null;
  for (const el of content) {
    if (el.table) lastTable = el.table;
  }
  return lastTable;
}

async function batchUpdate(docsClient: any, documentId: string, requests: any[]) {
  const res = await docsClient.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
  return res.data;
}

// ── Table helpers ──

async function populateTableCells(
  docsClient: any,
  documentId: string,
  tableData: { rows: string[][] },
): Promise<void> {
  const doc = await getDoc(docsClient, documentId);
  const table = findLastTable(doc);
  if (!table) return;

  const cellRequests: any[] = [];

  for (let rowIdx = 0; rowIdx < table.rows.length && rowIdx < tableData.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    const dataRow = tableData.rows[rowIdx];

    for (let colIdx = 0; colIdx < row.tableCells.length && colIdx < dataRow.length; colIdx++) {
      const cell = row.tableCells[colIdx];
      const cellStart = cell.startIndex + 1;
      cellRequests.push({
        insertText: {
          location: { index: cellStart },
          text: dataRow[colIdx],
        },
      });
    }
  }

  if (cellRequests.length > 0) {
    await batchUpdate(docsClient, documentId, cellRequests);
  }

  // Bold header row
  if (table.rows.length > 0) {
    const headerRow = table.rows[0];
    const boldRequests: any[] = [];

    for (const cell of headerRow.tableCells) {
      const cs = cell.startIndex + 1;
      const ce = cell.endIndex - 1;
      if (cs < ce) {
        boldRequests.push({
          updateTextStyle: {
            range: { startIndex: cs, endIndex: ce },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      }
    }

    if (boldRequests.length > 0) {
      await batchUpdate(docsClient, documentId, boldRequests);
    }
  }
}

// ── Main Executor ──

export async function executeChunk(options: ExecuteOptions): Promise<ChunkResult> {
  const { docsClient, documentId, chunk } = options;
  let tocPosition: number | undefined = options.tocPosition;

  try {
    // Phase 1: Insert all text content
    const textRequests: any[] = [];
    let hasTable = false;

    for (let i = 0; i < chunk.segments.length; i++) {
      const seg = chunk.segments[i];

      if (seg.type === "text" || (seg.type === "heading" && seg.level <= 4)) {
        const doc = await getDoc(docsClient, documentId);
        const insertPos = getBodyEnd(doc) - 1;

        const prefix = seg.type === "heading" ? `${"#".repeat(seg.level)} ` : "";
        const text = prefix ? `${prefix}${seg.content}\n` : `${seg.content}\n`;

        textRequests.push({
          insertText: {
            location: { index: insertPos },
            text,
          },
        });
      } else if (seg.type === "table") {
        hasTable = true;
      } else if (seg.type === "toc") {
        const doc = await getDoc(docsClient, documentId);
        const insertPos = getBodyEnd(doc) - 1;
        tocPosition = insertPos;

        textRequests.push({
          insertText: {
            location: { index: insertPos },
            text: "[DAFTAR ISI]\n",
          },
        });
      } else if (seg.type === "pagebreak") {
        const doc = await getDoc(docsClient, documentId);
        const insertPos = getBodyEnd(doc) - 1;

        textRequests.push({
          insertPageBreak: {
            location: { index: insertPos },
          },
        });
      }
    }

    // Apply all text insertions in batch
    if (textRequests.length > 0) {
      await batchUpdate(docsClient, documentId, textRequests);
    }

    // Phase 2: Insert tables (separately for cell population)
    if (hasTable) {
      for (const seg of chunk.segments) {
        if (seg.type === "table") {
          const doc = await getDoc(docsClient, documentId);
          const insertPos = getBodyEnd(doc) - 1;

          const rows = seg.tableData.rows.length;
          const cols = Math.max(...seg.tableData.rows.map((r) => r.length));

          await batchUpdate(docsClient, documentId, [
            {
              insertTable: {
                rows,
                columns: cols,
                location: { index: insertPos },
              },
            },
          ]);

          await populateTableCells(docsClient, documentId, seg.tableData);
        }
      }
    }

    return {
      chunkId: chunk.id,
      success: true,
      tocPosition,
    };
  } catch (err: any) {
    return {
      chunkId: chunk.id,
      success: false,
      error: err.message,
      tocPosition,
    };
  }
}
