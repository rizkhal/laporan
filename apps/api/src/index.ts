import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env BEFORE any other module executes (dynamic imports are NOT hoisted)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// Dynamic imports ensure db/index.ts (which reads env at module level) runs AFTER dotenv
const [{ Hono }, { cors }, { HTTPException }, { serve }, { reposRouter },
  { collectionsRouter }, { settingsRouter }, { reportsRouter },
  { analysesRouter }, { collectionDetailRouter }, { authRouter },
  { workspacesRouter }, { jobsRouter }, { runMigration },
  { rateLimit }] = await Promise.all([
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
  import("./lib/rate-limiter"),
]);

// Run migration on startup (idempotent - safe to run every time)
runMigration();

const app = new Hono();

// ── Security headers middleware ──
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("X-XSS-Protection", "1; mode=block");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});

// ── CORS — allow known origins + common dev ports ──
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:4321",
  "http://localhost:3000",
  "http://localhost:1234",
].filter(Boolean) as string[];

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      // Allow same-origin requests (no Origin header)
      if (!origin) return "*";
      // Check against known origins
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    credentials: true,
  }),
);

// ── Global rate limiter: 100 requests per minute per IP ──
// Must come AFTER CORS so preflight OPTIONS always gets CORS headers.
const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  key: (req: any) =>
    req.header("x-forwarded-for") || req.header("x-real-ip") || "unknown",
  message: "Too many requests. Please slow down.",
  skip: (req: any) => req.method === "OPTIONS",
});
app.use("/api/*", globalRateLimit);

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
