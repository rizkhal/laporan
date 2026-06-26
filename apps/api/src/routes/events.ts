import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, desc, or } from "drizzle-orm";
import { hashToken } from "../lib/crypto";
import { requireUser } from "../lib/auth";

const router = new Hono();

// ── SSE endpoint for real-time job + repo status updates ──
// Replaces polling in activity-center.tsx and Repositories.tsx
// Token is passed via query param because EventSource doesn't support custom headers.
router.get("/events", async (c) => {
  return streamSSE(c, async (stream) => {
    // ── Auth via query param token ──
    const token = c.req.query("token");
    if (!token) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: "Not authenticated" }),
      });
      await stream.close();
      return;
    }

    const hashedToken = hashToken(token);
    const session = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, hashedToken))
      .get();

    if (!session) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: "Invalid token" }),
      });
      await stream.close();
      return;
    }

    // Track previous state for diffing — only send on change
    let prevJobsJson = "";
    let prevReposJson = "";
    let eventId = 0;

    // Send initial connection confirmation
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ status: "ok" }),
      id: String(eventId++),
    });

    // ── Polling loop ──
    while (true) {
      try {
        // 1. Active jobs (queued / running)
        const activeJobs = db
          .select()
          .from(schema.jobs)
          .where(
            or(
              eq(schema.jobs.status, "queued"),
              eq(schema.jobs.status, "running"),
            ),
          )
          .orderBy(desc(schema.jobs.createdAt))
          .all();

        // 2. Recent completed / failed / cancelled jobs (last 10 for toast notifications)
        const recentJobs = db
          .select()
          .from(schema.jobs)
          .where(
            or(
              eq(schema.jobs.status, "completed"),
              eq(schema.jobs.status, "failed"),
              eq(schema.jobs.status, "cancelled"),
            ),
          )
          .orderBy(desc(schema.jobs.createdAt))
          .limit(10)
          .all();

        const jobsPayload = {
          active: activeJobs,
          recent: recentJobs,
        };
        const jobsJson = JSON.stringify(jobsPayload);

        if (jobsJson !== prevJobsJson) {
          await stream.writeSSE({
            event: "jobs",
            data: jobsJson,
            id: String(eventId++),
          });
          prevJobsJson = jobsJson;
        }

        // 3. Repos — only send when there are active clone operations
        const hasActiveRepo = db
          .select()
          .from(schema.repositories)
          .where(
            or(
              eq(schema.repositories.cloneStatus, "pending_clone"),
              eq(schema.repositories.cloneStatus, "cloning"),
              eq(schema.repositories.cloneStatus, "syncing"),
            ),
          )
          .limit(1)
          .all()
          .some(Boolean);

        if (hasActiveRepo) {
          const allRepos = db.select().from(schema.repositories).all();
          const reposJson = JSON.stringify(allRepos);
          if (reposJson !== prevReposJson) {
            await stream.writeSSE({
              event: "repos",
              data: reposJson,
              id: String(eventId++),
            });
            prevReposJson = reposJson;
          }
        } else if (prevReposJson) {
          // All repos are stable — clear tracking and send one final update
          const allRepos = db.select().from(schema.repositories).all();
          const reposJson = JSON.stringify(allRepos);
          if (reposJson !== prevReposJson) {
            await stream.writeSSE({
              event: "repos",
              data: reposJson,
              id: String(eventId++),
            });
          }
          prevReposJson = "";
        }
      } catch {
        // Poll iteration error — continue
      }

      // Wait 2s between polls (same as job-runner internal interval)
      try {
        await stream.sleep(2000);
      } catch {
        // Client disconnected — exit loop
        break;
      }
    }
  });
});

export { router as eventsRouter };
