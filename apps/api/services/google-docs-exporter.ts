/**
 * Google Docs Export Service — Two-Phase BatchUpdate Renderer
 *
 * Phase 1: Insert all content (single insertText).
 * Phase 2: Read document to get actual paragraph structure.
 * Phase 3: Apply heading styles and indentation in SEPARATE requests
 *          to prevent heading defaults from overriding custom formatting.
 *
 * PIPELINE:
 *   Markdown → Blocks → insertText → Read document → Apply styles → Done
 *
 * PRINCIPLES:
 *   - No index computation from string offsets for style application
 *   - Read actual paragraph positions from document structure
 *   - Apply heading styles and indentation in separate batchUpdate calls
 *   - Google Docs TOC derives from heading styles — no manual TOC generation
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

interface ParagraphTarget {
  /** Document start index of the paragraph */
  startIndex: number;
  /** Document end index of the paragraph (includes trailing \n) */
  endIndex: number;
  /** The text content of the paragraph (for heading detection) */
  text: string;
  /** Whether this paragraph is a heading */
  isHeading: boolean;
  /** Heading level if isHeading */
  headingLevel?: "HEADING_1" | "HEADING_2" | "HEADING_3";
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

// ── Visual Indentation Levels ──

const INDENT_LEVELS: Record<string, number> = {
  HEADING_1: 0,
  HEADING_2: 24,
  HEADING_3: 48,
};

function resolveParagraphIndent(headingLevel: string | null): number {
  if (!headingLevel) return 0;
  return INDENT_LEVELS[headingLevel] || 0;
}

// ── Heading Detection ──

const HEADING_RE = /^(#{1,4})\s+(.*)$/;

function detectHeading(text: string): { isHeading: boolean; headingLevel?: "HEADING_1" | "HEADING_2" | "HEADING_3" } {
  const trimmed = text.trim();
  const match = trimmed.match(HEADING_RE);
  if (!match) return { isHeading: false };

  const level = match[1].length;
  const cleanText = match[2].trim().replace(/\*\*/g, "");
  if (!cleanText) return { isHeading: false };

  let headingLevel: "HEADING_1" | "HEADING_2" | "HEADING_3";
  if (level <= 2) {
    headingLevel = "HEADING_1";
  } else if (level === 3) {
    headingLevel = "HEADING_2";
  } else {
    headingLevel = "HEADING_3";
  }

  return { isHeading: true, headingLevel };
}

// ── Block Parsing (from markdown) ──

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

    // Collect paragraph text
    let paraLines: string[] = [];
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();

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

// ── Phase 1: Insert all content ──

async function insertContent(
  docs: docs_v1.Docs,
  documentId: string,
  blocks: Block[],
): Promise<number> {
  // Build single content string from blocks
  const content = blocks.map((b) => b.text + "\n").join("");

  if (!content.trim()) {
    throw new Error("No content to insert");
  }

  // Get current document end position
  const docState = await docs.documents.get({ documentId });
  const contentEls = docState.data.body?.content || [];

  // Find the last PARAGRAPH element (skip section breaks)
  let lastEndIndex = 1;
  for (const el of contentEls) {
    if (el.paragraph && el.endIndex != null) {
      lastEndIndex = Math.max(lastEndIndex, el.endIndex);
    }
  }

  // Insert at the end of the last paragraph (before its trailing \n)
  const insertIndex = lastEndIndex - 1;

  console.log(`📍 Inserting ${content.length} chars at index ${insertIndex}`);

  // Single insertText
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertIndex },
            text: content,
          },
        },
      ],
    },
  });

  // Return the actual content length inserted (for Phase 2 range calculation)
  return insertIndex;
}

// ── Phase 2: Read document and detect paragraph styles ──

async function readAndDetectParagraphs(
  docs: docs_v1.Docs,
  documentId: string,
): Promise<ParagraphTarget[]> {
  const docState = await docs.documents.get({ documentId });
  const contentEls = docState.data.body?.content || [];
  const targets: ParagraphTarget[] = [];

  for (const el of contentEls) {
    if (!el.paragraph || el.startIndex == null || el.endIndex == null) continue;

    // Extract text from paragraph elements
    let text = "";
    if (el.paragraph.elements) {
      for (const elem of el.paragraph.elements) {
        if (elem.textRun?.content) {
          text += elem.textRun.content;
        }
      }
    }

    // Check if this paragraph is a heading
    const { isHeading, headingLevel } = detectHeading(text);

    targets.push({
      startIndex: el.startIndex,
      endIndex: el.endIndex,
      text,
      isHeading,
      headingLevel,
    });
  }

  console.log(
    `📄 Detected ${targets.length} paragraphs: ${targets.filter((t) => t.isHeading).length} headings`,
  );

  return targets;
}

// ── Phase 3: Apply styles in two passes ──

async function applyAllStyles(
  docs: docs_v1.Docs,
  documentId: string,
  targets: ParagraphTarget[],
): Promise<void> {
  if (targets.length === 0) return;

  // Track the most recent heading level for paragraph indent inheritance
  let currentHeadingLevel: string | null = null;

  // PASS 1: Apply namedStyleType (HEADING_1/2/3) to all heading paragraphs
  const headingReqs: any[] = [];

  for (const t of targets) {
    if (!t.isHeading || !t.headingLevel) continue;

    currentHeadingLevel = t.headingLevel;

    headingReqs.push({
      updateParagraphStyle: {
        range: {
          startIndex: t.startIndex,
          endIndex: t.endIndex,
        },
        paragraphStyle: {
          namedStyleType: t.headingLevel,
          spaceAbove: { magnitude: 12, unit: "PT" },
          spaceBelow: { magnitude: 6, unit: "PT" },
          lineSpacing: 115,
        },
        fields: "namedStyleType,spaceAbove,spaceBelow,lineSpacing",
      },
    });
  }

  if (headingReqs.length > 0) {
    console.log(`📝 Applying ${headingReqs.length} heading styles`);
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: headingReqs },
    });
  }

  // PASS 2: Apply indentation to ALL paragraphs
  // Reset heading tracker for indent calculation
  currentHeadingLevel = null;
  const indentReqs: any[] = [];

  for (const t of targets) {
    // Update current heading level
    if (t.isHeading && t.headingLevel) {
      currentHeadingLevel = t.headingLevel;
    }

    // Resolve indentation
    const indentPt = t.isHeading && t.headingLevel
      ? INDENT_LEVELS[t.headingLevel] || 0
      : resolveParagraphIndent(currentHeadingLevel);

    indentReqs.push({
      updateParagraphStyle: {
        range: {
          startIndex: t.startIndex,
          endIndex: t.endIndex,
        },
        paragraphStyle: {
          indentStart: { magnitude: indentPt, unit: "PT" },
          indentFirstLine: { magnitude: 0, unit: "PT" },
          spaceAbove: { magnitude: t.isHeading ? 12 : 0, unit: "PT" },
          spaceBelow: { magnitude: 6, unit: "PT" },
          lineSpacing: 115,
        },
        fields: "indentStart,indentFirstLine,spaceAbove,spaceBelow,lineSpacing",
      },
    });
  }

  if (indentReqs.length > 0) {
    console.log(`📝 Applying ${indentReqs.length} indentation styles`);
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: indentReqs },
    });
  }
}

// ── Main Export Function ──

/**
 * Export the report to Google Docs.
 *
 * PIPELINE:
 *   1. Auth
 *   2. Create blank document
 *   3. Parse markdown into blocks
 *   4. Phase 1: Insert all content as one insertText
 *   5. Phase 2: Read document to detect actual paragraph structure
 *   6. Phase 3a: Apply heading styles (namedStyleType only)
 *   7. Phase 3b: Apply indentation separately (to prevent heading defaults override)
 *   8. Return document URL
 *
 * TOTAL API CALLS: 4 (create + 1 insert read + 1 insert + 1 detect read + 1 heading + 1 indent = 5)
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

  // Step 3: Parse markdown into blocks
  onProgress?.({ message: "Memproses konten...", progress: 10 });

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

  // Phase 1: Insert all content
  onProgress?.({ message: "Menulis konten...", progress: 20 });

  await insertContent(docs, documentId, blocks);

  // Phase 2: Read document and detect paragraphs
  onProgress?.({ message: "Menganalisis struktur...", progress: 40 });

  const targets = await readAndDetectParagraphs(docs, documentId);

  if (targets.length === 0) {
    throw new Error("No paragraphs detected in document after content insertion.");
  }

  // Phase 3: Apply styles
  onProgress?.({ message: "Menerapkan gaya heading...", progress: 60 });

  await applyAllStyles(docs, documentId, targets);

  onProgress?.({ message: "Selesai.", progress: 100 });

  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
  console.log(`✅ Google Docs export complete: ${documentUrl}`);

  return { documentId, documentUrl };
}
