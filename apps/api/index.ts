import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { serve } from "@hono/node-server";
import { reposRouter } from "./routes/repos";
import { collectionsRouter } from "./routes/collections";
import { settingsRouter } from "./routes/settings";
import { reportsRouter } from "./routes/reports";
import { analysesRouter } from "./routes/analyses";
import { collectionDetailRouter } from "./routes/collection-detail";
import { authRouter } from "./routes/auth";
import { workspacesRouter } from "./routes/workspaces";
import { runMigration } from "./db/migrate-workspaces";

// Run migration on startup (idempotent - safe to run every time)
runMigration();

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin,
    credentials: true,
  }),
);

// Global error handler for HTTPExceptions from our auth helpers
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.route("/api/repos", reposRouter);
app.route("/api/collections", collectionsRouter);
app.route("/api/collections", collectionDetailRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/analyses", analysesRouter);
app.route("/api/auth", authRouter);
app.route("/api/workspaces", workspacesRouter);

app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3000");

serve({
  fetch: app.fetch,
  port,
});

console.log(`✓ Server running on http://localhost:${port}`);

export default app;
