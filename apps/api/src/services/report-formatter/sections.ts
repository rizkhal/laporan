import type { ReportMode, WorkItemData, CommitRow, RepoAnalysisData, SectionData } from "./types";
import { SECTION_MAP, SECTION_ORDER, ROMAN, APPENDIX_MODES } from "./constants";
import { getCategoryLabel } from "./templates";
import { buildFallbackWorkItems } from "./fallback-topic";

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
      G: "Lampiran G — Diff Perubahan Kode",
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
              return `\`${hash}\` — \`${file}\``;
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

      parts.push(`Ringkasan: ${repo.totalCommits} commit, \`+${repo.totalInsertions}/-${repo.totalDeletions}\` perubahan`);
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

export {
  gatherSections,
  buildWorkItemCommitMap,
  generateKataPengantar,
  generateDaftarIsi,
  renderSections,
  generateKesimpulan,
};

export type { WorkItemCommitRef };
