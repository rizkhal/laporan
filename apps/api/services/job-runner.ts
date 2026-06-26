import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and, or } from "drizzle-orm";
import { cloneRepo, resolveRepoPath, pullRepo, cleanStaleClone } from "./git-clone";
import { collectRepoForCollection } from "./git-collector";
import { runAnalysisForRepo } from "./llm-analyzer";
import { generateReport } from "./report-formatter";
import { getStrategy } from "./report-strategies";
import { killGitExec } from "./git-exec";
import { exportToGoogleDocs } from "./google-docs-exporter";

// ── Types ──

export type JobType =
  | "clone_repository"
  | "refresh_repository"
  | "collect_commits"
  | "analyze_collection"
  | "generate_report"
  | "export_google_docs";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobPayload {
  repositoryId?: number;
  collectionId?: number;
  repoId?: number;
  llmProviderId?: number;
  style?: string;
  [key: string]: any;
}

// ── Queue Helpers ──

export function createJob(
  workspaceId: number,
  type: JobType,
  payload: JobPayload,
): typeof schema.jobs.$inferSelect {
  const result = db
    .insert(schema.jobs)
    .values({
      workspaceId,
      type,
      status: "queued",
      progress: 0,
      message: "",
      payload: JSON.stringify(payload),
    })
    .returning()
    .get();

  // Start the runner if it isn't already running
  ensureRunnerRunning();

  return result;
}

export function getActiveJobs(workspaceId: number) {
  return db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.workspaceId, workspaceId),
        or(
          eq(schema.jobs.status, "queued"),
          eq(schema.jobs.status, "running"),
        ),
      ),
    )
    .all();
}

export function getWorkspaceJobs(workspaceId: number, status?: string) {
  const conditions = [eq(schema.jobs.workspaceId, workspaceId)];
  if (status) {
    conditions.push(eq(schema.jobs.status, status as any));
  }
  return db
    .select()
    .from(schema.jobs)
    .where(and(...conditions))
    .orderBy(schema.jobs.createdAt)
    .all();
}

// Track spawned process execIds per job, so they can be killed on cancel
const jobExecIds = new Map<number, string[]>();

/**
 * Register an execId for a specific job.
 * When the job is cancelled, the associated git process will be killed.
 */
export function registerJobExecId(jobId: number, execId: string): void {
  const ids = jobExecIds.get(jobId) || [];
  ids.push(execId);
  jobExecIds.set(jobId, ids);
}

/**
 * Kill all git processes associated with a job.
 */
export function killJobProcesses(jobId: number): void {
  const ids = jobExecIds.get(jobId);
  if (ids) {
    for (const execId of ids) {
      killGitExec(execId);
    }
    jobExecIds.delete(jobId);
  }
}

// ── Job Runner ──

let runnerInterval: ReturnType<typeof setInterval> | null = null;
let running = false;

function ensureRunnerRunning() {
  if (runnerInterval) return;
  runnerInterval = setInterval(processNextJob, 2000);
}

function stopRunner() {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
  }
}

/**
 * On startup, reset stuck running jobs back to queued
 * so they get retried after a server restart.
 */
export function resetStuckJobs(): void {
  try {
    // Mark stuck running jobs as failed — don't re-queue them, because the
    // resources (git processes, repos, disk state) they referenced may no
    // longer be valid after a server restart.
    db.update(schema.jobs)
      .set({
        status: "failed",
        error: "Server restarted while this job was running. Please retry manually.",
        message: "Stale after restart",
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.jobs.status, "running"))
      .run();

    // Reset repos stuck in intermediate states back to connected
    db.update(schema.repositories)
      .set({ cloneStatus: "connected", updatedAt: new Date().toISOString() })
      .where(
        or(
          eq(schema.repositories.cloneStatus, "syncing" as any),
          eq(schema.repositories.cloneStatus, "cloning" as any),
        ),
      )
      .run();

    // Also reset repos stuck in pending_clone (if the server restarted before
    // the clone job ran) — they'll be picked up again if the user retries.
    // Keep them as pending_clone so the frontend can show "Pending Setup".
  } catch {
    // Jobs table might not exist yet (migration not run)
  }
}

async function processNextJob() {
  if (running) return;
  running = true;

  try {
    // Find next queued job
    const job = db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "queued"))
      .orderBy(schema.jobs.createdAt)
      .get();

    if (!job) {
      // No jobs pending — stop polling to save resources
      stopRunner();
      return;
    }

    // Mark running
    db.update(schema.jobs)
      .set({
        status: "running",
        startedAt: new Date().toISOString(),
        message: "Starting...",
      })
      .where(eq(schema.jobs.id, job.id))
      .run();

    let payload: JobPayload = {};
    try {
      payload = JSON.parse(job.payload || "{}");
    } catch {}

    try {
      await executeJob(job, payload);

      // Mark completed
      db.update(schema.jobs)
        .set({
          status: "completed",
          progress: 100,
          message: "Completed",
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.jobs.id, job.id))
        .run();
    } catch (err: any) {
      const errorMsg = err.message || "Unknown error";

      // Kill any remaining spawned processes for this job
      killJobProcesses(job.id);

      // If the error is about cancellation, mark as cancelled instead of failed
      if (errorMsg.includes("was cancelled")) {
        // Also reset the repo's cloneStatus if this was a repo-related job
        // This ensures the repo is not stuck in "cloning"/"syncing" state forever
        resetReposForCancelledJob(job);

        db.update(schema.jobs)
          .set({
            status: "cancelled",
            error: "Cancelled by user",
            message: "Cancelled",
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.jobs.id, job.id))
          .run();
      } else {
        // Mark failed
        db.update(schema.jobs)
          .set({
            status: "failed",
            error: errorMsg,
            message: errorMsg,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.jobs.id, job.id))
          .run();
      }
    } finally {
      // Clean up tracked execIds
      jobExecIds.delete(job.id);
    }
  } finally {
    running = false;
  }
}

/**
 * Check if a job has been cancelled by re-reading its current status from DB.
 */
function isJobCancelled(jobId: number): boolean {
  const current = db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .get();
  return current?.status === "cancelled";
}

/**
 * When a repo-related job is cancelled, reset the repository cloneStatus
 * so it doesn't stay stuck in "cloning" or "syncing" forever.
 */
function resetReposForCancelledJob(job: typeof schema.jobs.$inferSelect): void {
  if (job.type !== "clone_repository" && job.type !== "refresh_repository") return;
  try {
    const payload = JSON.parse(job.payload || "{}");
    const repoId = payload.repositoryId;
    if (!repoId) return;

    const repo = db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repoId))
      .get();

    if (!repo) return;

    if (job.type === "clone_repository") {
      // cleanStaleClone is already called inside executeJob before throwing;
      // just reset the status to failed so the user can retry
      db.update(schema.repositories)
        .set({ cloneStatus: "failed", cloneError: "Cancelled by user", updatedAt: new Date().toISOString() })
        .where(eq(schema.repositories.id, repoId))
        .run();
    } else if (job.type === "refresh_repository") {
      db.update(schema.repositories)
        .set({ cloneStatus: "connected", updatedAt: new Date().toISOString() })
        .where(eq(schema.repositories.id, repoId))
        .run();
    }
  } catch {
    // Payload parse error — ignore
  }
}

async function executeJob(
  job: typeof schema.jobs.$inferSelect,
  payload: JobPayload,
): Promise<void> {
  const updateProgress = (progress: number, message: string) => {
    // Re-check cancellation before each progress update
    if (isJobCancelled(job.id)) throw new Error("Job was cancelled");
    db.update(schema.jobs)
      .set({ progress, message, updatedAt: new Date().toISOString() })
      .where(eq(schema.jobs.id, job.id))
      .run();
  };

  switch (job.type) {
    case "clone_repository": {
      // Re-check cancellation before starting
      if (isJobCancelled(job.id)) throw new Error("Job was cancelled");
      updateProgress(10, "Preparing to clone...");
      const repo = payload.repositoryId
        ? db
            .select()
            .from(schema.repositories)
            .where(eq(schema.repositories.id, payload.repositoryId))
            .get()
        : null;

      if (!repo) throw new Error("Repository not found");

      // Re-check cancellation after DB read
      if (isJobCancelled(job.id)) {
        cleanStaleClone(job.workspaceId, repo.name);
        throw new Error("Job was cancelled");
      }

      // Update repo status to cloning
      db.update(schema.repositories)
        .set({ cloneStatus: "cloning" })
        .where(eq(schema.repositories.id, repo.id))
        .run();

      updateProgress(30, "Cloning repository...");

      const result = await cloneRepo(job.workspaceId, repo.remoteUrl, repo.name);

      // Re-check cancellation after clone completes
      if (isJobCancelled(job.id)) {
        cleanStaleClone(job.workspaceId, repo.name);
        throw new Error("Job was cancelled");
      }

      if (!result.success) {
        db.update(schema.repositories)
          .set({
            cloneStatus: "failed",
            cloneError: result.message,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.repositories.id, repo.id))
          .run();
        throw new Error(result.message);
      }

      updateProgress(90, "Finalizing...");

      // Update repo localPath in case it changed
      const localPath = resolveRepoPath(job.workspaceId, repo.name);
      db.update(schema.repositories)
        .set({
          cloneStatus: "connected",
          cloneError: null,
          localPath,
          lastClonedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.repositories.id, repo.id))
        .run();

      updateProgress(100, "Repository connected successfully.");
      break;
    }

    case "refresh_repository": {
      if (isJobCancelled(job.id)) throw new Error("Job was cancelled");
      updateProgress(20, "Pulling latest changes...");
      const refreshRepo = payload.repositoryId
        ? db
            .select()
            .from(schema.repositories)
            .where(eq(schema.repositories.id, payload.repositoryId))
            .get()
        : null;

      if (!refreshRepo) throw new Error("Repository not found");

      // Reset status to connected on success OR failure to avoid stuck "syncing"
      const resetRepoConnected = () => {
        db.update(schema.repositories)
          .set({ cloneStatus: "connected", updatedAt: new Date().toISOString() })
          .where(eq(schema.repositories.id, refreshRepo.id))
          .run();
      };

      try {
        const pullResult = await pullRepo(job.workspaceId, refreshRepo.localPath);
        if (!pullResult.success) {
          resetRepoConnected();
          throw new Error(pullResult.message);
        }
      } catch (err: any) {
        // On cancellation, don't reset (cancel handler handles it)
        if (err.message?.includes("was cancelled")) throw err;
        resetRepoConnected();
        throw err;
      }

      db.update(schema.repositories)
        .set({
          cloneStatus: "connected",
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.repositories.id, refreshRepo.id))
        .run();

      updateProgress(100, "Repository refreshed successfully.");
      break;
    }

    case "collect_commits": {
      if (isJobCancelled(job.id)) throw new Error("Job was cancelled");
      updateProgress(10, "Starting collection...");
      if (!payload.repositoryId || !payload.collectionId)
        throw new Error("Missing repositoryId or collectionId");

      updateProgress(30, "Collecting commits...");
      const count = await collectRepoForCollection(
        payload.repositoryId,
        payload.collectionId,
        job.workspaceId,
      );

      updateProgress(100, `Collected ${count} commits.`);
      break;
    }

    case "analyze_collection": {
      if (isJobCancelled(job.id)) throw new Error("Job was cancelled");
      updateProgress(10, "Starting analysis...");
      if (!payload.repositoryId || !payload.collectionId)
        throw new Error("Missing repositoryId or collectionId");

      updateProgress(30, "Analyzing commits...");
      await runAnalysisForRepo(
        payload.collectionId,
        payload.repositoryId,
        job.workspaceId,
        payload.llmProviderId,
      );

      updateProgress(100, "Analysis completed.");
      break;
    }

    case "generate_report": {
      if (isJobCancelled(job.id)) throw new Error("Job was cancelled");
      updateProgress(10, "Starting report generation...");
      if (!payload.collectionId) throw new Error("Missing collectionId");

      const style = (payload.style as string) || "office";

      updateProgress(40, "Compiling report data...");

      const strategy = getStrategy(style);
      if (!strategy) {
        throw new Error(`Unknown report style: "${style}"`);
      }

      await strategy.generate(
        payload.collectionId,
        job.workspaceId,
      );

      updateProgress(100, "Report generated successfully.");
      break;
    }

    case "export_google_docs": {
      if (isJobCancelled(job.id)) throw new Error("Job was cancelled");
      updateProgress(10, "Preparing Google Docs export...");

      if (!payload.reportId) throw new Error("Missing reportId");
      if (!payload.accessToken || !payload.refreshToken) throw new Error("Missing Google tokens");

      const reportRow = db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.id, payload.reportId))
        .get();

      if (!reportRow) throw new Error("Report not found");

      const documentTitle = payload.documentTitle || `Laporan Kemajuan Pekerjaan`;

      updateProgress(20, "Parsing document structure...");

      // Export using the pipeline exporter
      const result = await exportToGoogleDocs({
        accessToken: payload.accessToken as string,
        refreshToken: payload.refreshToken as string,
        documentTitle,
        markdownContent: reportRow.content,
        onProgress: (p) => {
          updateProgress(Math.max(20, Math.min(95, p.progress)), p.message);
        },
      });

      // Update report with Google Docs URL
      db.update(schema.reports)
        .set({
          googleDocId: result.documentId,
          googleDocUrl: result.documentUrl,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.reports.id, payload.reportId))
        .run();

      updateProgress(100, "Google Docs export completed.");
      break;
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

// Start the runner on module load
resetStuckJobs();
setTimeout(ensureRunnerRunning, 1000);
