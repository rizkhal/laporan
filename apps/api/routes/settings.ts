import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = new Hono();

// LLM Settings
router.get("/llm", (c) => {
  const provider = db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isActive, true))
    .get();
  if (!provider) {
    return c.json({
      baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.LLM_API_KEY || "",
      model: process.env.LLM_MODEL || "gpt-4o-mini",
    });
  }
  return c.json(provider);
});

router.put("/llm", async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      baseUrl: z.string(),
      apiKey: z.string(),
      model: z.string(),
    })
    .parse(body);

  const existing = db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isActive, true))
    .get();

  if (existing) {
    db.update(schema.llmProviders)
      .set({
        baseUrl: parsed.baseUrl,
        apiKey: parsed.apiKey,
        model: parsed.model,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.llmProviders.id, existing.id))
      .run();
  } else {
    db.insert(schema.llmProviders)
      .values({
        baseUrl: parsed.baseUrl,
        apiKey: parsed.apiKey,
        model: parsed.model,
      })
      .run();
  }

  return c.json({ success: true });
});

// Test LLM connection (server-side to avoid CORS)
router.post("/llm/test", async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      baseUrl: z.string(),
      apiKey: z.string(),
      model: z.string(),
    })
    .parse(body);

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

    // Parse SSE streaming response (9router always streams)
    // Each line: "data: {...}" with delta.content chunks
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
