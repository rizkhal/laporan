/**
 * Attempt to parse a string as JSON using multiple strategies:
 * 1. Direct JSON.parse
 * 2. Strip invisible control characters and retry
 * 3. Extract balanced braces and retry
 * 4. Best-effort brace extraction even if unbalanced
 */
export function parseAnyJSON(text: string): any {
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
export function extractBalancedJSON(text: string): string {
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
export function repairJSON(raw: string): string {
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
export function extractContentFromRaw(rawText: string): string | null {
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
