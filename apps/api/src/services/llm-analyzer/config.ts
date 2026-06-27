import { db } from "../../db/index";
import * as schema from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../../lib/crypto";
import type { LLMConfig } from "./types";

export function getLLMConfig(workspaceId: number, providerId?: number): LLMConfig {
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
