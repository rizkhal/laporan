import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = new Hono();

const providerPayload = z.object({
  name: z.string().optional().default("default"),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
});

// Get all LLM providers
router.get("/llm", (c) => {
  const providers = db.select().from(schema.llmProviders).all();
  return c.json(providers);
});

// Create a new LLM provider
router.post("/llm", async (c) => {
  const body = await c.req.json();
  const parsed = providerPayload.parse(body);
  const result = db.insert(schema.llmProviders).values({
    name: parsed.name,
    baseUrl: parsed.baseUrl,
    apiKey: parsed.apiKey,
    model: parsed.model,
  }).returning().get();
  return c.json(result, 201);
});

// Update an LLM provider
router.put("/llm/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const parsed = providerPayload.partial().parse(body);
  const updateData: any = { updatedAt: new Date().toISOString() };
  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.baseUrl !== undefined) updateData.baseUrl = parsed.baseUrl;
  if (parsed.apiKey !== undefined) updateData.apiKey = parsed.apiKey;
  if (parsed.model !== undefined) updateData.model = parsed.model;
  const result = db.update(schema.llmProviders).set(updateData).where(eq(schema.llmProviders.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Delete an LLM provider
router.delete("/llm/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  db.delete(schema.llmProviders).where(eq(schema.llmProviders.id, id)).run();
  return c.json({ success: true });
});

// Test LLM connection
router.post("/llm/test", async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
  }).parse(body);

  try {
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
      const data = JSON.parse(rawText);
      content = data.choices?.[0]?.message?.content || "";
    }

    return c.json({ success: true, content: content.trim() });
  } catch (err: any) {
    return c.json(
      { success: false, error: err.message || "Connection failed" },
      { status: 200 },
    );
  }
});

export { router as settingsRouter };
