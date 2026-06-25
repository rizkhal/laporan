import type { ReportStrategy, ReportResult } from "./index";
import { generateReport, type ReportMode } from "../report-formatter";

// ── Office Report Strategy ──
// Formal government / enterprise monthly report format.
// Delegates to the existing report-formatter.ts generator.

export const officeStrategy: ReportStrategy = {
  id: "office",
  name: "Office Report",
  description:
    "Formal government / enterprise monthly report. Cover, Kata Pengantar, Daftar Isi, sections by category, Kesimpulan, and comprehensive appendices (A–F). 15–80+ pages depending on mode.",

  async generate(
    collectionId: number,
    workspaceId: number,
  ): Promise<ReportResult> {
    const content = await generateReport(collectionId, workspaceId, "audit");

    const estimatedPages = Math.max(
      1,
      Math.round(content.split("\n").length / 45),
    );

    return { content, estimatedPages, style: "office" };
  },
};
