/**
 * DOCX Export Service
 *
 * Converts Markdown reports to .docx using markdown-docx.
 *
 * Heading hierarchy is rendered with proper built-in Word heading styles
 * (Heading 1–6) so that Insert → Table of Contents works automatically.
 * Paragraph indent is applied as **direct formatting** (not style override)
 * so the visual hierarchy is clear while TOC compatibility is preserved.
 *
 *   H1  → Heading 1, indent 0
 *   H2  → Heading 2, indent 0
 *   H3  → Heading 3, indent 240 twips
 *   H4  → Heading 4, indent 480 twips
 *   body → inherits indent from nearest heading + 240 twips
 *
 * Markdown remains the canonical source of truth — this module only
 * provides an export derivation, never modifies stored content.
 */

import { MarkdownDocx, Packer } from "markdown-docx";
import { Paragraph, HeadingLevel, createIndent } from "docx";

// ── Heading indent map (in twips; 1 inch = 1440 twips) ──

const HEADING_INDENT: Record<number, { left: number }> = {
  1: { left: 0 },
  2: { left: 0 },
  3: { left: 240 },
  4: { left: 480 },
  5: { left: 720 },
  6: { left: 960 },
};

// Body indent = one level deeper than the heading it follows
const BODY_INDENT: Record<number, { left: number }> = {
  1: { left: 240 },
  2: { left: 480 },
  3: { left: 720 },
  4: { left: 960 },
  5: { left: 1200 },
  6: { left: 1440 },
};

const HEADING_LEVEL_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

// ── Default DOCX document properties ──

const DOCUMENT_PROPS = {
  creator: "Laporan",
  title: "Laporan Kemajuan Pekerjaan",
};

// ── Markdown normalization (lightweight, for export only) ──

function normalizeMarkdown(md: string): string {
  return (
    md
      // Remove duplicate empty lines (3+ → 2)
      .replace(/\n{4,}/g, "\n\n\n")
      // Remove all thematic breaks (---)
      .replace(/^-{3,}\s*$/gm, "")
      // Trim trailing whitespace per line
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trim()
  );
}

// ── Main entry: Markdown → DOCX buffer ──

export async function generateReportDocx(
  markdown: string,
): Promise<Buffer> {
  // 1. Normalize
  const normalizedMd = normalizeMarkdown(markdown);

  // 2. Create renderer
  const render = new MarkdownDocx(normalizedMd, {
    gfm: true,
    ignoreImage: true,
  });

  // 3. Override toBlocks to:
  //    a. Intercept heading tokens → Paragraph with built-in HeadingLevel +
  //       heading indent (NO custom MdHeadingX style, so only ONE <w:pStyle>
  //       element is emitted → proper TOC compatibility)
  //    b. Group non-heading tokens into body segments, each inheriting indent
  //       from the most recent heading level.
  //    c. Render each body segment as a batch (list numbering state preserved)
  //       and then apply body indent via createIndent() directly on each
  //       Paragraph's properties.
  //
  const originalToBlocks = MarkdownDocx.prototype.toBlocks.bind(render);

  render.toBlocks = function interceptedToBlocks(
    tokens: any[],
    attr: any = {},
  ): any[] {
    // ── Segment: heading + its following body content ──
    // Each segment has { headingLevel, bodyTokens: [...] }
    // Segments before any heading get level=1 (no indent)
    const segments: { level: number; headingBlock: any | null; bodyTokens: any[] }[] = [];
    let currentLevel = 1;
    let currentBody: any[] = [];

    for (const block of tokens) {
      if (block.type === "heading") {
        // Flush accumulated body into a segment
        if (currentBody.length > 0) {
          segments.push({ level: currentLevel, headingBlock: null, bodyTokens: currentBody });
          currentBody = [];
        }
        // Push heading as its own segment
        segments.push({ level: block.depth, headingBlock: block, bodyTokens: [] });
        currentLevel = block.depth;
      } else {
        currentBody.push(block);
      }
    }
    // Flush trailing body
    if (currentBody.length > 0) {
      segments.push({ level: currentLevel, headingBlock: null, bodyTokens: currentBody });
    }

    // ── Render each segment ──
    const result: any[] = [];

    for (const seg of segments) {
      if (seg.headingBlock) {
        // ── Heading ──
        const block = seg.headingBlock;
        const depth = block.depth;
        const headingLevel = HEADING_LEVEL_MAP[depth] || HeadingLevel.HEADING_6;
        const indent = HEADING_INDENT[depth] || HEADING_INDENT[6];
        const children = (this as any).toTexts(block.tokens, {});

        result.push(
          new Paragraph({
            children,
            heading: headingLevel,
            indent,
            spacing: {
              before: depth === 1 ? 480 : 320,
              after: depth === 1 ? 240 : 160,
            },
          }),
        );
      }

      // ── Body content after heading ──
      if (seg.bodyTokens.length > 0) {
        const bodyIndent = BODY_INDENT[seg.level] || BODY_INDENT[6];
        const bodyItems = originalToBlocks(seg.bodyTokens, attr);

        // Apply body indent to each rendered item
        for (const item of bodyItems) {
          if (item instanceof Paragraph) {
            // properties is declared `private` in docx TS types but is a
            // regular property at runtime (no # prefix in source).
            // Access via cast to bypass compile-time check.
            (item as any).properties.push(createIndent(bodyIndent));
          }
          result.push(item);
        }
      }
    }

    return result;
  };

  // 4. Convert → buffer
  const doc = await render.toDocument({
    creator: DOCUMENT_PROPS.creator,
    title: DOCUMENT_PROPS.title,
  });
  const buffer = await Packer.toBuffer(doc);

  return Buffer.from(buffer);
}
