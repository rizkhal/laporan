import type { CommitRow, WorkItemData } from "./types";

/**
 * Infer commit category from message and changed files.
 * Returns one of: feature, bugfix, refactor, performance, dependency, infrastructure, documentation, testing, other
 */
export function inferCategoryFromCommit(commit: CommitRow): string {
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
export function inferTopicFromCommits(commits: CommitRow[], _files: string[]): string {
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
export function generateFallbackDescription(commits: CommitRow[], files: string[], category: string): string {
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
export function buildFallbackWorkItems(
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
