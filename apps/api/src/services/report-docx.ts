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
 *   H2  → Heading 2, indent 720 twips (0.5")
 *   H3  → Heading 3, indent 1440 twips (1.0")
 *   H4+ → Heading 4, indent 2160 twips (1.5")
 *
 * Markdown remains the canonical source of truth — this module only
 * provides an export derivation, never modifies stored content.
 */

import { MarkdownDocx, Packer } from "markdown-docx";
import { Paragraph, HeadingLevel } from "docx";

// ── Heading indent map (in twips; 1 inch = 1440 twips) ──

const HEADING_INDENT: Record<number, { left: number }> = {
  1: { left: 0 },
  2: { left: 0 },
  3: { left: 240 },
  4: { left: 480 },
  5: { left: 720 },
  6: { left: 960 },
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

  // 3. Override toBlocks to intercept heading tokens.
  //
  //    markdown-docx's renderBlocks handles "heading" in an explicit switch
  //    BEFORE reaching useBlockRender, so addBlockRender("heading", …)
  //    never fires.  Instead we intercept at the toBlocks level:
  //
  //    • Heading tokens → Paragraph with built-in HeadingLevel + direct indent
  //      (NO custom MdHeadingX style, so only ONE <w:pStyle> element is emitted)
  //    • Non-heading tokens → batched and delegated to original toBlocks in a
  //      SINGLE call so list numbering state remains correct across siblings
  //
  const originalToBlocks = MarkdownDocx.prototype.toBlocks.bind(render);

  render.toBlocks = function interceptedToBlocks(
    tokens: any[],
    attr: any = {},
  ): any[] {
    // First pass: split into heading vs non-heading groups while
    // preserving document order via positional metadata.
    const headingIndices: number[] = [];
    const headingBlocks: any[] = [];
    const nonHeadingBlockIndices: number[] = [];
    const nonHeadingBlocks: any[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const block = tokens[i];
      if (block.type === "heading") {
        headingIndices.push(i);
        headingBlocks.push(block);
      } else {
        nonHeadingBlockIndices.push(i);
        nonHeadingBlocks.push(block);
      }
    }

    // Render all non-heading blocks in a SINGLE batch so list state is correct
    const nonHeadingResult = nonHeadingBlocks.length > 0
      ? originalToBlocks(nonHeadingBlocks, attr)
      : [];

    // Render heading blocks individually
    const headingResult = headingBlocks.map((block) => {
      const depth = block.depth; // 1–6
      const headingLevel = HEADING_LEVEL_MAP[depth] || HeadingLevel.HEADING_6;
      const indent = HEADING_INDENT[depth] || HEADING_INDENT[6];

      // Render inline tokens (bold, italic, code, etc.)
      const children = (this as any).toTexts(block.tokens, {});

      return new Paragraph({
        children,
        heading: headingLevel,
        indent,
        spacing: {
          before: depth === 1 ? 480 : 320,
          after: depth === 1 ? 240 : 160,
        },
      });
    });

    // Interleave results back in original document order
    const result: any[] = [];
    let hi = 0;
    let ni = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (hi < headingIndices.length && headingIndices[hi] === i) {
        result.push(headingResult[hi]);
        hi++;
      } else if (ni < nonHeadingBlockIndices.length && nonHeadingBlockIndices[ni] === i) {
        result.push(nonHeadingResult[ni]);
        ni++;
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
