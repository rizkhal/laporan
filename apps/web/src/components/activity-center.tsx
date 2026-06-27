import { useEffect, useState, useRef, useCallback } from "react";
import { apiFetch, apiUrl } from "../lib/utils";
import { cn } from "../lib/utils";
import { useToast } from "./toast";
import {
  Loader2, CheckCircle, XCircle, Clock, GitBranch,
  GitCommit, FileText, Brain, X, Trash2, StopCircle,
} from "lucide-react";

interface Job {
  id: number;
  workspaceId: number;
  type: string;
  status: string;
  progress: number;
  message: string;
  payload: string;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const jobIcons: Record<string, typeof GitBranch> = {
  clone_repository: GitBranch,
  refresh_repository: GitBranch,
  collect_commits: GitCommit,
  analyze_collection: Brain,
  generate_report: FileText,
};

const jobTypeLabels: Record<string, string> = {
  clone_repository: "Cloning repository",
  refresh_repository: "Refreshing repository",
  collect_commits: "Collecting commits",
  analyze_collection: "Analyzing commits",
  generate_report: "Generating report",
};

const jobTypeLabelsPast: Record<string, string> = {
  clone_repository: "Repository cloned",
  refresh_repository: "Repository refreshed",
  collect_commits: "Commits collected",
  analyze_collection: "Analysis completed",
  generate_report: "Report generated",
};

export function ActivityCenter() {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { addToast } = useToast();
  const lastCompletedRef = useRef<Set<number>>(new Set());
  const [acting, setActing] = useState<Set<number>>(new Set());

  // ── Initial fetch on mount ──
  const fetchJobs = useCallback(async () => {
    try {
      const [active, recent] = await Promise.all([
        apiFetch<Job[]>("/jobs/active"),
        apiFetch<Job[]>("/jobs?status=completed,failed,cancelled"),
      ]);
      setActiveJobs(active);
      setRecentJobs(recent.slice(0, 10));

      // Seed lastCompletedRef without showing toasts on initial load
      for (const job of recent) {
        if (job.status === "completed" || job.status === "failed") {
          lastCompletedRef.current.add(job.id);
        }
      }
    } catch {}
  }, []);

  // ── Initial fetch seeds lastCompletedRef → then establish SSE ──
  // This ordering prevents spurious toasts for jobs that were already completed
  // before the page was reloaded (race condition between fetch and SSE first event).
  useEffect(() => {
    let es: EventSource | null = null;

    async function init() {
      // 1. Fetch initial data (this seeds lastCompletedRef)
      await fetchJobs();

      // 2. Then set up SSE (ref is already seeded, so first SSE event won't trigger ghost toasts)
      const token = localStorage.getItem("auth_token");
      if (!token) return;

      es = new EventSource(apiUrl(`/events?token=${token}`));

      es.addEventListener("jobs", (e: MessageEvent) => {
        try {
          const { active, recent } = JSON.parse(e.data);
          setActiveJobs(active);
          setRecentJobs(recent.slice(0, 10));

          // Show toasts for newly completed/failed jobs only
          for (const job of recent) {
            if (!lastCompletedRef.current.has(job.id) && (job.status === "completed" || job.status === "failed")) {
              lastCompletedRef.current.add(job.id);
              addToast({
                type: job.status === "completed" ? "success" : "error",
                title: job.status === "completed"
                  ? (jobTypeLabelsPast[job.type] || job.type)
                  : `${jobTypeLabels[job.type] || job.type} failed`,
                description: job.status === "completed" ? job.message || undefined : job.error || job.message || undefined,
              });
            }
          }
        } catch {}
      });
    }

    init();

    return () => {
      if (es) es.close();
    };
  }, [addToast]); // fetchJobs is not a dep — it's called directly inside init

  async function cancelJob(jobId: number) {
    setActing((prev) => new Set(prev).add(jobId));
    try {
      await apiFetch(`/jobs/${jobId}/cancel`, { method: "POST" });
      addToast({ type: "success", title: "Job cancelled" });
      await fetchJobs();
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to cancel", description: err.message });
    } finally {
      setActing((prev) => { const next = new Set(prev); next.delete(jobId); return next; });
    }
  }

  async function deleteJob(jobId: number) {
    setActing((prev) => new Set(prev).add(jobId));
    try {
      await apiFetch(`/jobs/${jobId}`, { method: "DELETE" });
      addToast({ type: "success", title: "Job deleted" });
      await fetchJobs();
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to delete", description: err.message });
    } finally {
      setActing((prev) => { const next = new Set(prev); next.delete(jobId); return next; });
    }
  }

  async function clearRecent() {
    const toDelete = recentJobs.filter((j) => j.status === "completed" || j.status === "failed");
    if (toDelete.length === 0) return;
    setActing((prev) => new Set([...prev, ...toDelete.map((j) => j.id)]));
    try {
      await Promise.all(toDelete.map((j) => apiFetch(`/jobs/${j.id}`, { method: "DELETE" })));
      addToast({ type: "success", title: `Cleared ${toDelete.length} job${toDelete.length > 1 ? "s" : ""}` });
      await fetchJobs();
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to clear", description: err.message });
    } finally {
      setActing(new Set());
    }
  }

  const totalActive = activeJobs.length;
  const hasQueued = activeJobs.some((j) => j.status === "queued");

  // Click-outside handler
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative grid size-9 place-items-center rounded-lg transition-colors",
          totalActive > 0
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        aria-label={totalActive > 0 ? `${totalActive} active jobs` : "Activity"}
      >
        {totalActive > 0 ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Clock className="size-4" />
        )}
        {totalActive > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-primary px-1 py-0.5 text-[9px] font-bold text-primary-foreground leading-none">
            {totalActive}
          </span>
        )}
      </button>

      {open && (
        <div ref={dropdownRef} className="absolute right-0 top-full z-50 mt-1.5 w-96 overflow-hidden rounded-xl border border-border bg-popover shadow-xl shadow-popover/15">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Activity</p>
              {totalActive > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalActive} job{totalActive > 1 ? "s" : ""} running
                  {hasQueued && ` (${activeJobs.filter((j) => j.status === "queued").length} queued)`}
                </p>
              )}
            </div>
            {recentJobs.length > 0 && (
              <button
                type="button"
                onClick={clearRecent}
                disabled={acting.size > 0}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <Trash2 className="size-3" />
                Clear recents
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto p-1.5">
            {activeJobs.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Running
                </p>
                {activeJobs.map((job) => (
                  <JobItem
                    key={job.id}
                    job={job}
                    acting={acting.has(job.id)}
                    onCancel={() => cancelJob(job.id)}
                  />
                ))}
              </>
            )}

            {recentJobs.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent
                </p>
                {recentJobs.map((job) => (
                  <JobItem
                    key={job.id}
                    job={job}
                    acting={acting.has(job.id)}
                    onDelete={() => deleteJob(job.id)}
                  />
                ))}
              </>
            )}

            {activeJobs.length === 0 && recentJobs.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Clock className="mx-auto size-6 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JobItem({
  job,
  acting,
  onCancel,
  onDelete,
}: {
  job: Job;
  acting: boolean;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const Icon = jobIcons[job.type] || FileText;
  const isRunning = job.status === "running";
  const isQueued = job.status === "queued";
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";
  const isCancelled = job.status === "cancelled";
  const label = jobTypeLabels[job.type] || job.type;
  const canCancel = isQueued || isRunning;
  const canDelete = isCompleted || isFailed || isCancelled;

  return (
    <div className="group flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-muted">
      <span className="mt-0.5 shrink-0">
        {isRunning && <Loader2 className="size-4 animate-spin text-primary" />}
        {isQueued && <Clock className="size-4 text-muted-foreground" />}
        {isCompleted && <CheckCircle className="size-4 text-emerald-500" />}
        {isFailed && <XCircle className="size-4 text-red-500" />}
        {isCancelled && <StopCircle className="size-4 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">
            {(isCompleted || isCancelled) ? (jobTypeLabelsPast[job.type] || label) : label}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-medium text-muted-foreground">
              {isQueued && "Queued"}
              {isRunning && `${job.progress}%`}
              {isCompleted && "Done"}
              {isFailed && "Failed"}
              {isCancelled && "Cancelled"}
            </span>
            {canCancel && onCancel && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                disabled={acting}
                className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100 disabled:opacity-30"
                title="Cancel"
              >
                {acting ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
              </button>
            )}
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={acting}
                className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100 disabled:opacity-30"
                title="Delete"
              >
                {acting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              </button>
            )}
          </div>
        </div>
        {isRunning && job.message && (
          <p className="truncate text-xs text-muted-foreground mt-0.5">{job.message}</p>
        )}
        {isRunning && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
        {(isFailed || isCancelled) && job.error && (
          <p className="truncate text-xs text-red-500 mt-0.5">{job.error}</p>
        )}
      </div>
    </div>
  );
}
