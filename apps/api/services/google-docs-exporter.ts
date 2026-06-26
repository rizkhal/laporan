/**
 * Google Docs Export Service — Block-Based BatchUpdate Generator
 *
 * Parses markdown into typed blocks (h1, h2, h3, p), builds a single
 * batchUpdate request array, and sends it in ONE operation.
 *
 * PRINCIPLES:
 *   - All content is inserted as a single insertText — no reversal bugs
 *   - Heading positions are computed from STRING positions, not document indices
 *   - No mid-export document state reads
 *   - No manual index tracking in business logic
 *   - Heading styles are applied from known string offsets + insert offset
 *   - Google Docs TOC derives from heading styles — no manual TOC generation
 *
 * PIPELINE:
 *   Markdown → Blocks → Single insertText + N updateParagraphStyle
 *                     → One batchUpdate call → Done
 */

import { google } from "googleapis";
import type { docs_v1 } from "googleapis";

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

type BlockType = "h1" | "h2" | "h3" | "p";

interface Block {
  type: BlockType;
  text: string;
}

interface ParagraphStyleSpec {
  /** String offset where the text starts within the combined content */
  startOffset: number;
  /** String offset where the text ends within the combined content */
  endOffset: number;
  /** Google Docs named style type */
  style: "HEADING_1" | "HEADING_2" | "HEADING_3" | "NORMAL_TEXT";
}

// ── OAuth2 Client ──

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

// ── Block Parsing ──

/**
 * Parse markdown content into typed blocks.
 *
 * Heading detection: lines matching `^#{1,4} text` → h1/h2/h3
 * Everything else → paragraph (p)
 *
 * Special markers:
 *   - `<!-- GOOGLE_DOCS_TOC -->` stripped entirely
 *   - `<!-- PAGE_BREAK -->` stripped entirely
 *   - Bold `**text**` → plain `text`
 */
function parseMarkdownToBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  const headingRe = /^(#{1,4})\s+(.*)$/;

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip special markers entirely
    if (trimmed === "<!-- GOOGLE_DOCS_TOC -->" || trimmed === "<!-- PAGE_BREAK -->") {
      i++;
      continue;
    }

    // Skip horizontal rules
    if (trimmed === "---") {
      i++;
      continue;
    }

    // Heading detection
    const hMatch = raw.match(headingRe);
    if (hMatch) {
      const level = hMatch[1].length;
      let text = hMatch[2].trim();

      // Strip bold from heading text
      text = text.replace(/\*\*/g, "");

      if (text) {
        let type: BlockType;
        if (level <= 2) {
          type = "h1";
        } else if (level === 3) {
          type = "h2";
        } else {
          type = "h3";
        }
        blocks.push({ type, text });
      }
      i++;
      continue;
    }

    // Collect paragraph text (accumulate until next heading or marker)
    let paraLines: string[] = [];
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();

      // Stop at heading, special marker, or HR
      if (
        headingRe.test(line) ||
        t === "<!-- GOOGLE_DOCS_TOC -->" ||
        t === "<!-- PAGE_BREAK -->" ||
        t === "---"
      ) {
        break;
      }

      paraLines.push(line);
      i++;
    }

    const paraText = paraLines
      .join("\n")
      .replace(/\*\*/g, "")
      .trim();

    if (paraText) {
      blocks.push({ type: "p", text: paraText });
    }
  }

  return blocks;
}

// ── BatchUpdate Builder ──

/**
 * Visual indentation levels (in points).
 * These are SEPARATE from heading styles — heading style controls TOC structure,
 * indentation controls visual hierarchy for readability.
 *
 *   Level 1 (H1)         → 0 pt
 *   Level 2 (H2)         → 24 pt
 *   Level 3 (H3 / para)  → 48 pt
 */
const INDENT_LEVELS: Record<BlockType, number> = {
  h1: 0,
  h2: 24,
  h3: 48,
  p: 0, // paragraphs inherit dynamically, this is unused
};

/**
 * Resolve the visual indent for a paragraph based on the most recent heading level.
 */
function resolveParagraphIndent(lastHeadingType: BlockType | null): number {
  if (!lastHeadingType) return 0;
  return INDENT_LEVELS[lastHeadingType];
}

/**
 * Build the combined content string and style specifications for EVERY block.
 *
 * Each block contributes its text + "\n" to the content string.
 *
 * STRUCTURE vs VISUAL layout:
 *   - heading style (HEADING_1/2/3) = logical structure for TOC
 *   - indentStart = visual indentation for readability
 *
 * Paragraphs inherit indentation from the most recent heading.
 *
 * The INSERT index is determined once by the caller (the document
 * end position). All style offsets are relative to that single index.
 */
function buildBatchPayload(
  blocks: Block[],
  insertIndex: number,
): { content: string; styleReqs: any[] } {
  let content = "";
  const specs: ParagraphStyleSpec[] = [];
  let lastHeadingType: BlockType | null = null;

  for (const block of blocks) {
    const text = block.text + "\n";
    const startOffset = content.length;
    content += text;

    // Track the most recent heading for paragraph inheritance
    if (block.type !== "p") {
      lastHeadingType = block.type;
    }

    // Track EVERY block's style spec (headings AND paragraphs)
    specs.push({
      startOffset,
      endOffset: startOffset + block.text.length,
      style:
        block.type === "h1"
          ? "HEADING_1"
          : block.type === "h2"
            ? "HEADING_2"
            : block.type === "h3"
              ? "HEADING_3"
              : "NORMAL_TEXT",
    });
  }

  // Build style requests from specs
  // Each spec's document index = insertIndex + startOffset
  const styleReqs: any[] = [];
  let currentHeadingType: BlockType | null = null;

  for (const spec of specs) {
    const startIndex = insertIndex + spec.startOffset;
    const endIndex = insertIndex + spec.endOffset;

    if (!(startIndex >= 0 && endIndex > startIndex)) continue;

    const isHeading = spec.style !== "NORMAL_TEXT";

    // Track heading type for paragraph indentation inheritance
    if (isHeading) {
      if (spec.style === "HEADING_1") currentHeadingType = "h1";
      else if (spec.style === "HEADING_2") currentHeadingType = "h2";
      else if (spec.style === "HEADING_3") currentHeadingType = "h3";
    }

    // Resolve visual indentation for this block
    // Headings use their own level, paragraphs inherit from parent heading
    const indentPt = isHeading
      ? INDENT_LEVELS[blockTypeFromStyle(spec.style)]
      : resolveParagraphIndent(currentHeadingType);

    const paragraphStyle: any = {
      indentStart: { magnitude: indentPt, unit: "PT" },
      indentFirstLine: { magnitude: 0, unit: "PT" },
      spaceAbove: { magnitude: isHeading ? 12 : 0, unit: "PT" },
      spaceBelow: { magnitude: 6, unit: "PT" },
      lineSpacing: 115,
      namedStyleType: spec.style,
    };

    styleReqs.push({
      updateParagraphStyle: {
        range: { startIndex, endIndex },
        paragraphStyle,
        fields:
          "namedStyleType,indentStart,indentFirstLine,spaceAbove,spaceBelow,lineSpacing",
      },
    });
  }

  return { content, styleReqs };
}

/**
 * Map a Google Docs named style back to a BlockType for indentation resolution.
 */
function blockTypeFromStyle(style: string): BlockType {
  if (style === "HEADING_1") return "h1";
  if (style === "HEADING_2") return "h2";
  if (style === "HEADING_3") return "h3";
  return "p";
}

// ── Google Docs: Insert Content + Apply Styles (Single Pass) ──

/**
 * Send a single batchUpdate with ALL content and paragraph styles.
 *
 * Strategy:
 *   1. Read document once to get the end-of-document insert position
 *   2. Build content string and style requests from blocks + insert position
 *   3. Send one batchUpdate with:
 *      - insertText (all content)
 *      - updateParagraphStyle (ALL paragraphs — headings AND body)
 *
 * Every paragraph gets explicit zero indentation + standard spacing.
 * This prevents Google Docs from auto-converting dashes/bullets into list items.
 *
 * Total API calls: 1 read + 1 write
 */
async function renderContent(
  docs: docs_v1.Docs,
  documentId: string,
  blocks: Block[],
  insertIndex: number,
): Promise<void> {
  // Build content and styles from blocks
  const { content, styleReqs } = buildBatchPayload(blocks, insertIndex);

  if (!content.trim()) {
    console.warn("⚠️ No content to insert, skipping.");
    return;
  }

  // Build the complete request array: insertText + all styles
  const requests: any[] = [
    {
      insertText: {
        location: { index: insertIndex },
        text: content,
      },
    },
    ...styleReqs,
  ];

  console.log(
    `📦 Sending batchUpdate: 1 insertText + ${styleReqs.length} paragraph style operations (${content.length} chars)`,
  );

  // Single batchUpdate — ALL operations in one call
  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

// ── Main Export Function ──

/**
 * Export the report to Google Docs.
 *
 * PIPELINE:
 *   1. Auth
 *   2. Create blank document
 *   3. Read document once → get end position
 *   4. Parse markdown into blocks (h1, h2, h3, p)
 *   5. Build content string + paragraph style requests from blocks
 *   6. Single batchUpdate: insertText + all updateParagraphStyle
 *   7. Return document URL
 *
 * TOTAL API CALLS: 2 (create + 1 read + 1 batchUpdate = 2 round-trips)
 */
export async function exportToGoogleDocs(config: ExportConfig): Promise<ExportResult> {
  const { accessToken, refreshToken, documentTitle, markdownContent, onProgress } = config;

  console.log(`📝 Starting Google Docs export: "${documentTitle}" (${markdownContent.length} chars)`);

  // Step 1: Auth
  onProgress?.({ message: "Mengautentikasi...", progress: 2 });

  const oauthClient = createOAuth2Client();
  oauthClient.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  const docs = google.docs({ version: "v1", auth: oauthClient });

  // Step 2: Create blank document
  onProgress?.({ message: "Membuat dokumen...", progress: 5 });

  const createRes = await docs.documents.create({ requestBody: { title: documentTitle } });
  const documentId = createRes.data.documentId;
  if (!documentId) throw new Error("Failed to create document: no documentId");

  console.log(`✅ Document created: ${documentId}`);

  // Step 3: Read document once to determine insert position
  onProgress?.({ message: "Menganalisis struktur...", progress: 10 });

  const docState = await docs.documents.get({ documentId });
  const contentEls = docState.data.body?.content || [];
  const lastEl = contentEls.length > 0 ? contentEls[contentEls.length - 1] : null;

  // The end-of-document index (insert at this position appends to the document)
  const insertIndex = lastEl?.endIndex != null ? lastEl.endIndex - 1 : 1;

  console.log(`📍 Document end at index ${lastEl?.endIndex}, using insert index ${insertIndex}`);

  // Step 4: Parse markdown into blocks
  onProgress?.({ message: "Memproses konten...", progress: 20 });

  const blocks = parseMarkdownToBlocks(markdownContent);

  console.log(`📄 Parsed ${blocks.length} blocks:`, {
    h1: blocks.filter((b) => b.type === "h1").length,
    h2: blocks.filter((b) => b.type === "h2").length,
    h3: blocks.filter((b) => b.type === "h3").length,
    p: blocks.filter((b) => b.type === "p").length,
  });

  if (blocks.length === 0) {
    throw new Error("No content blocks found in markdown. Cannot export empty report.");
  }

  // Step 5 + 6: Build payload and send single batchUpdate
  onProgress?.({ message: "Menulis konten...", progress: 30 });

  await renderContent(docs, documentId, blocks, insertIndex);

  onProgress?.({ message: "Selesai.", progress: 100 });

  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
  console.log(`✅ Google Docs export complete: ${documentUrl}`);

  return { documentId, documentUrl };
}
