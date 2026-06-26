/**
 * Google Docs AST Builder
 *
 * Parses a markdown report into logical document sections (chunks).
 * Each chunk represents an independently renderable document section.
 *
 * RULE 7: Strips markdown list artifacts:
 *   - `- `, `* `, `+ ` (unordered list markers)
 *   - `1. `, `2. `, `a. `, `b. ` (ordered list markers)
 *   - Indentation-based hierarchy
 *
 * Chunk boundaries are detected from markdown heading levels:
 *   - Cover
 *   - Kata Pengantar
 *   - Daftar Isi
 *   - Main sections (Pengembangan Sistem, Perbaikan, Infrastruktur, Kesimpulan)
 *   - Lampiran
 */

// ── Segment Types ──

export interface TableData {
  rows: string[][];
}

export type Segment =
  | { type: "text"; content: string }
  | { type: "heading"; content: string; level: number }
  | { type: "table"; tableData: TableData }
  | { type: "toc" }
  | { type: "pagebreak" }
  | { type: "hr" };

export interface DocumentChunk {
  id: string;
  label: string;
  segments: Segment[];
}

export interface DocumentAST {
  title: string;
  chunks: DocumentChunk[];
}

// ── Constants ──

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const TABLE_ROW_RE = /^\|(.+)\|\s*$/;
const TABLE_SEPARATOR_RE = /^\|[-:\s|]+\|\s*$/;

// Section heading text patterns that define major chunk boundaries
const SECTION_HEADINGS: { pattern: RegExp; label: string }[] = [
  { pattern: /LAPORAN KEMAJUAN PEKERJAAN/i, label: "Cover" },
  { pattern: /^KATA PENGANTAR$/i, label: "Kata Pengantar" },
  { pattern: /^DAFTAR ISI$/i, label: "Daftar Isi" },
  { pattern: /I{0,3}\s*\.?\s*PENGEMBANGAN SISTEM/i, label: "Pengembangan Sistem" },
  { pattern: /I{0,3}\s*\.?\s*PERBAIKAN DAN PENYEMPURNAAN/i, label: "Perbaikan dan Penyempurnaan" },
  { pattern: /I{0,3}\s*\.?\s*INFRASTRUKTUR DAN DEPLOYMENT/i, label: "Infrastruktur dan Deployment" },
  { pattern: /I{0,3}\s*\.?\s*KESIMPULAN/i, label: "Kesimpulan" },
  { pattern: /^V?\s*\.?\s*LAMPIRAN/i, label: "Lampiran" },
  { pattern: /^Lampiran\s/i, label: "Lampiran" },
];

// ── List stripping ──

/**
 * RULE 7: Strip markdown list artifacts from a line.
 * Removes:
 *   - `- `, `* `, `+ ` (unordered list markers)
 *   - `1. `, `2. `, `a. `, `b. ` (ordered list markers)
 *   - leading whitespace indentation
 */
function stripListMarker(line: string): string {
  const trimmed = line.trim();

  // Strip "* " prefix (bold/italic in markdown lists)
  if (trimmed.startsWith("* ")) return trimmed.substring(2).trim();
  if (trimmed.startsWith("- ")) return trimmed.substring(2).trim();
  if (trimmed.startsWith("+ ")) return trimmed.substring(2).trim();

  // Strip ordered list markers like "1. ", "2. ", "a. ", "b. "
  const orderedRe = /^\d+\.\s+/;
  if (orderedRe.test(trimmed)) {
    return trimmed.replace(orderedRe, "").trim();
  }

  // Strip letter list markers like "a. ", "b. "
  const letterRe = /^[a-zA-Z]\.\s+/;
  if (letterRe.test(trimmed)) {
    return trimmed.replace(letterRe, "").trim();
  }

  // Strip "(a)", "(b)" etc
  const parenRe = /^\([a-zA-Z0-9]\)\s+/;
  if (parenRe.test(trimmed)) {
    return trimmed.replace(parenRe, "").trim();
  }

  return line;
}

// ── Helpers ──

function parseTableRow(line: string): string[] {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return TABLE_SEPARATOR_RE.test(line.trim());
}

function stripMarkdownInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

/**
 * Normalize a heading's text content for section matching.
 */
function normalizeHeading(text: string): string {
  return text.replace(/\*\*/g, "").trim();
}

/**
 * Check if a heading text matches a known section boundary.
 */
function detectSectionLabel(text: string): string | null {
  const normalized = normalizeHeading(text);
  for (const { pattern, label } of SECTION_HEADINGS) {
    if (pattern.test(normalized)) return label;
  }
  return null;
}

/**
 * Generate a stable chunk id from its label.
 */
function chunkId(label: string, index: number): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`;
}

// ── Parsing Functions ──

/**
 * Parse markdown content into segments (flat array).
 * Strips markdown list artifacts from text segments (RULE 7).
 */
function parseSegments(markdown: string): Segment[] {
  const lines = markdown.split("\n");
  const segments: Segment[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Special markers
    if (trimmed === "<!-- GOOGLE_DOCS_TOC -->") {
      segments.push({ type: "toc" });
      i++;
      continue;
    }
    if (trimmed === "<!-- PAGE_BREAK -->") {
      segments.push({ type: "pagebreak" });
      i++;
      continue;
    }

    // Horizontal rule
    if (trimmed === "---") {
      segments.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const hMatch = rawLine.match(HEADING_RE);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2].replace(/\*\*/g, "").trim();
      if (text) {
        // Do NOT strip list markers from headings — they are intentional
        // (e.g., "I. PENGEMBANGAN SISTEM", "a. Subtopic")
        segments.push({ type: "heading", content: text, level });
      }
      i++;
      continue;
    }

    // Table
    if (TABLE_ROW_RE.test(trimmed) && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (isTableSeparator(nextLine)) {
        const tableRows: string[][] = [];
        tableRows.push(parseTableRow(trimmed));
        i += 2;
        while (i < lines.length && TABLE_ROW_RE.test(lines[i].trim())) {
          tableRows.push(parseTableRow(lines[i].trim()));
          i++;
        }
        segments.push({ type: "table", tableData: { rows: tableRows } });
        // Skip trailing blank lines
        while (i < lines.length && lines[i].trim() === "") i++;
        continue;
      }
    }

    // Regular text (accumulate until we hit a heading, table, or marker)
    let textContent = "";
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();

      // Check boundaries
      if (
        t === "<!-- GOOGLE_DOCS_TOC -->" ||
        t === "<!-- PAGE_BREAK -->" ||
        HEADING_RE.test(line) ||
        (TABLE_ROW_RE.test(t) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim()))
      ) {
        break;
      }

      // Skip standalone HR
      if (t === "---") break;

      if (textContent) textContent += "\n";

      // RULE 7: Strip markdown list artifacts from text content
      const strippedLine = stripListMarker(line);

      // Also strip inline formatting for text
      textContent += stripMarkdownInline(strippedLine);

      i++;
    }

    if (textContent.trim()) {
      segments.push({ type: "text", content: textContent });
    }
  }

  return segments;
}

/**
 * Build chunks from flat segments.
 *
 * Chunk boundaries:
 *   - Chapter headings (Cover, Kata Pengantar, Daftar Isi, sections, Kesimpulan, Lampiran)
 *   - Any heading at level 1 or 2 that matches a section boundary pattern
 */
function buildChunks(segments: Segment[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let currentChunks: Segment[] = [];
  let currentLabel = "Cover";
  let chunkCount = 0;

  function flushChunk() {
    if (currentChunks.length > 0) {
      chunks.push({
        id: chunkId(currentLabel, chunkCount),
        label: currentLabel,
        segments: [...currentChunks],
      });
      currentChunks = [];
      chunkCount++;
    }
  }

  for (const segment of segments) {
    if (segment.type === "heading") {
      const detectedLabel = detectSectionLabel(segment.content);
      if (detectedLabel) {
        flushChunk();
        currentLabel = detectedLabel;
      }
    }

    currentChunks.push(segment);
  }

  // Flush last chunk
  flushChunk();

  // If no chunks were created, put everything in a single chunk
  if (chunks.length === 0 && currentChunks.length > 0) {
    chunks.push({
      id: "content-0",
      label: "Content",
      segments: [...currentChunks],
    });
  }

  return chunks;
}

/**
 * Main entry point.
 * Takes markdown content and returns a structured DocumentAST.
 */
export function parseDocument(markdown: string, title: string): DocumentAST {
  const segments = parseSegments(markdown);
  const chunks = buildChunks(segments);

  return {
    title,
    chunks,
  };
}

// ── Debug Helpers ──

export function printChunks(ast: DocumentAST): void {
  console.log(`\n📄 Document: ${ast.title}`);
  console.log(`   Chunks: ${ast.chunks.length}\n`);
  for (const chunk of ast.chunks) {
    const headingCount = chunk.segments.filter((s) => s.type === "heading").length;
    const textCount = chunk.segments.filter((s) => s.type === "text").length;
    const tableCount = chunk.segments.filter((s) => s.type === "table").length;
    const hasTOC = chunk.segments.some((s) => s.type === "toc");
    const hasPageBreak = chunk.segments.some((s) => s.type === "pagebreak");

    console.log(`  📁 [${chunk.id}] ${chunk.label}`);
    console.log(`      ${headingCount} headings, ${textCount} text, ${tableCount} tables`);
    if (hasTOC) console.log(`      ↳ Contains TOC marker`);
    if (hasPageBreak) console.log(`      ↳ Contains page break`);
  }
}
