import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../lib/crypto";
import { isSafeLLMUrl } from "../lib/url-validator";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getLLMConfig(workspaceId: number, providerId?: number): LLMConfig {
  let provider;
  if (providerId) {
    provider = db.select().from(schema.llmProviders).where(and(eq(schema.llmProviders.id, providerId), eq(schema.llmProviders.workspaceId, workspaceId))).get();
  } else {
    provider = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.workspaceId, workspaceId)).get();
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
    apiKey: decrypt(provider.apiKey),
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
 * Attempt to parse a string as JSON using multiple strategies:
 * 1. Direct JSON.parse
 * 2. Strip invisible control characters and retry
 * 3. Extract balanced braces and retry
 * 4. Best-effort brace extraction even if unbalanced
 */
function parseAnyJSON(text: string): any {
  // Strategy 1: Direct
  try { return JSON.parse(text); } catch {}

  // Strategy 2: Strip control characters (BOM, null bytes, etc.)
  try {
    const cleaned = text.replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F\uFEFF\u200B-\u200F\u2028-\u202F\uFFF0-\uFFFF]/g, "");
    return JSON.parse(cleaned);
  } catch {}

  // Strategy 3: Extract balanced braces and try
  const extracted = extractBalancedJSON(text);
  if (extracted && extracted !== text) {
    try { return JSON.parse(extracted); } catch {}
    try { return JSON.parse(extracted.replace(/[\x00-\x1F\x7F-\uFFFF]/g, "")); } catch {}
  }

  return null;
}

/**
 * Find the first '{' and its matching '}' (balanced braces).
 * Handles truncation: if unbalanced, returns the partial object.
 */
function extractBalancedJSON(text: string): string {
  // Try markdown-fenced JSON first
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    const candidate = mdMatch[1].trim();
    if (candidate.startsWith("{")) return candidate;
  }

  // Find the first '{' and try to find its balanced '}'
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // Track string boundaries so we don't count braces inside strings
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"' && !escape) { inString = !inString; continue; }

    if (inString) continue;

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

  // If braces are unbalanced (truncated JSON), return best-effort
  if (start !== -1 && depth > 0) {
    // Try to complete the JSON by adding closing braces
    return text.slice(start) + "}".repeat(depth);
  }

  // Fallback: return cleaned text
  return text.replace(/[\x00-\x1F]/g, "").trim();
}

/**
 * Attempt to fix common JSON issues (trailing commas, truncation)
 * so parsing has a better chance of succeeding.
 */
function repairJSON(raw: string): string {
  // Remove trailing commas before closing brackets/braces
  let s = raw.replace(/,([\s\n]*[}\]])/g, "$1");
  // Remove trailing commas before closing brackets/braces (also in arrays)
  s = s.replace(/,([\s\n]*[}\]])/g, "$1");
  // Replace JavaScript-style undefined/null with JSON null
  s = s.replace(/\bundefined\b/g, "null");
  // Single-quoted keys → double-quoted keys (simplistic: only handles simple cases)
  s = s.replace(/'([^']+)'\s*:/g, '"$1":');
  return s;
}

/**
 * Try to extract the assistant message content from an LLM API response
 * using progressively more aggressive strategies.
 */
function extractContentFromRaw(rawText: string): string | null {
  // Strategy 1: Parse as JSON, get content from standard path
  const data = parseAnyJSON(rawText);
  if (data) {
    const content = data.choices?.[0]?.message?.content;
    if (content && typeof content === "string") return content;
  }

  // Strategy 2: Try each line (in case it's NDJSON and the first parse got partial)
  for (const line of rawText.trim().split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "data: [DONE]") continue;
    const jsonCandidate = trimmed.replace(/^data: /, "");
    if (!jsonCandidate.startsWith("{")) continue;
    try {
      const chunk = parseAnyJSON(jsonCandidate);
      if (!chunk) continue;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) return delta.content;
      const msgContent = chunk.choices?.[0]?.message?.content;
      if (msgContent) return msgContent;
    } catch {}
  }

  return null;
}

export async function analyzeCommits(
  commits: CommitInput[],
  repoName: string,
  workspaceId: number,
  llmProviderId?: number
): Promise<AnalysisOutput> {
  const config = getLLMConfig(workspaceId, llmProviderId);

  // SSRF protection: validate baseUrl
  const urlCheck = isSafeLLMUrl(config.baseUrl);
  if (!urlCheck.valid) {
    throw new Error(`LLM base URL is not allowed: ${urlCheck.error}`);
  }

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

  // ── Step 1: Extract assistant message content from raw response ──
  const extracted = extractContentFromRaw(rawText);
  if (!extracted) {
    console.error("LLM raw response (first 3000 chars):", rawText.slice(0, 3000));
    throw new Error("Failed to parse LLM response: could not extract content");
  }

  // ── Step 2: Extract inner JSON from the assistant's message ──
  let innerJson = extractBalancedJSON(extracted);
  if (!innerJson || innerJson === extracted) innerJson = extracted;

  // ── Step 3: Repair and attempt to parse the inner JSON ──
  innerJson = repairJSON(innerJson.trim());

  let parsed: AnalysisOutput | null = null;
  let lastError = "";

  // Try parsing the inner JSON with multiple strategies
  parsed = parseAnyJSON(innerJson);

  if (parsed && Array.isArray(parsed.workItems)) {
    return parsed;
  }

  // If workItems is missing, the inner JSON might be nested differently
  if (parsed && typeof parsed === "object") {
    // Search for workItems at any depth
    const findWorkItems = (obj: any): any[] | null => {
      if (obj.workItems && Array.isArray(obj.workItems)) return obj.workItems;
      for (const val of Object.values(obj)) {
        if (typeof val === "object" && val !== null) {
          const found = findWorkItems(val);
          if (found) return found;
        }
      }
      return null;
    };
    const found = findWorkItems(parsed);
    if (found) {
      // Reconstruct AnalysisOutput from the parsed object
      const ringkasan = typeof (parsed as any).ringkasan === "string" ? (parsed as any).ringkasan : "";
      const dampak = typeof (parsed as any).dampak === "string" ? (parsed as any).dampak : "";
      const risiko = typeof (parsed as any).risiko === "string" ? (parsed as any).risiko : "";
      const rekomendasi = typeof (parsed as any).rekomendasi === "string" ? (parsed as any).rekomendasi : "";
      return { workItems: found, ringkasan, dampak, risiko, rekomendasi };
    }
    lastError = "Missing workItems array";
  } else {
    lastError = lastError || "Invalid JSON structure";
  }

  // ── All strategies failed — log details for debugging ──
  console.error("LLM response content (first 2000 chars):", extracted.slice(0, 2000));
  console.error("Extracted inner JSON (first 1500 chars):", innerJson.slice(0, 1500));
  console.error("Parse error:", lastError);
  throw new Error(`Failed to parse LLM analysis: ${lastError}`);
}

export async function runAnalysisForRepo(
  collectionId: number,
  repoId: number,
  workspaceId: number,
  llmProviderId?: number
): Promise<void> {
  const repo = db.select().from(schema.repositories).where(and(eq(schema.repositories.id, repoId), eq(schema.repositories.workspaceId, workspaceId))).get();
  if (!repo) throw new Error("Repository not found in this workspace");

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

    const result = await analyzeCommits(commitInputs, repo.name, workspaceId, llmProviderId);

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
