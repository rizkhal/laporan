import { loadReportData } from "./data-loader";
import { getTemplate, getDefaultTemplate } from "./templates";
import { gatherSections, generateKataPengantar, generateDaftarIsi, renderSections, generateKesimpulan } from "./sections";
import { generateLampiranA } from "./lampiran-a";
import { generateLampiranB } from "./lampiran-b";
import { generateLampiranC } from "./lampiran-c";
import { generateLampiranD } from "./lampiran-d";
import { generateLampiranE } from "./lampiran-e";
import { generateLampiranF } from "./lampiran-f";
import { generateLampiranGitDiff } from "./lampiran-g";
import { APPENDIX_MODES, ROMAN } from "./constants";
import type { ReportMode } from "./types";

export type { ReportMode } from "./types";

// ── Assemble Appendices ──

function assembleAppendices(
  mode: ReportMode,
  data: {
    allCommits: import("./types").CommitRow[];
    allRepos: { id: number; name: string }[];
    repoAnalyses: import("./types").RepoAnalysisData[];
  },
): string {
  const letters = APPENDIX_MODES[mode];
  const parts: string[] = [];

  const generators: Record<string, () => string> = {
    A: () => generateLampiranA(data.allCommits, data.allRepos, mode),
    B: () => generateLampiranB(data.allCommits, data.allRepos, data.repoAnalyses),
    C: () => generateLampiranC(data.allCommits, data.allRepos, data.repoAnalyses),
    D: () => generateLampiranD(data.allCommits, data.allRepos, data.repoAnalyses),
    E: () => generateLampiranE(data.repoAnalyses, data.allCommits),
    F: () => generateLampiranF(data.repoAnalyses, data.allCommits, data.allRepos),
    G: () => generateLampiranGitDiff(data.allCommits, data.allRepos),
  };

  for (const letter of letters) {
    const gen = generators[letter];
    if (gen) {
      const content = gen();
      parts.push(content);
      parts.push("");
      if (letter !== letters[letters.length - 1]) {
        parts.push("---");
        parts.push("");
      }
    }
  }

  return parts.join("\n").trim();
}

// ════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════════════════

export async function generateReport(
  collectionId: number,
  workspaceId?: number,
  mode: ReportMode = "standar",
): Promise<string> {
  const data = loadReportData(collectionId, workspaceId || 0);

  const sections = gatherSections(data.repoAnalyses, data.allCommits);
  const kataPengantar = generateKataPengantar(data.period, data.repoAnalyses, mode, sections);
  const daftarIsi = generateDaftarIsi(sections, mode);
  const renderedSections = renderSections(sections);
  const kesimpulan = generateKesimpulan(data.period, data.repoAnalyses, sections);
  const lampiran = assembleAppendices(mode, data);

  const template = getTemplate(data.wsId);
  const hasOfficePlaceholders =
    template.includes("{{kataPengantar}}") ||
    template.includes("{{sections}}") ||
    template.includes("{{kesimpulan}}") ||
    template.includes("{{lampiran}}") ||
    template.includes("{{daftarIsi}}");

  // Count pages for the mode label
  const fullContent = `${kataPengantar}\n${daftarIsi}\n${renderedSections}\n${kesimpulan}\n${lampiran}`;
  const estimatedLines = fullContent.split("\n").length;
  const estimatedPages = Math.max(1, Math.round(estimatedLines / 45));

  const sectionCount = sections.length;

  if (hasOfficePlaceholders || template === getDefaultTemplate()) {
    let result = template
      .replace(/\{\{period\}\}/g, data.period)
      .replace(/\{\{generatedDate\}\}/g, data.generatedDate)
      .replace(/\{\{kataPengantar\}\}/g, kataPengantar)
      .replace(/\{\{daftarIsi\}\}/g, daftarIsi)
      .replace(/\{\{sections\}\}/g, renderedSections)
      .replace(/\{\{kesimpulan\}\}/g, kesimpulan)
      .replace(/\{\{lampiran\}\}/g, lampiran);

    // Add Roman numeral prefixes to static headings
    result = result.replace("## KESIMPULAN", `## ${ROMAN[sectionCount] || "IV"}. KESIMPULAN`);
    result = result.replace("## LAMPIRAN", `## ${ROMAN[sectionCount + 1] || "V"}. LAMPIRAN`);

    return result;
  }

  // Fallback for old-style templates
  const totalChanges = data.totalInsertions + data.totalDeletions;

  const execSummary = [
    `Selama **${data.period}**, tim melakukan **${data.totalCommits} commit** di **${data.totalRepos} repositori**, mengubah **${data.totalFilesChanged} berkas** dengan **${data.totalInsertions.toLocaleString()} baris ditambahkan** dan **${data.totalDeletions.toLocaleString()} baris dihapus** (total **${totalChanges.toLocaleString()} perubahan**).`,
    ...data.repoAnalyses.map(r => r.summary || `Belum ada analisis tersedia untuk ${r.repoName}.`),
  ].join("\n\n");

  return template
    .replace(/\{\{period\}\}/g, data.period)
    .replace(/\{\{generatedDate\}\}/g, data.generatedDate)
    .replace(/\{\{executiveSummary\}\}/g, execSummary)
    .replace(/\{\{sections\}\}/g, renderedSections)
    .replace(/\{\{kataPengantar\}\}/g, kataPengantar)
    .replace(/\{\{kesimpulan\}\}/g, kesimpulan)
    .replace(/\{\{lampiran\}\}/g, lampiran)
    .replace(/\{\{daftarIsi\}\}/g, daftarIsi)
    .replace(/\{\{repoBreakdown\}\}/g, "")
    .replace(/\{\{workItemsSummary\}\}/g, "")
    .replace(/\{\{risks\}\}/g, "")
    .replace(/\{\{nextSteps\}\}/g, "");
}
