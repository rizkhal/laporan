import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

// ── Types ──

export type ReportMode = "ringkas" | "standar" | "lengkap" | "audit";

// ── Configurable Section Mapping ──

const SECTION_MAP: Record<string, string> = {
  feature: "PENGEMBANGAN SISTEM",
  bugfix: "PERBAIKAN DAN PENYEMPURNAAN",
  refactor: "PERBAIKAN DAN PENYEMPURNAAN",
  performance: "PERBAIKAN DAN PENYEMPURNAAN",
  dependency: "INFRASTRUKTUR DAN DEPLOYMENT",
  infrastructure: "INFRASTRUKTUR DAN DEPLOYMENT",
  documentation: "PERBAIKAN DAN PENYEMPURNAAN",
  testing: "PERBAIKAN DAN PENYEMPURNAAN",
  other: "PENGEMBANGAN SISTEM",
};

const SECTION_ORDER = [
  "PENGEMBANGAN SISTEM",
  "PERBAIKAN DAN PENYEMPURNAAN",
  "INFRASTRUKTUR DAN DEPLOYMENT",
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// ── Mode → Appendix mapping ──

const APPENDIX_MODES: Record<ReportMode, string[]> = {
  ringkas:  ["A"],
  standar:  ["A", "B", "F"],
  lengkap:  ["A", "B", "C", "D", "F"],
  audit:    ["A", "B", "C", "D", "E", "F"],
};

// ── Interfaces ──

interface WorkItemData {
  judul: string;
  deskripsi: string;
  kategori: string;
  dampak: string;
  bukti: { hashCommit: string; berkas: string }[];
  keyakinan: string;
  [key: string]: any;
}

interface RepoAnalysisData {
  repoName: string;
  repoId: number;
  totalCommits: number;
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
  summary: string;
  impact: string;
  risks: string;
  nextSuggestions: string;
  workItems: WorkItemData[];
  hasAnalysis: boolean;
}

interface CommitRow {
  id: number;
  collectionId: number;
  repoId: number;
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffStat: string;
  patchSnippets: string;
  changedFiles: string;
  createdAt: string;
}

interface SectionData {
  name: string;
  repos: {
    repoName: string;
    workItems: WorkItemData[];
    summary: string;
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
  }[];
}

// ── Helpers ──

function getDefaultTemplate(): string {
  return `# **LAPORAN KEMAJUAN PEKERJAAN**

**Periode:** {{period}}
**Tanggal:** {{generatedDate}}

---

## KATA PENGANTAR

{{kataPengantar}}

---

## DAFTAR ISI

<!-- GOOGLE_DOCS_TOC -->

{{daftarIsi}}

---

{{sections}}

---

## KESIMPULAN

{{kesimpulan}}

---

## LAMPIRAN

{{lampiran}}

---

*Laporan ini dibuat secara otomatis berdasarkan data commit dan analisis AI dari repositori yang terkonfigurasi.*
`;
}

export function getTemplate(workspaceId: number): string {
  const template = db
    .select()
    .from(schema.reportTemplates)
    .where(and(eq(schema.reportTemplates.workspaceId, workspaceId), eq(schema.reportTemplates.isDefault, true)))
    .get();
  return template?.content || getDefaultTemplate();
}

function getIndonesianMonth(month: number): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return months[month - 1] || "Unknown";
}

function getCategoryLabel(kategori: string): string {
  const labels: Record<string, string> = {
    feature: "Fitur Baru",
    bugfix: "Perbaikan Bug",
    refactor: "Perbaikan & Penyempurnaan",
    performance: "Optimasi Kinerja",
    dependency: "Dependency & Infrastruktur",
    infrastructure: "Infrastruktur & Deployment",
    documentation: "Dokumentasi",
    testing: "Pengujian",
    other: "Lainnya",
  };
  return labels[kategori] || kategori;
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getDirectory(filePath: string): string {
  const parts = filePath.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
}

// ── Data Loading Helper ──

function loadReportData(collectionId: number, workspaceId: number) {
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, collectionId)).get();
  if (!collection) throw new Error("Collection not found");

  const wsId = workspaceId || collection.workspaceId;

  const analyses = db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.collectionId, collectionId))
    .all();

  const allRepos = db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.workspaceId, wsId))
    .all();

  const allCommits = db
    .select()
    .from(schema.commits)
    .where(eq(schema.commits.collectionId, collectionId))
    .orderBy(schema.commits.date)
    .all() as CommitRow[];

  const year = collection.year;
  const month = collection.month;
  const period = `${getIndonesianMonth(month)} ${year}`;
  const generatedDate = new Date().toLocaleDateString("id-ID", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Build per-repo analysis data
  const repoAnalyses: RepoAnalysisData[] = [];

  for (const analysis of analyses) {
    const repo = allRepos.find(r => r.id === analysis.repoId);
    if (!repo) continue;

    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    const totalCommits = repoCommits.length;
    const totalFilesChanged = repoCommits.reduce((s, c) => s + c.filesChanged, 0);
    const totalInsertions = repoCommits.reduce((s, c) => s + c.insertions, 0);
    const totalDeletions = repoCommits.reduce((s, c) => s + c.deletions, 0);

    let workItems: WorkItemData[] = [];
    let summary = "";
    let impact = "";
    let risks = "";
    let nextSuggestions = "";
    let hasAnalysis = false;

    if (analysis.status === "completed") {
      hasAnalysis = true;
      try { workItems = JSON.parse(analysis.workItems || "[]"); } catch {}
      summary = analysis.summary || "";
      impact = analysis.impact || "";
      risks = analysis.risks || "";
      nextSuggestions = analysis.nextSuggestions || "";
    }

    repoAnalyses.push({
      repoName: repo.name,
      repoId: repo.id,
      totalCommits,
      totalFilesChanged,
      totalInsertions,
      totalDeletions,
      summary, impact, risks, nextSuggestions,
      workItems, hasAnalysis,
    });
  }

  repoAnalyses.sort((a, b) => a.repoName.localeCompare(b.repoName));

  return { collection, wsId, analyses, allRepos, allCommits, year, month, period, generatedDate, repoAnalyses };
}

// ════════════════════════════════════════════════════════════════
// FALLBACK TOPIC BUILDER (when workItems is empty)
// ════════════════════════════════════════════════════════════════

/**
 * Infer commit category from message and changed files.
 * Returns one of: feature, bugfix, refactor, performance, dependency, infrastructure, documentation, testing, other
 */
function inferCategoryFromCommit(commit: CommitRow): string {
  const msg = commit.message.toLowerCase();
  const files = (() => { try { return JSON.parse(commit.changedFiles || "[]"); } catch { return []; } })() as string[];

  // Check commit message conventions
  if (/^feat/.test(msg) || /^add/.test(msg) || /^implement/.test(msg) || /^create/.test(msg) || /new/.test(msg)) return "feature";
  if (/^fix/.test(msg) || /^bugfix/.test(msg) || /^hotfix/.test(msg) || /^resolve/.test(msg)) return "bugfix";
  if (/^refactor/.test(msg) || /^improve/.test(msg) || /^clean/.test(msg) || /^rework/.test(msg)) return "refactor";
  if (/^perf/.test(msg) || /^optimize/.test(msg) || /^speed/.test(msg)) return "performance";
  if (/^chore/.test(msg) || /^deps?/.test(msg) || /^package/.test(msg) || /^config/.test(msg)) return "dependency";
  if (/^docs/.test(msg) || /^readme/.test(msg) || /^comment/.test(msg)) return "documentation";
  if (/^test/.test(msg) || /^spec/.test(msg)) return "testing";
  if (/^ci/.test(msg) || /^deploy/.test(msg) || /^build/.test(msg) || /^release/.test(msg) || /^env/.test(msg) || /^server/.test(msg)) return "infrastructure";

  // Check file paths for infrastructure hints
  if (files.length > 0) {
    const allPaths = files.join(" ");
    if (/package\.json|tsconfig|vite\.config|webpack|\.gitlab|\.github|Dockerfile|docker-compose|nginx|README\.md/i.test(allPaths)) return "dependency";
    if (/\.(spec|test)\./i.test(allPaths)) return "testing";
    // Component/dashboard/chart paths → feature
    if (/(components|dashboard|chart|visualization|panel|table|ui|layout|page)/i.test(allPaths)) return "feature";
    // Services/query/api paths → feature
    if (/(services|query|api|hooks|store|state|mutation)/i.test(allPaths)) return "feature";
  }

  // Check message for keywords
  if (/wording|label|text|tooltip|placeholder|display|tampilan|ui|ux/i.test(msg)) return "bugfix";
  if (/perbaiki|fix|correct|atasi|resolve|issue|bug|error/i.test(msg)) return "bugfix";
  if (/update|upgrade|bump|upgrade/i.test(msg)) return "dependency";

  return "other";
}

/**
 * Extract a topic name from commit messages grouped by common file paths.
 */
function inferTopicFromCommits(commits: CommitRow[], files: string[]): string {
  // Try to find the most descriptive common topic
  const messages = commits.map(c => c.message);

  // Check if messages share a common prefix (e.g., "feat: dashboard export" + "fix: dashboard export")
  const allWords = messages.flatMap(m => m.split(/[\s:,-]+/).filter((w: string) => w.length > 2));
  const wordFreq = new Map<string, number>();
  for (const w of allWords) {
    const lower = w.toLowerCase();
    if (["feat", "fix", "add", "the", "and", "for", "with", "from", "this", "that"].includes(lower)) continue;
    wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
  }
  const sorted = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]);
  const commonWords = sorted.slice(0, 3).map(([w]) => w);

  // Also look at directory structure to infer feature name
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split("/");
    // Look for meaningful directory names 2-3 levels deep
    if (parts.length >= 3) {
      dirs.add(parts.slice(0, 3).join("/"));
    } else if (parts.length >= 2) {
      dirs.add(parts.slice(0, 2).join("/"));
    }
  }

  // Extract a clean feature name from common words
  // Remove common prefixes like "feat:", "fix:"
  const cleanWords = commonWords.filter((w: string) => !["feat", "fix", "chore", "docs", "refactor", "perf", "test"].includes(w));

  if (cleanWords.length >= 2) {
    // Capitalize first letter of each word
    return cleanWords.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // Fall back to first commit message (cleaned)
  const first = messages[0] || "";
  const cleaned = first.replace(/^(feat|fix|chore|docs|refactor|perf|test|ci|build|revert)\([^)]*\)?:\s*/i, "")
    .replace(/^(feat|fix|chore|docs|refactor|perf|test|ci|build|revert):\s*/i, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Generate a formal Indonesian description for a fallback work item.
 */
function generateFallbackDescription(commits: CommitRow[], files: string[], category: string): string {
  const msgList = commits.map(c => `- ${c.message}`).join("\n");
  const fileList = files.slice(0, 10).map(f => `  - \`${f}\``).join("\n");
  const totalChanges = commits.reduce((s, c) => s + c.insertions + c.deletions, 0);
  const totalFiles = new Set(files).size;

  let description = "";

  if (category === "feature") {
    description = `**Latar Belakang**\n\nPengembangan ini dilakukan untuk menambah fungsionalitas baru pada sistem berdasarkan kebutuhan yang telah diidentifikasi.\n\n**Pekerjaan yang Dilaksanakan**\n\nBerikut adalah perubahan yang dilakukan pada periode ini:\n\n${msgList}\n\n**Berkas yang Terpengaruh**\n\n${fileList}\n\n**Hasil yang Dicapai**\n\nTotal **${totalChanges} baris perubahan** pada **${totalFiles} berkas** telah diselesaikan pada item pekerjaan ini.`;
  } else if (category === "bugfix" || category === "refactor") {
    description = `**Latar Belakang**\n\nPerbaikan dan penyempurnaan dilakukan untuk meningkatkan kualitas sistem serta mengatasi kendala yang teridentifikasi.\n\n**Pekerjaan yang Dilaksanakan**\n\nPerubahan yang dilakukan meliputi:\n\n${msgList}\n\n**Berkas yang Terpengaruh**\n\n${fileList}\n\n**Hasil yang Dicapai**\n\nSebanyak **${totalChanges} baris perubahan** pada **${totalFiles} berkas** telah diselesaikan dalam rangka perbaikan dan penyempurnaan sistem.`;
  } else if (category === "dependency" || category === "infrastructure" || category === "documentation") {
    description = `**Latar Belakang**\n\nPembaruan infrastruktur, dependency, dan dokumentasi dilakukan untuk menjaga stabilitas dan keamanan sistem.\n\n**Pekerjaan yang Dilaksanakan**\n\nAktivitas yang dilakukan meliputi:\n\n${msgList}\n\n**Berkas yang Terpengaruh**\n\n${fileList}\n\n**Hasil yang Dicapai**\n\nSebanyak **${totalChanges} baris perubahan** pada **${totalFiles} berkas** telah diselesaikan.`;
  } else {
    description = `**Latar Belakang**\n\nAktivitas pengembangan dilakukan berdasarkan kebutuhan pengembangan sistem.\n\n**Pekerjaan yang Dilaksanakan**\n\nPerubahan yang dilakukan meliputi:\n\n${msgList}\n\n**Berkas yang Terpengaruh**\n\n${fileList}\n\n**Hasil yang Dicapai**\n\nSebanyak **${totalChanges} baris perubahan** pada **${totalFiles} berkas** telah diselesaikan.`;
  }

  return description;
}

/**
 * Build fallback work items from commits, changed files, and diff stats
 * when LLM analysis workItems is empty.
 */
function buildFallbackWorkItems(
  repoCommits: CommitRow[],
): WorkItemData[] {
  if (repoCommits.length === 0) return [];

  // Get all changed files across all commits
  const allFiles = new Set<string>();
  for (const c of repoCommits) {
    try {
      const files = JSON.parse(c.changedFiles || "[]");
      for (const f of files) allFiles.add(f);
    } catch {}
  }

  const filesArray = [...allFiles];

  // Group commits by similarity in message and file paths
  // For simplicity, create one work item per unique commit message prefix (feat/fix/chore etc)
  // Or group by directory pattern

  const groups = new Map<string, CommitRow[]>();
  const groupFiles = new Map<string, Set<string>>();

  for (const c of repoCommits) {
    const category = inferCategoryFromCommit(c);
    if (!groups.has(category)) {
      groups.set(category, []);
      groupFiles.set(category, new Set());
    }
    groups.get(category)!.push(c);
    try {
      const files = JSON.parse(c.changedFiles || "[]");
      for (const f of files) groupFiles.get(category)!.add(f);
    } catch {}
  }

  // For categories with many commits, try to sub-group by topic
  const workItems: WorkItemData[] = [];

  for (const [category, commits] of groups) {
    const files = [...(groupFiles.get(category) || new Set())];

    if (commits.length <= 3) {
      // Small group → one work item
      const topic = inferTopicFromCommits(commits, files);
      const evidence = commits.map(c => ({
        hashCommit: c.hash,
        berkas: (() => { try { return JSON.parse(c.changedFiles || "[]"); } catch { return []; } })().join(", "),
      }));

      workItems.push({
        judul: topic,
        deskripsi: generateFallbackDescription(commits, files, category),
        kategori: category,
        dampak: "sedang",
        bukti: evidence,
        keyakinan: "sedang",
      });
    } else {
      // Large group → try to sub-group further by directory or message similarity
      // Simple approach: split into smaller groups by first meaningful word
      const subGroups = new Map<string, { commits: CommitRow[]; files: Set<string> }>();

      for (const c of commits) {
        const cleanMsg = c.message
          .replace(/^(feat|fix|chore|docs|refactor|perf|test|ci|build|revert)\([^)]*\)?:\s*/i, "")
          .replace(/^(feat|fix|chore|docs|refactor|perf|test|ci|build|revert):\s*/i, "");
        const firstWord = cleanMsg.split(/[\s:-]+/).find((w: string) => w.length > 2) || "pengembangan";

        if (!subGroups.has(firstWord.toLowerCase())) {
          subGroups.set(firstWord.toLowerCase(), { commits: [], files: new Set() });
        }
        subGroups.get(firstWord.toLowerCase())!.commits.push(c);
        try {
          const cf = JSON.parse(c.changedFiles || "[]");
          for (const f of cf) subGroups.get(firstWord.toLowerCase())!.files.add(f);
        } catch {}
      }

      for (const [, group] of subGroups) {
        if (group.commits.length === 0) continue;
        const topic = inferTopicFromCommits(group.commits, [...group.files]);
        const evidence = group.commits.map(c => ({
          hashCommit: c.hash,
          berkas: (() => { try { return JSON.parse(c.changedFiles || "[]"); } catch { return []; } })().join(", "),
        }));

        workItems.push({
          judul: topic,
          deskripsi: generateFallbackDescription(group.commits, [...group.files], category),
          kategori: category,
          dampak: "sedang",
          bukti: evidence,
          keyakinan: "sedang",
        });
      }
    }
  }

  // If no work items were generated but commits exist, create a generic one
  if (workItems.length === 0 && repoCommits.length > 0) {
    const topic = inferTopicFromCommits(repoCommits, filesArray);
    const evidence = repoCommits.map(c => ({
      hashCommit: c.hash,
      berkas: (() => { try { return JSON.parse(c.changedFiles || "[]"); } catch { return []; } })().join(", "),
    }));

    workItems.push({
      judul: topic,
      deskripsi: generateFallbackDescription(repoCommits, filesArray, "other"),
      kategori: "other",
      dampak: "sedang",
      bukti: evidence,
      keyakinan: "sedang",
    });
  }

  return workItems;
}

// ── Section Gathering ──

function gatherSections(repoAnalyses: RepoAnalysisData[], allCommits?: CommitRow[]): SectionData[] {
  const sectionMap = new Map<string, Map<string, WorkItemData[]>>();
  const repoMeta = new Map<string, { summary: string; totalCommits: number; totalInsertions: number; totalDeletions: number }>();

  for (const repo of repoAnalyses) {
    repoMeta.set(repo.repoName, {
      summary: repo.summary,
      totalCommits: repo.totalCommits,
      totalInsertions: repo.totalInsertions,
      totalDeletions: repo.totalDeletions,
    });

    // If workItems is empty but we have commits, build fallback work items
    let workItems = repo.workItems;
    if (workItems.length === 0 && allCommits && repo.totalCommits > 0) {
      const repoCommits = allCommits.filter(c => c.repoId === repo.repoId);
      if (repoCommits.length > 0) {
        workItems = buildFallbackWorkItems(repoCommits);
      }
    }

    for (const item of workItems) {
      const kategori = (item.kategori || "other").toLowerCase();
      const sectionName = SECTION_MAP[kategori] || "PENGEMBANGAN SISTEM";

      if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, new Map());
      const repoMap = sectionMap.get(sectionName)!;
      if (!repoMap.has(repo.repoName)) repoMap.set(repo.repoName, []);
      repoMap.get(repo.repoName)!.push(item);
    }
  }

  const sections: SectionData[] = [];
  const usedSections = new Set(sectionMap.keys());

  for (const sectionName of SECTION_ORDER) {
    if (!usedSections.has(sectionName)) continue;
    const repoMap = sectionMap.get(sectionName)!;
    const repos: SectionData["repos"] = [];

    for (const [repoName, workItems] of repoMap) {
      const meta = repoMeta.get(repoName);
      repos.push({
        repoName, workItems,
        summary: meta?.summary || "",
        totalCommits: meta?.totalCommits || 0,
        totalInsertions: meta?.totalInsertions || 0,
        totalDeletions: meta?.totalDeletions || 0,
      });
    }
    repos.sort((a, b) => a.repoName.localeCompare(b.repoName));
    sections.push({ name: sectionName, repos });
  }

  return sections;
}

// ── Build WorkItem → Commit cross-reference ──

interface WorkItemCommitRef {
  workItem: WorkItemData;
  repoName: string;
  commits: CommitRow[];
}

function buildWorkItemCommitMap(
  repoAnalyses: RepoAnalysisData[],
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
): WorkItemCommitRef[] {
  const result: WorkItemCommitRef[] = [];

  for (const repo of repoAnalyses) {
    if (!repo.hasAnalysis) continue;
    const repoCommits = allCommits.filter(c => c.repoId === repo.repoId);

    for (const item of repo.workItems) {
      const bukti = item.bukti || [];
      const matchingCommits: CommitRow[] = [];

      if (bukti.length > 0) {
        const evidenceHashes = new Set(bukti.map(b => (b.hashCommit || "").toLowerCase()));
        for (const c of repoCommits) {
          if (evidenceHashes.has(c.hash.toLowerCase())) {
            matchingCommits.push(c);
          }
        }
      }

      // If no evidence match, include all repo commits (fallback)
      if (matchingCommits.length === 0) {
        result.push({ workItem: item, repoName: repo.repoName, commits: repoCommits });
      } else {
        result.push({ workItem: item, repoName: repo.repoName, commits: matchingCommits });
      }
    }
  }

  return result;
}

// ── Kata Pengantar Generator ──

function generateKataPengantar(
  period: string,
  repoAnalyses: RepoAnalysisData[],
  mode: ReportMode,
  sections?: SectionData[],
): string {
  const totalRepos = repoAnalyses.length;
  const totalCommits = repoAnalyses.reduce((s, r) => s + r.totalCommits, 0);
  const totalIns = repoAnalyses.reduce((s, r) => s + r.totalInsertions, 0);
  const totalDel = repoAnalyses.reduce((s, r) => s + r.totalDeletions, 0);
  const totalChanges = totalIns + totalDel;
  const repoList = repoAnalyses.map(r => r.repoName).join(", ");
  // Count work items from sections (which may include fallback items) rather than raw repoAnalyses
  const totalWorkItems = sections
    ? sections.reduce((s, sec) => s + sec.repos.reduce((sr, r) => sr + r.workItems.length, 0), 0)
    : repoAnalyses.reduce((s, r) => s + r.workItems.length, 0);

  let modeDesc = "";
  if (mode === "ringkas") modeDesc = "Secara ringkas, laporan ini menyajikan gambaran umum aktivitas pengembangan.";
  else if (mode === "standar") modeDesc = "Laporan ini menyajikan gambaran aktivitas pengembangan yang dilengkapi dengan rincian commit dan ringkasan repositori.";
  else if (mode === "lengkap") modeDesc = "Laporan ini menyajikan analisis pengembangan secara lengkap termasuk statistik perubahan, rincian berkas, dan aktivitas per periode.";
  else if (mode === "audit") modeDesc = "Laporan ini disusun dalam mode audit yang menyajikan seluruh data pengembangan secara menyeluruh termasuk pemetaan bukti untuk setiap item pekerjaan.";

  return [
    `Dengan ini kami sampaikan Laporan Kemajuan Pekerjaan Pengembangan Sistem untuk periode **${period}**. Laporan ini mencakup aktivitas pengembangan pada **${totalRepos} repositori** (${repoList}) yang dikelola dalam lingkungan pengembangan kami.`,
    "",
    `Selama periode pelaporan, tim pengembang telah melakukan **${totalCommits} commit** dengan **${totalChanges.toLocaleString()} perubahan** (**+${totalIns.toLocaleString()}** baris penambahan dan **-${totalDel.toLocaleString()}** baris pengurangan) yang tersebar di berbagai modul dan komponen sistem. Dari total aktivitas tersebut, sistem analisis berhasil mengidentifikasi **${totalWorkItems} item pekerjaan** yang mencakup pengembangan fitur, perbaikan, dan pemeliharaan infrastruktur.`,
    "",
    modeDesc,
    "",
    "Laporan ini menyajikan rincian pekerjaan berdasarkan kategori pengembangan, perbaikan, dan infrastruktur yang didukung oleh bukti teknis berupa commit dan perubahan berkas. Setiap item pekerjaan telah dianalisis untuk mengidentifikasi dampak dan kontribusinya terhadap pengembangan sistem secara keseluruhan.",
    "",
    "Kami berharap laporan ini dapat memberikan gambaran yang komprehensif mengenai kemajuan pengembangan dan menjadi acuan untuk perencanaan selanjutnya.",
    "",
    "Hormat kami,",
    "",
    "Tim Pengembang",
  ].join("\n");
}

// ── Daftar Isi Generator ──

function generateDaftarIsi(sections: SectionData[], mode: ReportMode): string {
  const lines: string[] = [];

  lines.push("### KATA PENGANTAR");

  for (const [si, section] of sections.entries()) {
    const roman = ROMAN[si] || `${si + 1}`;
    lines.push(`### ${roman}. ${section.name}`);
    for (const repo of section.repos) {
      for (const [wi, item] of repo.workItems.entries()) {
        const judul = item.judul || item.title || "Item pekerjaan";
        lines.push(`#### ${String.fromCharCode(97 + wi)}. ${judul} — ${repo.repoName}`);
      }
    }
  }

  lines.push(`### ${ROMAN[sections.length] || "IV"}. KESIMPULAN`);
  lines.push(`### ${ROMAN[sections.length + 1] || "V"}. LAMPIRAN`);

  const appendixLetters = APPENDIX_MODES[mode];
  for (const letter of appendixLetters) {
    const names: Record<string, string> = {
      A: "Lampiran A — Daftar Commit",
      B: "Lampiran B — Rincian Aktivitas Pengembangan",
      C: "Lampiran C — Perubahan Berkas",
      D: "Lampiran D — Statistik Pengembangan",
      E: "Lampiran E — Pemetaan Bukti",
      F: "Lampiran F — Ringkasan Repositori",
    };
    lines.push(`#### ${names[letter] || `Lampiran ${letter}`}`);
  }

  return lines.join("\n");
}

// ── Section Renderer ──

function renderSections(sections: SectionData[]): string {
  const parts: string[] = [];

  for (const [si, section] of sections.entries()) {
    const roman = ROMAN[si] || `${si + 1}`;
    parts.push(`## ${roman}. ${section.name}`);
    parts.push("");

    let repoIndex = 1;
    for (const repo of section.repos) {
      parts.push(`### ${repoIndex}. ${repo.repoName}`);
      parts.push("");

      if (repo.workItems.length === 0) {
        parts.push("Tidak ada item pekerjaan yang teridentifikasi untuk repositori ini.");
        parts.push("");
        repoIndex++;
        continue;
      }

      let itemIndex = 1;
      for (const item of repo.workItems) {
        const judul = item.judul || item.title || "Item pekerjaan";
        const deskripsi = item.deskripsi || item.description || "";

        parts.push(`#### ${String.fromCharCode(96 + itemIndex)}. ${judul}`);
        parts.push("");

        if (deskripsi) {
          parts.push(deskripsi);
          parts.push("");
        }

        const bukti = item.bukti || item.evidence || [];
        if (bukti.length > 0) {
          parts.push(`Bukti: ${bukti.map((b: any) => {
            const hash = (b.hashCommit || b.commitHash || "").slice(0, 8);
            const file = b.berkas || b.file || "";
            return `${hash} — ${file}`;
          }).join("; ")}`);
          parts.push("");
        }

        const dampak = item.dampak || item.impact || "";
        const keyakinan = item.keyakinan || item.confidence || "";
        const kategori = item.kategori || item.category || "";
        const metaParts: string[] = [];
        if (kategori) metaParts.push(`Kategori: ${getCategoryLabel(kategori)}`);
        if (dampak) metaParts.push(`Dampak: ${dampak}`);
        if (keyakinan) metaParts.push(`Keyakinan: ${keyakinan}`);
        if (metaParts.length > 0) {
          parts.push(metaParts.join(" | "));
          parts.push("");
        }

        itemIndex++;
      }

      parts.push(`Ringkasan: ${repo.totalCommits} commit, +${repo.totalInsertions}/-${repo.totalDeletions} perubahan`);
      parts.push("");
      repoIndex++;
    }

    parts.push("---");
    parts.push("");
  }

  return parts.join("\n").trim();
}

// ── Kesimpulan Generator ──

function generateKesimpulan(
  period: string,
  repoAnalyses: RepoAnalysisData[],
  sections: SectionData[],
): string {
  const totalRepos = repoAnalyses.length;
  // Count work items from sections (which may include fallback items)
  const totalWorkItems = sections.reduce((s, sec) => s + sec.repos.reduce((sr, r) => sr + r.workItems.length, 0), 0);

  // Count by section
  const sectionCounts = sections.map(sec =>
    `${sec.name}: ${sec.repos.reduce((s, r) => s + r.workItems.length, 0)} item pekerjaan`,
  );

  // Achievements from sections (which may include fallback items)
  const allItems: { item: WorkItemData; repo: string }[] = sections.flatMap(sec =>
    sec.repos.flatMap(r => r.workItems.map(item => ({ item, repo: r.repoName }))),
  );
  const highImpact = allItems.filter(i => (i.item.dampak || "").toLowerCase() === "tinggi");
  const achievements = highImpact.length > 0
    ? highImpact.slice(0, 5).map(i => `- ${i.item.judul} (${i.repo})`)
    : allItems.slice(0, 5).map(i => `- ${i.item.judul} (${i.repo})`);

  return [
    `Berdasarkan hasil analisis aktivitas pengembangan pada periode **${period}**, berikut adalah kesimpulan yang dapat ditarik:`,
    "",
    "### Capaian Umum",
    "",
    `Selama periode ini, tim pengembang menyelesaikan **${totalWorkItems} item pekerjaan** di **${totalRepos} repositori** yang teridentifikasi melalui analisis commit.`,
    "",
    "### Distribusi Pekerjaan",
    "",
    "Berdasarkan pengelompokan kategori, distribusi pekerjaan adalah sebagai berikut:",
    "",
    sectionCounts.join("\n"),
    "",
    "### Capaian Utama",
    "",
    achievements.join("\n"),
    "",
    "### Fokus Pengembangan",
    "",
    "Secara keseluruhan, fokus pengembangan pada periode ini meliputi pengembangan fitur baru, perbaikan dan penyempurnaan sistem yang ada, serta pemeliharaan infrastruktur dan dependency. Seluruh perubahan telah melalui proses version control dan dapat dilacak melalui commit yang terdokumentasi.",
    "",
    "### Langkah Selanjutnya",
    "",
    "Rekomendasi untuk periode mendatang meliputi prioritisasi item pekerjaan yang masih tertunda, evaluasi dampak dari perubahan yang telah dilakukan, dan perencanaan pengembangan fitur baru berdasarkan kebutuhan yang teridentifikasi.",
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════
// APPENDIX GENERATORS
// ════════════════════════════════════════════════════════════════

// ── LAMPIRAN A: Daftar Commit ──

function generateLampiranA(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  mode: ReportMode,
): string {
  const parts: string[] = [];
  parts.push("### Lampiran A — Daftar Commit");
  parts.push("");
  parts.push("Daftar seluruh commit yang tercatat selama periode pelaporan, dikelompokkan berdasarkan repositori.");
  parts.push("");

  let totalCommitCount = 0;

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    if (repoCommits.length === 0) continue;

    totalCommitCount += repoCommits.length;

    parts.push(`**Repositori:** ${repo.name}`);
    parts.push(`**Total commit:** ${repoCommits.length}`);
    parts.push("");

    parts.push("| Hash | Tanggal | Author | Pesan | Perubahan |");
    parts.push("|------|---------|--------|-------|-----------|");

    for (const c of repoCommits) {
      const shortHash = c.hash.slice(0, 8);
      const date = new Date(c.date).toLocaleDateString("id-ID");
      const author = c.authorName;
      const message = c.message.replace(/\|/g, "\\|").substring(0, 80);
      const changes = `+${c.insertions}/-${c.deletions}`;
      parts.push(`| \`${shortHash}\` | ${date} | ${author} | ${message} | ${changes} |`);
    }

    parts.push("");
  }

  if (totalCommitCount === 0) {
    parts.push("Tidak ada commit yang tercatat pada periode ini.");
    parts.push("");
  }

  return parts.join("\n");
}

// ── LAMPIRAN B: Rincian Aktivitas Pengembangan ──

function generateLampiranB(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  repoAnalyses: RepoAnalysisData[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran B — Rincian Aktivitas Pengembangan");
  parts.push("");
  parts.push("Rincian setiap commit yang tercatat selama periode pelaporan, termasuk keterkaitannya dengan item pekerjaan yang teridentifikasi.");
  parts.push("");

  const workItemCommitMap = buildWorkItemCommitMap(repoAnalyses, allCommits, allRepos);

  // Build a lookup: hash → work item names
  const hashToWorkItems = new Map<string, string[]>();
  for (const ref of workItemCommitMap) {
    for (const c of ref.commits) {
      const h = c.hash.toLowerCase();
      if (!hashToWorkItems.has(h)) hashToWorkItems.set(h, []);
      hashToWorkItems.get(h)!.push(ref.workItem.judul);
    }
  }

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    if (repoCommits.length === 0) continue;

    parts.push(`**Repositori:** ${repo.name}`);
    parts.push("");

    for (const c of repoCommits) {
      const relatedItems = hashToWorkItems.get(c.hash.toLowerCase()) || [];

      parts.push(`#### Commit ${c.hash.slice(0, 8)}`);
      parts.push("");
      parts.push(`**Tanggal:** ${new Date(c.date).toLocaleDateString("id-ID")}`);
      parts.push(`**Author:** ${c.authorName}`);
      parts.push(`**Pesan:** ${c.message}`);
      parts.push(`**Perubahan:** +${c.insertions}/-${c.deletions} baris di ${c.filesChanged} berkas`);
      parts.push("");

      if (relatedItems.length > 0) {
        parts.push("**Item Pekerjaan Terkait:**");
        for (const item of [...new Set(relatedItems)]) {
          parts.push(item);
        }
        parts.push("");
      }

      // Changed files
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      if (changedFiles.length > 0) {
        parts.push("**Berkas yang Diubah:**");
        const fileLimit = 15;
        const displayFiles = changedFiles.slice(0, fileLimit);
        for (const f of displayFiles) {
          parts.push(`${f}`);
        }
        if (changedFiles.length > fileLimit) {
          parts.push(`...dan ${changedFiles.length - fileLimit} berkas lainnya`);
        }
        parts.push("");
      }
    }

    parts.push("---");
    parts.push("");
  }

  return parts.join("\n");
}

// ── LAMPIRAN C: Perubahan Berkas ──

function generateLampiranC(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  repoAnalyses: RepoAnalysisData[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran C — Perubahan Berkas");
  parts.push("");
  parts.push("Daftar seluruh berkas yang mengalami perubahan selama periode pelaporan, dikelompokkan berdasarkan repositori.");
  parts.push("");

  // Build work item → commit hash map for linking
  const workItemFileMap = new Map<string, string[]>();
  for (const repo of repoAnalyses) {
    if (!repo.hasAnalysis) continue;
    for (const item of repo.workItems) {
      const bukti = item.bukti || [];
      for (const b of bukti) {
        const file = b.berkas || "";
        if (file && !workItemFileMap.has(file)) {
          workItemFileMap.set(file, [item.judul]);
        } else if (file) {
          const existing = workItemFileMap.get(file)!;
          if (!existing.includes(item.judul)) existing.push(item.judul);
        }
      }
    }
  }

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    if (repoCommits.length === 0) continue;

    // Aggregate file stats
    const fileStats = new Map<string, { changes: string; count: number }>();
    for (const c of repoCommits) {
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      for (const f of changedFiles) {
        if (!fileStats.has(f)) fileStats.set(f, { changes: "", count: 0 });
        const stat = fileStats.get(f)!;
        stat.count++;
      }
    }

    // Also get diffStat for per-file insertions/deletions
    for (const c of repoCommits) {
      let diffStat: { file: string; insertions: number; deletions: number }[] = [];
      try { diffStat = JSON.parse(c.diffStat || "[]"); } catch {}
      for (const d of diffStat) {
        if (!fileStats.has(d.file)) fileStats.set(d.file, { changes: "", count: 1 });
        // Accumulate the latest diff stat
        fileStats.set(d.file, {
          changes: `+${d.insertions}/-${d.deletions}`,
          count: fileStats.get(d.file)?.count || 1,
        });
      }
    }

    // Sort by count descending
    const sortedFiles = [...fileStats.entries()].sort((a, b) => b[1].count - a[1].count);

    parts.push(`**Repositori:** ${repo.name}`);
    parts.push(`**Total berkas unik:** ${sortedFiles.length}`);
    parts.push("");

    parts.push("| Berkas | Perubahan | Item Pekerjaan Terkait |");
    parts.push("|--------|-----------|----------------------|");

    for (const [file, stats] of sortedFiles) {
      const relatedItems = workItemFileMap.get(file);
      const itemStr = relatedItems ? relatedItems.join(", ") : "-";
      const changesDisplay = stats.changes || `${stats.count}x`;
      parts.push(`| \`${file}\` | ${changesDisplay} | ${itemStr} |`);
    }

    parts.push("");
  }

  return parts.join("\n");
}

// ── LAMPIRAN D: Statistik Pengembangan ──

function generateLampiranD(
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
  repoAnalyses: RepoAnalysisData[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran D — Statistik Pengembangan");
  parts.push("");
  parts.push("Statistik pengembangan yang mencakup ringkasan perubahan, berkas yang sering dimodifikasi, dan distribusi pekerjaan.");
  parts.push("");

  // ── Table 1: Per-Repository Summary ──

  parts.push("#### Tabel D.1 — Ringkasan per Repositori");
  parts.push("");

  parts.push("| Repositori | Commit | Berkas Diubah | Penambahan | Pengurangan | Item Pekerjaan |");
  parts.push("|------------|--------|---------------|------------|-------------|----------------|");

  let grandTotalCommits = 0;
  let grandTotalFiles = 0;
  let grandTotalInsertions = 0;
  let grandTotalDeletions = 0;
  let grandTotalItems = 0;

  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    const analysis = repoAnalyses.find(r => r.repoName === repo.name);
    const totalCommits = repoCommits.length;
    const totalFiles = repoCommits.reduce((s, c) => s + c.filesChanged, 0);
    const totalIns = repoCommits.reduce((s, c) => s + c.insertions, 0);
    const totalDel = repoCommits.reduce((s, c) => s + c.deletions, 0);
    const totalItems = analysis ? analysis.workItems.length : 0;

    grandTotalCommits += totalCommits;
    grandTotalFiles += totalFiles;
    grandTotalInsertions += totalIns;
    grandTotalDeletions += totalDel;
    grandTotalItems += totalItems;

    if (totalCommits > 0 || totalItems > 0) {
      parts.push(`| ${repo.name} | ${totalCommits} | ${totalFiles} | +${totalIns.toLocaleString()} | -${totalDel.toLocaleString()} | ${totalItems} |`);
    }
  }

  parts.push(`| **Total** | **${grandTotalCommits}** | **${grandTotalFiles}** | **+${grandTotalInsertions.toLocaleString()}** | **-${grandTotalDeletions.toLocaleString()}** | **${grandTotalItems}** |`);
  parts.push("");

  // ── Table 2: Top Modified Files ──

  parts.push("#### Tabel D.2 — Berkas Paling Sering Dimodifikasi");
  parts.push("");

  const fileFrequency = new Map<string, { count: number; repos: Set<string> }>();
  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    for (const c of repoCommits) {
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      for (const f of changedFiles) {
        if (!fileFrequency.has(f)) fileFrequency.set(f, { count: 0, repos: new Set() });
        const stat = fileFrequency.get(f)!;
        stat.count++;
        stat.repos.add(repo.name);
      }
    }
  }

  const topFiles = [...fileFrequency.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30);

  if (topFiles.length > 0) {
    parts.push("| Berkas | Jumlah Commit | Repositori |");
    parts.push("|--------|---------------|------------|");
    for (const [file, stat] of topFiles) {
      const repoList = [...stat.repos].join(", ");
      parts.push(`| \`${file}\` | ${stat.count} | ${repoList} |`);
    }
    parts.push("");
  }

  // ── Table 3: Top Modified Directories ──

  parts.push("#### Tabel D.3 — Direktori Paling Sering Dimodifikasi");
  parts.push("");

  const dirFrequency = new Map<string, { count: number; files: Set<string> }>();
  for (const repo of allRepos) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.id);
    for (const c of repoCommits) {
      let changedFiles: string[] = [];
      try { changedFiles = JSON.parse(c.changedFiles || "[]"); } catch {}
      for (const f of changedFiles) {
        const dir = getDirectory(f);
        if (!dirFrequency.has(dir)) dirFrequency.set(dir, { count: 0, files: new Set() });
        const stat = dirFrequency.get(dir)!;
        stat.count++;
        stat.files.add(f);
      }
    }
  }

  const topDirs = [...dirFrequency.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  if (topDirs.length > 0) {
    parts.push("| Direktori | Jumlah Perubahan | Berkas Unik |");
    parts.push("|-----------|-----------------|-------------|");
    for (const [dir, stat] of topDirs) {
      parts.push(`| \`${dir}\` | ${stat.count} | ${stat.files.size} |`);
    }
    parts.push("");
  }

  // ── Table 4: Commits per Week ──

  parts.push("#### Tabel D.4 — Distribusi Commit per Minggu");
  parts.push("");

  const weekMap = new Map<string, { commits: number; insertions: number; deletions: number }>();
  for (const c of allCommits) {
    const weekNum = getWeekNumber(c.date);
    const key = `Minggu ${weekNum}`;
    if (!weekMap.has(key)) weekMap.set(key, { commits: 0, insertions: 0, deletions: 0 });
    const stat = weekMap.get(key)!;
    stat.commits++;
    stat.insertions += c.insertions;
    stat.deletions += c.deletions;
  }

  const sortedWeeks = [...weekMap.entries()].sort((a, b) => {
    const numA = parseInt(a[0].replace("Minggu ", ""));
    const numB = parseInt(b[0].replace("Minggu ", ""));
    return numA - numB;
  });

  if (sortedWeeks.length > 0) {
    parts.push("| Periode | Commit | Penambahan | Pengurangan |");
    parts.push("|---------|--------|------------|-------------|");
    for (const [week, stat] of sortedWeeks) {
      parts.push(`| ${week} | ${stat.commits} | +${stat.insertions} | -${stat.deletions} |`);
    }
    parts.push("");
  }

  // ── Table 5: Work Items per Category ──

  parts.push("#### Tabel D.5 — Distribusi Item Pekerjaan per Kategori");
  parts.push("");

  const categoryCount = new Map<string, number>();
  for (const repo of repoAnalyses) {
    for (const item of repo.workItems) {
      const cat = item.kategori || item.category || "other";
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
    }
  }

  if (categoryCount.size > 0) {
    const sortedCats = [...categoryCount.entries()].sort((a, b) => b[1] - a[1]);
    parts.push("| Kategori | Jumlah Item |");
    parts.push("|----------|-------------|");
    for (const [cat, count] of sortedCats) {
      parts.push(`| ${getCategoryLabel(cat)} | ${count} |`);
    }
    parts.push("");

    // ── Table 6: Work Items per Section ──

    const sectionItemCount = new Map<string, number>();
    for (const repo of repoAnalyses) {
      for (const item of repo.workItems) {
        const kategori = (item.kategori || "other").toLowerCase();
        const sectionName = SECTION_MAP[kategori] || "PENGEMBANGAN SISTEM";
        sectionItemCount.set(sectionName, (sectionItemCount.get(sectionName) || 0) + 1);
      }
    }

    parts.push("#### Tabel D.6 — Distribusi Item Pekerjaan per Bagian Laporan");
    parts.push("");

    const sortedSections = [...sectionItemCount.entries()].sort((a, b) => b[1] - a[1]);
    parts.push("| Bagian Laporan | Jumlah Item |");
    parts.push("|----------------|-------------|");
    for (const [section, count] of sortedSections) {
      parts.push(`| ${section} | ${count} |`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

// ── LAMPIRAN E: Evidence Mapping ──

function generateLampiranE(
  repoAnalyses: RepoAnalysisData[],
  allCommits: CommitRow[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran E — Pemetaan Bukti");
  parts.push("");
  parts.push("Pemetaan bukti untuk setiap item pekerjaan. Setiap item dilengkapi dengan referensi commit dan berkas yang mendukung.");
  parts.push("");

  for (const repo of repoAnalyses) {
    if (!repo.hasAnalysis || repo.workItems.length === 0) continue;

    parts.push(`**Repositori:** ${repo.repoName}`);
    parts.push("");

    for (const item of repo.workItems) {
      const bukti = item.bukti || item.evidence || [];

      parts.push(`#### ${item.judul}`);
      parts.push("");

      if (item.deskripsi) {
        parts.push(`**Deskripsi:** ${item.deskripsi}`);
        parts.push("");
      }

      parts.push(`**Kategori:** ${getCategoryLabel(item.kategori || "")}`);
      parts.push(`**Dampak:** ${item.dampak || "N/A"}`);
      parts.push(`**Keyakinan:** ${item.keyakinan || "N/A"}`);
      parts.push("");

      if (bukti.length > 0) {
        parts.push("**Bukti Commit:**");
        for (const b of bukti) {
          const raw = b as any;
          const hash = (raw.hashCommit || raw.commitHash || "").slice(0, 8);
          // Find the full commit to show its message
          const match = allCommits.find(c => c.hash.toLowerCase().startsWith(hash));
          const message = match ? match.message.substring(0, 80) : "(tidak ditemukan)";
          parts.push(`${hash} — ${message}`);
        }
        parts.push("");

        parts.push("**Berkas Terkait:**");
        const uniqueFiles = [...new Set(bukti.map(b => { const raw = b as any; return raw.berkas || raw.file || ""; }).filter(Boolean))];
        for (const f of uniqueFiles) {
          parts.push(f);
        }
        parts.push("");
      } else {
        parts.push("Tidak ada bukti spesifik yang tercatat untuk item ini.");
        parts.push("");
      }

      parts.push("---");
      parts.push("");
    }
  }

  return parts.join("\n");
}

// ── LAMPIRAN F: Repository Summary ──

function generateLampiranF(
  repoAnalyses: RepoAnalysisData[],
  allCommits: CommitRow[],
  allRepos: { id: number; name: string }[],
): string {
  const parts: string[] = [];
  parts.push("### Lampiran F — Ringkasan Repositori");
  parts.push("");
  parts.push("Ringkasan setiap repositori yang mencakup gambaran umum aktivitas dan hasil analisis.");
  parts.push("");

  const workItemCommitMap = buildWorkItemCommitMap(repoAnalyses, allCommits, allRepos);

  for (const repo of repoAnalyses) {
    const repoCommits = allCommits.filter(c => c.repoId === repo.repoId);

    parts.push(`**Repositori:** ${repo.repoName}`);
    parts.push("");

    parts.push(`**Ringkasan:** ${repo.summary || "Belum ada ringkasan yang tersedia."}`);
    parts.push("");

    // Stats
    parts.push("| Metrik | Nilai |");
    parts.push("|--------|-------|");
    parts.push(`| Total Commit | ${repo.totalCommits} |`);
    parts.push(`| Berkas Diubah | ${repo.totalFilesChanged} |`);
    parts.push(`| Baris Ditambahkan | +${repo.totalInsertions.toLocaleString()} |`);
    parts.push(`| Baris Dihapus | -${repo.totalDeletions.toLocaleString()} |`);
    parts.push(`| Item Pekerjaan | ${repo.workItems.length} |`);
    parts.push("");

    // Work items
    if (repo.workItems.length > 0) {
      parts.push("**Item Pekerjaan:**");
      for (const item of repo.workItems) {
        const bukti = item.bukti || [];
        const commitCount = bukti.length;
        parts.push(`${item.judul} (${getCategoryLabel(item.kategori || "")}, dampak ${item.dampak || "N/A"}, ${commitCount} bukti commit)`);
      }
      parts.push("");
    }

    // Impact & Risks from analysis
    if (repo.impact) {
      parts.push(`**Dampak:** ${repo.impact}`);
      parts.push("");
    }
    if (repo.risks) {
      parts.push(`**Risiko:** ${repo.risks}`);
      parts.push("");
    }
    if (repo.nextSuggestions) {
      parts.push(`**Rekomendasi:** ${repo.nextSuggestions}`);
      parts.push("");
    }

    parts.push("---");
    parts.push("");
  }

  return parts.join("\n");
}

// ── Assemble Appendices ──

function assembleAppendices(
  mode: ReportMode,
  data: {
    allCommits: CommitRow[];
    allRepos: { id: number; name: string }[];
    repoAnalyses: RepoAnalysisData[];
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
  const totalCommits = data.repoAnalyses.reduce((s, r) => s + r.totalCommits, 0);
  const totalInsertions = data.repoAnalyses.reduce((s, r) => s + r.totalInsertions, 0);
  const totalDeletions = data.repoAnalyses.reduce((s, r) => s + r.totalDeletions, 0);
  const totalChanges = totalInsertions + totalDeletions;
  const totalFiles = data.repoAnalyses.reduce((s, r) => s + r.totalFilesChanged, 0);

  const execSummary = [
    `Selama **${data.period}**, tim melakukan **${totalCommits} commit** di **${data.repoAnalyses.length} repositori**, mengubah **${totalFiles} berkas** dengan **${totalInsertions.toLocaleString()} baris ditambahkan** dan **${totalDeletions.toLocaleString()} baris dihapus** (total **${totalChanges.toLocaleString()} perubahan**).`,
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
