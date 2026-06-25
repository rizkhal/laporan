import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { reposRouter } from "./routes/repos";
import { collectionsRouter } from "./routes/collections";
import { settingsRouter } from "./routes/settings";
import { reportsRouter } from "./routes/reports";
import { analysesRouter } from "./routes/analyses";
import { collectionDetailRouter } from "./routes/collection-detail";
import { categoriesRouter } from "./routes/categories";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin,
    credentials: true,
  }),
);

app.route("/api/repos", reposRouter);
app.route("/api/collections", collectionsRouter);
app.route("/api/collections", collectionDetailRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/analyses", analysesRouter);
app.route("/api/categories", categoriesRouter);

app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3000");

serve({
  fetch: app.fetch,
  port,
});

console.log(`✓ Server running on http://localhost:${port}`);

export default app;
