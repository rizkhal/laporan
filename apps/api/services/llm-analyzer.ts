import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getLLMConfig(): LLMConfig {
  const provider = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.isActive, true)).get();
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
    title: string;
    description: string;
    category: string;
    impact: "high" | "medium" | "low";
    evidence: { commitHash: string; file: string }[];
    confidence: "high" | "medium" | "low";
  }[];
  summary: string;
  impact: string;
  risks: string;
  nextSuggestions: string;
}

function buildPrompt(commits: CommitInput[], repoName: string): string {
  return `You are analyzing a software development team's monthly commits for the repository "${repoName}".

Analyze these commits and produce a structured JSON report. Focus ONLY on work that can be directly evidenced by the commit messages and file changes.

Do NOT:
- Invent work items that aren't supported by commits/diffs
- Analyze lockfiles or build artifacts
- Make assumptions about business impact without evidence

For EACH meaningful work item identified, provide:
- title: Clear description of what was done
- description: Detailed explanation
- category: One of (feature, bugfix, refactor, documentation, testing, infrastructure, performance, dependency, other)
- impact: high/medium/low
- evidence: Array of {commitHash, file} references
- confidence: high/medium/low

Also provide:
- summary: 2-3 paragraph executive summary
- impact: Overall business/technical impact assessment
- risks: Any identified risks from these changes
- nextSuggestions: Suggested next steps

Here are the commits:

${commits.map(c => `
Commit: ${c.hash}
Author: ${c.authorName}
Date: ${c.date}
Message: ${c.message}
Files: ${c.filesChanged} (+${c.insertions}/-${c.deletions})
Changed Files: ${c.changedFiles.join(", ")}

Diff Stats:
${c.diffStat.map(d => `  ${d.file}: +${d.insertions}/-${d.deletions}`).join("\n")}

Patch Snippets:
${c.patchSnippets.map(p => `  File: ${p.file}\n  ${p.patch.slice(0, 500)}`).join("\n")}
`).join("\n---\n")}

Respond with ONLY valid JSON matching this structure:
{
  "workItems": [{ "title": "", "description": "", "category": "", "impact": "high|medium|low", "evidence": [{"commitHash": "", "file": ""}], "confidence": "high|medium|low" }],
  "summary": "",
  "impact": "",
  "risks": "",
  "nextSuggestions": ""
}`;
}

export async function analyzeCommits(
  commits: CommitInput[],
  repoName: string
): Promise<AnalysisOutput> {
  const config = getLLMConfig();
  const prompt = buildPrompt(commits, repoName);

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: "You are a precise software engineering analyst. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Extract JSON from response (handle markdown-wrapped JSON)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;

  try {
    const parsed = JSON.parse(jsonStr.trim()) as AnalysisOutput;
    // Validate structure
    if (!parsed.workItems || !Array.isArray(parsed.workItems)) {
      throw new Error("Invalid response structure: missing workItems array");
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse LLM response:", content);
    throw new Error(`Failed to parse LLM analysis: ${e instanceof Error ? e.message : "Unknown error"}`);
  }
}

export async function runAnalysisForRepo(
  collectionId: number,
  repoId: number
): Promise<void> {
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, repoId)).get();
  if (!repo) throw new Error("Repository not found");

  const commits = db
    .select()
    .from(schema.commits)
    .where(
      eq(schema.commits.collectionId, collectionId) && eq(schema.commits.repoId, repoId)
    )
    .all();

  if (commits.length === 0) throw new Error("No commits to analyze");

  // Upsert analysis record
  let analysis = db
    .select()
    .from(schema.analyses)
    .where(
      eq(schema.analyses.collectionId, collectionId) && eq(schema.analyses.repoId, repoId)
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
      eq(schema.analyses.collectionId, collectionId) && eq(schema.analyses.repoId, repoId)
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

    const result = await analyzeCommits(commitInputs, repo.name);

    db.update(schema.analyses)
      .set({
        status: "completed",
        workItems: JSON.stringify(result.workItems),
        category: result.workItems[0]?.category || "other",
        summary: result.summary,
        impact: result.impact,
        risks: result.risks,
        nextSuggestions: result.nextSuggestions,
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
