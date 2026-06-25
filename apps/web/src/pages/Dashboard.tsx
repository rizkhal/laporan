import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/Button";
import { apiFetch } from "../lib/utils";
import {
  ArrowRight, Bot, Check, CircleDashed, FileText, FolderGit2,
  GitCommit, Plus, Sparkles,
} from "lucide-react";

interface Collection {
  id: number; title: string; year: number; month: number; status: string; createdAt: string;
}
interface Repo { id: number; name: string; }
interface Commit { id: number; repoId: number; }
interface Analysis { id: number; repoId: number; status: string; workItems: string; updatedAt: string; }
interface Report { id: number; title: string; updatedAt: string; }

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning"> = {
  draft: "secondary", collecting: "default", completed: "default",
  analyzing: "warning", analyzed: "warning", generating: "warning", generated: "success",
};

export default function Dashboard() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [repoData, collectionData] = await Promise.all([
          apiFetch<Repo[]>("/repos"),
          apiFetch<Collection[]>("/collections"),
        ]);
        setRepos(repoData);
        setCollections(collectionData);
        if (collectionData[0]) {
          const id = collectionData[0].id;
          const [commitData, analysisData, reportData] = await Promise.all([
            apiFetch<Commit[]>(`/collections/${id}/commits`).catch(() => []),
            apiFetch<Analysis[]>(`/analyses/collection/${id}`).catch(() => []),
            apiFetch<Report>(`/reports/${id}`).catch(() => null),
          ]);
          setCommits(commitData);
          setAnalyses(analysisData);
          setReport(reportData);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const workItemCount = useMemo(() => analyses.reduce((total, analysis) => {
    try { return total + JSON.parse(analysis.workItems || "[]").length; } catch { return total; }
  }, 0), [analyses]);

  const latest = collections[0];
  const analysisComplete = analyses.length > 0 && analyses.every((item) => item.status === "completed");
  const phase = report ? 4 : analysisComplete ? 3 : commits.length ? 2 : 1;

  if (loading) {
    return (
      <div className="space-y-7">
        <div className="skeleton h-9 w-64 rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-32 rounded-xl" />)}
        </div>
        <div className="skeleton h-72 rounded-xl" />
      </div>
    );
  }

  const kpis = [
    { label: "Tracked repositories", value: repos.length, detail: "active sources", icon: FolderGit2 },
    { label: "Commits collected", value: commits.length, detail: latest ? `in ${latest.title}` : "no active period", icon: GitCommit },
    { label: "Work items detected", value: workItemCount, detail: analyses.length ? `across ${analyses.length} analyses` : "analysis pending", icon: Sparkles },
    { label: "Report status", value: report ? "Ready" : analysisComplete ? "Pending" : "Blocked", detail: report ? "available to export" : "complete the prior phase", icon: FileText },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Engineering operations</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Monthly activity, at a glance</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Collect repository activity, validate AI findings, and publish an executive-ready report.
          </p>
        </div>
        <Button asChild>
          <Link to="/collections"><Plus className="size-4" /> New collection</Link>
        </Button>
      </section>

      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-sm text-destructive">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className="surface rounded-xl p-5">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
            </div>
            <p className="mt-5 font-mono text-3xl font-semibold tracking-[-0.04em]">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
        <div className="surface overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold tracking-[-0.02em]">Current reporting cycle</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{latest?.title || "No collection started"}</p>
            </div>
            {latest && <Badge variant={statusVariant[latest.status] || "secondary"}>{latest.status}</Badge>}
          </div>

          <div className="grid gap-0 sm:grid-cols-4">
            {[
              { name: "Collection", description: `${commits.length} commits`, icon: GitCommit },
              { name: "Analysis", description: `${workItemCount} findings`, icon: Bot },
              { name: "Report", description: report ? "Generated" : "Not generated", icon: FileText },
              { name: "Complete", description: report ? "Ready to share" : "Awaiting report", icon: Check },
            ].map((step, index) => {
              const done = phase > index + 1 || (index === 3 && !!report);
              const current = phase === index + 1;
              return (
                <div key={step.name} className="relative border-b p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                  <div className={done ? "text-emerald-600 dark:text-emerald-400" : current ? "text-primary" : "text-muted-foreground"}>
                    {done ? <Check className="size-4" /> : current ? <CircleDashed className="size-4" /> : <step.icon className="size-4" />}
                  </div>
                  <p className="mt-4 text-sm font-semibold">{step.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 bg-muted/35 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                {!latest ? "Create a collection to begin" : report ? "Review and export the report" : analysisComplete ? "Generate the monthly report" : commits.length ? "Run analysis on collected activity" : "Collect repository activity"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Recommended next action</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={latest ? `/collections/${latest.id}` : "/collections"}>
                Continue <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        <aside className="surface rounded-xl p-5">
          <h2 className="font-semibold tracking-[-0.02em]">Quick actions</h2>
          <div className="mt-4 space-y-2">
            {[
              { label: "Start monthly collection", detail: "Choose period and repositories", href: "/collections", icon: Plus },
              { label: "Manage repositories", detail: `${repos.length} repositories configured`, href: "/repositories", icon: FolderGit2 },
              { label: "Configure analysis", detail: "Models and provider settings", href: "/settings", icon: Bot },
            ].map(({ label, detail, href, icon: Icon }) => (
              <Link key={label} to={href} className="group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-muted">
                <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground"><Icon className="size-4" /></span>
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{detail}</span>
                </span>
                <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold tracking-[-0.02em]">Recent collections</h2>
            <p className="mt-1 text-xs text-muted-foreground">Latest reporting periods and their current phase</p>
          </div>
          <Link to="/collections" className="text-sm font-medium text-primary hover:underline">View all</Link>
        </div>
        <div className="surface overflow-hidden rounded-xl">
          {collections.length === 0 ? (
            <div className="p-10 text-center">
              <FolderGit2 className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">No collections yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Start the first reporting cycle to populate this workspace.</p>
            </div>
          ) : collections.slice(0, 5).map((collection, index) => (
            <Link key={collection.id} to={`/collections/${collection.id}`} className="flex items-center gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/40">
              <span className="grid size-10 place-items-center rounded-lg bg-muted font-mono text-xs font-semibold">{String(collection.month).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{collection.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Created {new Date(collection.createdAt).toLocaleDateString()}</p>
              </div>
              <Badge variant={statusVariant[collection.status] || "secondary"}>{collection.status}</Badge>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
