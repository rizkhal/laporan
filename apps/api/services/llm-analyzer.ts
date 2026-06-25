import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getLLMConfig(providerId?: number): LLMConfig {
  let provider;
  if (providerId) {
    provider = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, providerId)).get();
  } else {
    provider = db.select().from(schema.llmProviders).get();
  }
  if (!provider) {
    // Fallback to env
    return {
      baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.LLM_API_KEY || "",
      model: process.env.LLM_MODEL || "gpt-4o-mini",
    };
  }
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.model,
  };
}

interface CommitInput {
  hash: string;
  message: string;
  authorName: string;
  date: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedFiles: string[];
  diffStat: { file: string; insertions: number; deletions: number }[];
  patchSnippets: { file: string; patch: string }[];
}

interface AnalysisOutput {
  workItems: {
    judul: string;
    deskripsi: string;
    kategori: string;
    dampak: "tinggi" | "sedang" | "rendah";
    bukti: { hashCommit: string; berkas: string }[];
    keyakinan: "tinggi" | "sedang" | "rendah";
  }[];
  ringkasan: string;
  dampak: string;
  risiko: string;
  rekomendasi: string;
}

function sanitize(str: string): string {
  return str
    .replace(/[\u0000-\u001F]/g, "") // strip control chars
    .replace(/`/g, "'")                // backticks → single quote
    .replace(/\${/g, "$" + "{");         // prevent template literal injection
}

function buildPrompt(commits: CommitInput[], repoName: string): string {
  return `Anda adalah analis software engineering yang sedang menyusun laporan bulanan untuk repositori "${sanitize(repoName)}".

## PENTING: BAHASA INDONESIA WAJIB

Seluruh output HARUS dalam Bahasa Indonesia. Ini adalah persyaratan WAJIB, bukan preferensi.
Bahasa Inggris HANYA diizinkan untuk:
- Nama teknologi, framework, library, produk
- Identifier kode sumber (nama kelas, fungsi, variabel)
- Nama berkas
- Hash commit

## BATASAN ANALISIS
- HANYA identifikasi item pekerjaan yang didukung oleh commit messages dan file changes
- JANGAN membuat item pekerjaan yang tidak memiliki bukti
- JANGAN menganalisis lockfiles atau build artifacts
- JANGAN membuat asumsi tentang dampak bisnis tanpa bukti

## STRUKTUR OUTPUT

Untuk SETIAP item pekerjaan yang bermakna, berikan:
- judul: Nama pekerjaan yang jelas
- deskripsi: Penjelasan detail dalam Bahasa Indonesia
- kategori: feature | bugfix | refactor | documentation | testing | infrastructure | performance | dependency | other
- dampak: "tinggi" | "sedang" | "rendah"
- bukti: Array dari {hashCommit, berkas} yang merujuk ke commit dan file terkait
- keyakinan: "tinggi" | "sedang" | "rendah"

Juga berikan:
- ringkasan: Ringkasan eksekutif 2-3 paragraf dalam Bahasa Indonesia
- dampak: Penilaian dampak teknis/bisnis secara keseluruhan dalam Bahasa Indonesia
- risiko: Risiko yang teridentifikasi dari perubahan ini dalam Bahasa Indonesia
- rekomendasi: Langkah selanjutnya yang direkomendasikan dalam Bahasa Indonesia

## VALIDASI BAHASA

Sebelum mengembalikan output akhir, VERIFIKASI bahwa:
1. Semua konten naratif ditulis dalam Bahasa Indonesia baku
2. Tidak ada kalimat Bahasa Inggris yang tersisa kecuali nama teknis yang diizinkan
3. Terjemahkan kalimat Bahasa Inggris apa pun ke Bahasa Indonesia yang alami
4. Hanya proper noun teknis (teknologi, framework, library, produk, identifier kode) yang boleh dalam Bahasa Inggris

Berikut adalah data commit:

${commits.map(c => `
Commit: ${c.hash}
Author: ${sanitize(c.authorName)}
Date: ${c.date}
Message: ${sanitize(c.message)}
Files: ${c.filesChanged} (+${c.insertions}/-${c.deletions})
Changed Files: ${c.changedFiles.join(", ")}

Diff Stats:
${c.diffStat.map(d => `  ${d.file}: +${d.insertions}/-${d.deletions}`).join("\n")}

Patch Snippets:
${c.patchSnippets.map(p => `  File: ${p.file}\n  ${p.patch.slice(0, 500)}`).join("\n")}
`).join("\n---\n")}

RESPON DENGAN JSON VALID dengan struktur ini (field names dan values HARUS Bahasa Indonesia):
{
  "workItems": [
    {
      "judul": "",
      "deskripsi": "",
      "kategori": "",
      "dampak": "tinggi|sedang|rendah",
      "bukti": [{"hashCommit": "", "berkas": ""}],
      "keyakinan": "tinggi|sedang|rendah"
    }
  ],
  "ringkasan": "",
  "dampak": "",
  "risiko": "",
  "rekomendasi": ""
}`;
}

/**
 * Safely extract a JSON object `{...}` from a string that may contain
 * surrounding text, markdown fences, or trailing content.
 * Uses a stack-based approach to find the outermost balanced braces.
 */
function extractJSON(text: string): string {
  // Try markdown-fenced JSON first
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    const candidate = mdMatch[1].trim();
    if (candidate.startsWith("{")) return candidate;
  }

  // Find the first '{' and its matching '}' using a depth counter
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }

  // Fallback: return everything (will likely fail to parse, but caller handles it)
  return text;
}

/**
 * Attempt to fix common JSON issues (trailing commas, truncation)
 * so parsing has a better chance of succeeding.
 */
function repairJSON(raw: string): string {
  // Remove trailing commas before closing brackets/braces
  let s = raw.replace(/,([\s\n]*[}\]])/g, "$1");
  return s;
}

export async function analyzeCommits(
  commits: CommitInput[],
  repoName: string,
  llmProviderId?: number
): Promise<AnalysisOutput> {
  const config = getLLMConfig(llmProviderId);
  const prompt = buildPrompt(commits, repoName);

  const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: "Anda adalah analis software engineering yang presisi. Seluruh output HARUS dalam Bahasa Indonesia. Respons HANYA berisi JSON valid. Gunakan field names Bahasa Indonesia: judul, deskripsi, kategori, dampak, bukti, keyakinan, ringkasan, risiko, rekomendasi. Nilai dampak dan keyakinan: tinggi, sedang, rendah. Bahasa Inggris hanya diizinkan untuk nama teknologi, framework, identifier kode, dan hash commit." },
        { role: "user", content: prompt },
      ],
      max_tokens: 16384,
      temperature: 0.3,
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`LLM API error (${response.status}): ${rawText.slice(0, 500)}`);
  }

  // Parse SSE streaming response (9router always streams)
  let content = "";
  if (rawText.trim().startsWith("data: ") || rawText.includes("chat.completion.chunk")) {
    for (const line of rawText.trim().split("\n")) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try {
          const chunk = JSON.parse(line.replace(/^data: /, ""));
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
          }
        } catch {}
      }
    }
  } else {
    // Regular JSON response
    try {
      const data = JSON.parse(rawText);
      content = data.choices?.[0]?.message?.content || "";
    } catch (e) {
      throw new Error(`Failed to parse LLM response: ${rawText.slice(0, 200)}`);
    }
  }

  // Extract JSON from response (handle markdown-wrapped JSON)
  let jsonStr = extractJSON(content);
  if (!jsonStr) jsonStr = content;

  // Try to repair common issues before parsing
  jsonStr = repairJSON(jsonStr.trim());

  // Attempt parsing, with progressive fallbacks
  let lastError = "";
  for (const attempt of [jsonStr]) {
    try {
      const parsed = JSON.parse(attempt) as AnalysisOutput;
      if (!parsed.workItems || !Array.isArray(parsed.workItems)) {
        throw new Error("Invalid response structure: missing workItems array");
      }
      return parsed;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Unknown error";
    }
  }

  // Log the first 2000 chars of content for debugging
  console.error("Failed to parse LLM response. First 2000 chars:", content.slice(0, 2000));
  console.error("Extracted JSON:", jsonStr.slice(0, 1500));
  throw new Error(`Failed to parse LLM analysis: ${lastError}`);
}

export async function runAnalysisForRepo(
  collectionId: number,
  repoId: number,
  llmProviderId?: number
): Promise<void> {
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, repoId)).get();
  if (!repo) throw new Error("Repository not found");

  const commits = db
    .select()
    .from(schema.commits)
    .where(
      and(eq(schema.commits.collectionId, collectionId), eq(schema.commits.repoId, repoId))
    )
    .all();

  if (commits.length === 0) throw new Error("No commits to analyze");

  // Upsert analysis record
  let analysis = db
    .select()
    .from(schema.analyses)
    .where(
      and(eq(schema.analyses.collectionId, collectionId), eq(schema.analyses.repoId, repoId))
    )
    .get();

  if (!analysis) {
    db.insert(schema.analyses).values({
      collectionId,
      repoId,
      status: "running",
    }).run();
  } else {
    db.update(schema.analyses)
      .set({ status: "running", updatedAt: new Date().toISOString() })
      .where(eq(schema.analyses.id, analysis.id))
      .run();
  }

  analysis = db
    .select()
    .from(schema.analyses)
    .where(
      and(eq(schema.analyses.collectionId, collectionId), eq(schema.analyses.repoId, repoId))
    )
    .get()!;

  try {
    const commitInputs: CommitInput[] = commits.map(c => ({
      hash: c.hash,
      message: c.message,
      authorName: c.authorName,
      date: c.date,
      filesChanged: c.filesChanged,
      insertions: c.insertions,
      deletions: c.deletions,
      changedFiles: JSON.parse(c.changedFiles || "[]"),
      diffStat: JSON.parse(c.diffStat || "[]"),
      patchSnippets: JSON.parse(c.patchSnippets || "[]"),
    }));

    const result = await analyzeCommits(commitInputs, repo.name, llmProviderId);

    db.update(schema.analyses)
      .set({
        status: "completed",
        workItems: JSON.stringify(result.workItems),
        category: result.workItems[0]?.kategori || "other",
        summary: result.ringkasan,
        impact: result.dampak,
        risks: result.risiko,
        nextSuggestions: result.rekomendasi,
        rawResponse: JSON.stringify(result),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.analyses.id, analysis.id))
      .run();
  } catch (err: any) {
    db.update(schema.analyses)
      .set({
        status: "failed",
        error: err.message,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.analyses.id, analysis.id))
      .run();
    throw err;
  }
}
