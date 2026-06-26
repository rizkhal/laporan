import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env BEFORE any other module executes (dynamic imports are NOT hoisted)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// Dynamic imports ensure db/index.ts (which reads env at module level) runs AFTER dotenv
const [{ Hono }, { cors }, { HTTPException }, { serve }, { reposRouter },
  { collectionsRouter }, { settingsRouter }, { reportsRouter },
  { analysesRouter }, { collectionDetailRouter }, { authRouter },
  { workspacesRouter }, { jobsRouter }, { runMigration }] = await Promise.all([
  import("hono"),
  import("hono/cors"),
  import("hono/http-exception"),
  import("@hono/node-server"),
  import("./routes/repos"),
  import("./routes/collections"),
  import("./routes/settings"),
  import("./routes/reports"),
  import("./routes/analyses"),
  import("./routes/collection-detail"),
  import("./routes/auth"),
  import("./routes/workspaces"),
	  import("./routes/jobs"),
	  import("./db/migrate-workspaces"),
]);

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
app.route("/api/jobs", jobsRouter);

app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3000");

serve({
  fetch: app.fetch,
  port,
});

console.log(`✅ Server running on http://localhost:${port}`);

export default app;
