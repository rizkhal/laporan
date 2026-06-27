import { db } from "../../db/index";
import * as schema from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { isSafeLLMUrl } from "../../lib/url-validator";
import { getLLMConfig } from "./config";
import { buildPrompt } from "./prompts";
import {
  extractContentFromRaw,
  extractBalancedJSON,
  repairJSON,
  parseAnyJSON,
} from "./parser";
import type { CommitInput, AnalysisOutput } from "./types";

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
