import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";
import { encrypt, decrypt } from "../lib/crypto";
import { isSafeLLMUrl } from "../lib/url-validator";

const router = new Hono();

const providerPayload = z.object({
  name: z.string().min(1).max(100).optional().default("default"),
  baseUrl: z.string().min(1).max(500),
  apiKey: z.string().min(1).max(500),
  model: z.string().min(1).max(100),
});

// Get all LLM providers scoped to workspace
router.get("/llm", (c) => {
  const ctx = requireAuth(c);
  const providers = db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.workspaceId, ctx.workspace.id))
    .all();
  // Decrypt API keys before returning to authenticated user
  const decrypted = providers.map(p => ({ ...p, apiKey: decrypt(p.apiKey) }));
  return c.json(decrypted);
});

// Create a new LLM provider
router.post("/llm", async (c) => {
  try {
    const ctx = requireAuth(c);
    const body = await c.req.json();
    const parsed = providerPayload.parse(body);

    // SSRF protection: validate baseUrl
    const urlCheck = isSafeLLMUrl(parsed.baseUrl);
    if (!urlCheck.valid) {
      return c.json({ error: urlCheck.error }, 400);
    }

    const result = db.insert(schema.llmProviders).values({
      workspaceId: ctx.workspace.id,
      name: parsed.name,
      baseUrl: parsed.baseUrl,
      apiKey: encrypt(parsed.apiKey),
      model: parsed.model,
    }).returning().get();
    return c.json({ ...result, apiKey: decrypt(result.apiKey) }, 201);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.errors[0].message }, 400);
    }
    console.error("Create LLM provider error:", err);
    return c.json({ error: "Failed to create provider" }, 500);
  }
});

// Update an LLM provider
router.put("/llm/:id", async (c) => {
  try {
    const ctx = requireAuth(c);
    const id = parseInt(c.req.param("id"));
    const provider = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, id)).get();
    assertOwnership(provider, ctx.workspace.id, "LLM provider");

    const body = await c.req.json();
    const parsed = providerPayload.partial().parse(body);
    const updateData: any = { updatedAt: new Date().toISOString() };
    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.baseUrl !== undefined) {
      // SSRF protection: validate baseUrl
      const urlCheck = isSafeLLMUrl(parsed.baseUrl);
      if (!urlCheck.valid) {
        return c.json({ error: urlCheck.error }, 400);
      }
      updateData.baseUrl = parsed.baseUrl;
    }
    if (parsed.apiKey !== undefined) updateData.apiKey = encrypt(parsed.apiKey);
    if (parsed.model !== undefined) updateData.model = parsed.model;
    const result = db.update(schema.llmProviders).set(updateData).where(eq(schema.llmProviders.id, id)).returning().get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json({ ...result, apiKey: decrypt(result.apiKey) });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.errors[0].message }, 400);
    }
    console.error("Update LLM provider error:", err);
    return c.json({ error: "Failed to update provider" }, 500);
  }
});

// Delete an LLM provider
router.delete("/llm/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const provider = db.select().from(schema.llmProviders).where(eq(schema.llmProviders.id, id)).get();
  assertOwnership(provider, ctx.workspace.id, "LLM provider");
  db.delete(schema.llmProviders).where(eq(schema.llmProviders.id, id)).run();
  return c.json({ success: true });
});

// Test LLM connection
router.post("/llm/test", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = z.object({
      baseUrl: z.string().min(1).max(500),
      apiKey: z.string().min(1).max(500),
      model: z.string().min(1).max(100),
    }).parse(body);

    // SSRF protection: validate baseUrl
    const urlCheck = isSafeLLMUrl(parsed.baseUrl);
    if (!urlCheck.valid) {
      return c.json(
        { success: false, error: urlCheck.error },
        { status: 200 },
      );
    }

    const response = await fetch(
      `${parsed.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${parsed.apiKey}`,
        },
        body: JSON.stringify({
          model: parsed.model,
          messages: [
            { role: "user", content: "Say 'Hello' and nothing else." },
          ],
          max_tokens: 256,
        }),
      },
    );

    const rawText = await response.text();

    if (!response.ok) {
      return c.json(
        { success: false, error: `API returned ${response.status}: ${rawText.slice(0, 500)}` },
        { status: 200 },
      );
    }

    // Try to extract content from response, handling multiple formats
    let content = "";

    // 1. Try regular JSON parse first (most reliable)
    try {
      const data = JSON.parse(rawText);
      content = data.choices?.[0]?.message?.content || "";
    } catch {
      // 2. Try SSE streaming format (data: {...} lines)
      const lines = rawText.trim().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ") && !trimmed.includes("[DONE]")) {
          try {
            const chunk = JSON.parse(trimmed.replace(/^data: /, ""));
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              content += delta.content;
            }
          } catch {}
        }
      }
      // If SSE parsing didn't yield content, use raw text
      if (!content) {
        content = rawText.slice(0, 500);
      }
    }

    return c.json({ success: true, content: content.trim() });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ success: false, error: err.errors[0].message }, { status: 200 });
    }
    return c.json(
      { success: false, error: "Connection failed" },
      { status: 200 },
    );
  }
});

export { router as settingsRouter };
