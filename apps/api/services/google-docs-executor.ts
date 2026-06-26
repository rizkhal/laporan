/**
 * Google Docs Chunk Executor
 *
 * Executes a single document chunk against the Google Docs API.
 * Each chunk is rendered as a logical section (Cover, Kata Pengantar, etc.)
 * using batched batchUpdate requests.
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
  accessToken: string;
  documentId: string;
  chunk: DocumentChunk;
  isFirstChunk: boolean;
  isLastChunk: boolean;
  tocPosition?: number;
}

// ── Heading Mapping ──

const GOOGLE_HEADING_MAP: Record<number, string> = {
  1: "HEADING_1",
  2: "HEADING_1", // ## sections → HEADING_1 for TOC
  3: "HEADING_2", // ### topics → HEADING_2
  4: "HEADING_3", // #### subtopics → HEADING_3
};

// ── Raw API Helper ──

async function rawBatchUpdate(
  accessToken: string,
  documentId: string,
  requests: any[],
): Promise<any> {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ requests }),
    },
  );

  const data: any = await res.json();

  if (!res.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data?.error || data);
    throw new Error(`Google Docs API error: ${errMsg}`);
  }

  return data;
}

// ── Document Reader ──

async function getDoc(accessToken: string, documentId: string): Promise<any> {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to read document (${res.status})`);
  }

  return res.json();
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

// ── Segment Renderers ──

/**
 * Build batchUpdate requests for text and heading segments.
 */
function buildTextInsertRequests(
  segment: Segment,
  insertPos: number,
): any[] {
  const requests: any[] = [];

  if (segment.type === "text") {
    const text = segment.content;
    requests.push({
      insertText: {
        location: { index: insertPos },
        text: text + "\n",
      },
    });
  }

  return requests;
}

/**
 * Build batchUpdate requests for a table segment.
 */
function buildTableInsertRequests(
  segment: Segment,
  insertPos: number,
): any[] {
  const requests: any[] = [];
  const tableData = segment.type === "table" ? segment.tableData : null;
  if (!tableData || tableData.rows.length === 0) return requests;

  const rows = tableData.rows.length;
  const cols = Math.max(...tableData.rows.map((r) => r.length));

  // Insert the table structure
  requests.push({
    insertTable: {
      rows,
      columns: cols,
      location: { index: insertPos },
    },
  });

  // Populate cells with text (done after insertTable)
  // We cannot know cell indices ahead of time, so we return the request
  // and cells are populated in a follow-up after reading the document
  return requests;
}

/**
 * Populate table cells after the table is inserted.
 */
async function populateTableCells(
  accessToken: string,
  documentId: string,
  tableData: { rows: string[][] },
): Promise<void> {
  const doc = await getDoc(accessToken, documentId);
  const table = findLastTable(doc);
  if (!table) return;

  const cellRequests: any[] = [];

  for (let rowIdx = 0; rowIdx < table.rows.length && rowIdx < tableData.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    const dataRow = tableData.rows[rowIdx];

    for (let colIdx = 0; colIdx < row.tableCells.length && colIdx < dataRow.length; colIdx++) {
      const cell = row.tableCells[colIdx];
      const cellStart = cell.startIndex + 1; // Skip the initial \n

      // Insert content into cell
      cellRequests.push({
        insertText: {
          location: { index: cellStart },
          text: dataRow[colIdx],
        },
      });
    }
  }

  if (cellRequests.length > 0) {
    await rawBatchUpdate(accessToken, documentId, cellRequests);
  }

  // Bold header row
  if (table.rows.length > 0) {
    const headerRow = table.rows[0];
    const boldRequests: any[] = [];

    for (const cell of headerRow.tableCells) {
      // Find the first text run in the cell
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
      await rawBatchUpdate(accessToken, documentId, boldRequests);
    }
  }
}

// ── Main Executor ──

/**
 * Execute a single chunk against the Google Docs API.
 *
 * For each segment in the chunk:
 *   - Read the document to find current end position
 *   - Insert text/heading at end
 *   - Insert tables at end (with cell population)
 *   - Track TOC position for later insertion
 *
 * Returns the result including any tracked TOC position.
 */
export async function executeChunk(options: ExecuteOptions): Promise<ChunkResult> {
  const { accessToken, documentId, chunk, isFirstChunk } = options;
  let tocPosition: number | undefined = options.tocPosition;

  try {
    // Phase 1: Insert all text content
    const textRequests: any[] = [];
    let hasTable = false;
    let tableSegIndex = -1;

    for (let i = 0; i < chunk.segments.length; i++) {
      const seg = chunk.segments[i];

      if (seg.type === "text" || (seg.type === "heading" && seg.level <= 4)) {
        // Read document to find insert position
        const doc = await getDoc(accessToken, documentId);
        const insertPos = getBodyEnd(doc) - 1; // Before trailing \n

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
        tableSegIndex = i;
      } else if (seg.type === "toc") {
        // Save TOC position for later
        const doc = await getDoc(accessToken, documentId);
        const insertPos = getBodyEnd(doc) - 1;
        tocPosition = insertPos;

        // Insert placeholder text that will be replaced later
        textRequests.push({
          insertText: {
            location: { index: insertPos },
            text: "[DAFTAR ISI]\n",
          },
        });
      } else if (seg.type === "pagebreak") {
        const doc = await getDoc(accessToken, documentId);
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
      await rawBatchUpdate(accessToken, documentId, textRequests);
    }

    // Phase 2: Insert tables (separately because they need cell population)
    if (hasTable) {
      for (const seg of chunk.segments) {
        if (seg.type === "table") {
          const doc = await getDoc(accessToken, documentId);
          const insertPos = getBodyEnd(doc) - 1;

          const tableRequests = buildTableInsertRequests(seg, insertPos);
          if (tableRequests.length > 0) {
            await rawBatchUpdate(accessToken, documentId, tableRequests);
          }

          // Populate table cells
          await populateTableCells(accessToken, documentId, seg.tableData);
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
