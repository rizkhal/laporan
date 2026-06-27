import { useToast } from "../components/toast";
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { apiFetch, apiUrl, getActiveWorkspaceId } from "../lib/utils";
import {
  ArrowLeft, ArrowRight, Bot, Check, ChevronDown, ChevronRight, Clipboard,
  Columns2, FileCode2, FileText, GitBranch, GitCommit,
  Globe, Loader2, Lock, Monitor, Pencil, Save, Settings2, Share2, Sparkles, FileDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/Input";

interface Collection { id: number; year: number; month: number; title: string; status: string; repoIds: number[] | null; }
interface Commit {
  id: number; repoId: number; hash: string; authorName: string; date: string; message: string;
  filesChanged: number; insertions: number; deletions: number; patchSnippets: string; changedFiles: string;
}
interface Analysis {
  id: number; repoId: number; status: string; workItems: string; category: string;
  summary: string; impact: string; risks: string; nextSuggestions: string; isEdited: boolean; error: string;
}
interface Report { id: number; title: string; content: string; style?: string; isEdited: boolean; updatedAt?: string; }
interface Repo { id: number; name: string; }
interface LlmProvider { id: number; name: string; model: string; }

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return JSON.parse(value || "") as T; } catch { return fallback; }
}

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary", collecting: "default", completed: "default",
  analyzing: "warning", analyzed: "warning", generating: "warning", generated: "success",
};

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const collectionId = Number(id);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedLlmId, setSelectedLlmId] = useState<number | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
  const [expandedCommit, setExpandedCommit] = useState<number | null>(null);
  const [reportDraft, setReportDraft] = useState("");
  const [reportMode, setReportMode] = useState<"split" | "preview">("split");
  const [copied, setCopied] = useState(false);
  const [reportStyle, setReportStyle] = useState<string>("office");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"collect" | "analyze" | "report" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoEditOpen, setRepoEditOpen] = useState(false);
  const [editRepoIds, setEditRepoIds] = useState<number[] | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareInfo, setShareInfo] = useState<{ slug: string; visibility: string; url: string } | null>(null);
  const [shareVisibility, setShareVisibility] = useState<"public" | "protected">("public");
  const [sharePassword, setSharePassword] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
    const [downloadOpen, setDownloadOpen] = useState(false);
    const downloadRef = useRef<HTMLDivElement>(null);
    const { addToast, removeToast } = useToast();

    // Close download dropdown on outside click
    useEffect(() => {
      if (!downloadOpen) return;
      const handleClick = (e: MouseEvent) => {
        if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) {
          setDownloadOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, [downloadOpen]);

  async function loadAll() {
    try {
      setLoading(true);
      const [collectionData, repoData, commitData, analysisData, providerData, reportData] = await Promise.all([
        apiFetch<Collection>(`/collections/${collectionId}`),
        apiFetch<Repo[]>("/repos"),
        apiFetch<Commit[]>(`/collections/${collectionId}/commits`),
        apiFetch<Analysis[]>(`/analyses/collection/${collectionId}`).catch(() => []),
        apiFetch<LlmProvider[]>("/settings/llm").catch(() => []),
        apiFetch<Report>(`/reports/${collectionId}`).catch(() => null),
      ]);
      setCollection(collectionData);
      setRepos(repoData);
      setCommits(commitData);
      setAnalyses(analysisData);
      setProviders(providerData);
      setReport(reportData);
      setReportDraft(reportData?.content || "");
      if (reportData?.style) setReportStyle(reportData.style);
      if (!selectedRepo) {
        const firstRepo = collectionData?.repoIds
          ? repoData.find((r) => collectionData.repoIds?.includes(r.id))
          : repoData[0];
        if (firstRepo) setSelectedRepo(firstRepo.id);
      }
      if (!selectedLlmId && providerData[0]) setSelectedLlmId(providerData[0].id);
      setEditRepoIds(collectionData.repoIds);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [collectionId]);

  async function runAction(action: "collect" | "analyze" | "report") {
    try {
      setBusy(action);
      setError(null);
      if (action === "collect") await apiFetch(`/collections/${collectionId}/collect`, { method: "POST" });
      if (action === "analyze") await apiFetch(`/collections/${collectionId}/analyze`, { method: "POST", body: JSON.stringify({ llmProviderId: selectedLlmId }) });
      if (action === "report") await apiFetch(`/reports/${collectionId}/generate`, { method: "POST", body: JSON.stringify({ llmProviderId: selectedLlmId, style: reportStyle }) });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function collectRepo(repoId: number) {
    try {
      setBusy("collect");
      await apiFetch(`/collections/${collectionId}/collect`, { method: "POST", body: JSON.stringify({ repoId }) });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function analyzeRepo(repoId: number) {
    try {
      setBusy("analyze");
      await apiFetch(`/collections/${collectionId}/analyze`, { method: "POST", body: JSON.stringify({ repoId, llmProviderId: selectedLlmId }) });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveReport() {
    if (!report) return;
    const loadingId = addToast({ type: 'loading', title: 'Saving report...' });
    try {
      setBusy("save");
      const updated = await apiFetch<Report>(`/reports/${report.id}`, { method: "PUT", body: JSON.stringify({ content: reportDraft }) });
      setReport(updated);
      removeToast(loadingId);
      addToast({ type: 'success', title: 'Saved', description: 'Report saved successfully' });
    } catch (err: any) {
      setError(err.message);
      removeToast(loadingId);
      addToast({ type: 'error', title: 'Save failed', description: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveRepos() {
    if (!collection) return;
    try {
      setBusy("save");
      await apiFetch(`/collections/${collectionId}`, {
        method: "PUT",
        body: JSON.stringify({ repoIds: editRepoIds }),
      });
      setCollection({ ...collection, repoIds: editRepoIds });
      setRepoEditOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // ── Share link ──
  async function loadShareInfo() {
    if (!report) return;
    try {
      const data = await apiFetch<{ slug: string; visibility: string; url: string } | null>(`/reports/${collectionId}/share`);
      setShareInfo(data);
      if (data) {
        setShareVisibility(data.visibility as "public" | "protected");
      }
    } catch {}
  }

  async function handleShare() {
    if (!report) return;
    try {
      setShareBusy(true);
      const data = await apiFetch<{ slug: string; visibility: string; url: string }>(`/reports/${collectionId}/share`, {
        method: "POST",
        body: JSON.stringify({
          visibility: shareVisibility,
          password: shareVisibility === "protected" ? sharePassword : undefined,
        }),
      });
      setShareInfo(data);
      addToast({ type: "success", title: "Share link created" });
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to create share link", description: err.message });
    } finally {
      setShareBusy(false);
    }
  }

  async function handleDeleteShare() {
    try {
      setShareBusy(true);
      await apiFetch(`/reports/${collectionId}/share`, { method: "DELETE" });
      setShareInfo(null);
      setSharePassword("");
      addToast({ type: "success", title: "Share link deleted" });
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to delete share link", description: err.message });
    } finally {
      setShareBusy(false);
    }
  }

  // Load share info when report becomes available
  useEffect(() => {
    if (report) loadShareInfo();
  }, [report?.id]);

  const shareUrl = shareInfo ? `${window.location.origin}/share/${shareInfo.slug}` : "";





  const repoMap = useMemo(() => new Map(repos.map((repo) => [repo.id, repo])), [repos]);
  const selectedCommits = commits.filter((commit) => !selectedRepo || commit.repoId === selectedRepo);
  const totalFiles = commits.reduce((total, commit) => total + commit.filesChanged, 0);
  const totalInsertions = commits.reduce((total, commit) => total + commit.insertions, 0);
  const totalDeletions = commits.reduce((total, commit) => total + commit.deletions, 0);
  const workItems = analyses.flatMap((analysis) =>
    parseJson<any[]>(analysis.workItems, []).map((item, index) => ({ ...item, analysisId: analysis.id, repoId: analysis.repoId, key: `${analysis.id}-${index}` }))
  );
  const analysisComplete = analyses.length > 0 && analyses.every((analysis) => analysis.status === "completed");
  const currentPhase = report ? 3 : analysisComplete ? 2 : 1;

  // Only show repos that belong to this collection
  const collectionRepos = collection?.repoIds
    ? repos.filter(r => collection.repoIds?.includes(r.id))
    : repos;

  if (loading) {
    return <div className="space-y-5"><div className="skeleton h-10 w-72 rounded-lg" /><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-96 rounded-xl" /></div>;
  }
  if (!collection) return <div className="py-20 text-center text-sm text-muted-foreground">Collection not found.</div>;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <button type="button" onClick={() => navigate("/collections")} className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Collections
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">{collection.title}</h1>
            <Badge variant={statusVariant[collection.status] || "secondary"}>{collection.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Reporting period {collection.year}-{String(collection.month).padStart(2, "0")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {providers.length > 0 && (
            <select value={selectedLlmId || ""} onChange={(event) => setSelectedLlmId(Number(event.target.value))} className="h-9 rounded-lg border border-input bg-card px-3 text-xs text-foreground shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-none">
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} ({provider.model})</option>)}
            </select>
          )}
          <Button variant="outline" onClick={() => runAction("collect")} disabled={!!busy}>
            {busy === "collect" ? <Loader2 className="animate-spin" /> : <GitCommit />} Collect
          </Button>
          <Button variant="outline" onClick={() => runAction("analyze")} disabled={!!busy || commits.length === 0}>
            {busy === "analyze" ? <Loader2 className="animate-spin" /> : <Sparkles />} Analyze
          </Button>
          <select value={reportStyle} onChange={(e) => setReportStyle(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-xs text-foreground shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-none">
            <option value="simple">Simple Report</option>
            <option value="executive">Executive Summary</option>
            <option value="office">Office Report</option>
          </select>
          <Button onClick={() => runAction("report")} disabled={!!busy || analyses.length === 0}>
            {busy === "report" ? <Loader2 className="animate-spin" /> : <FileText />} Generate report
          </Button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-sm text-destructive">{error}</div>}

      <section className="surface rounded-xl p-4">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { label: "Collection", detail: `${commits.length} commits captured`, complete: commits.length > 0 },
            { label: "Analysis", detail: `${workItems.length} work items detected`, complete: analysisComplete },
            { label: "Report", detail: report ? "Generated and editable" : "Waiting for generation", complete: !!report },
          ].map((phase, index) => (
            <div key={phase.label} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${currentPhase === index + 1 ? "bg-primary/7" : "bg-muted/40"}`}>
              <span className={`grid size-7 place-items-center rounded-full ${phase.complete ? "bg-success/15 text-success-foreground" : currentPhase === index + 1 ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"}`}>
                {phase.complete ? <Check className="size-3.5" /> : <span className="font-mono text-xs">{index + 1}</span>}
              </span>
              <div><p className="text-sm font-semibold">{phase.label}</p><p className="text-xs text-muted-foreground">{phase.detail}</p></div>
              {index < 2 && <ArrowRight className="ml-auto hidden size-4 text-muted-foreground md:block" />}
            </div>
          ))}
        </div>
      </section>

      <Tabs defaultValue={report ? "report" : analysisComplete ? "analysis" : "collection"}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="collection">Collection</TabsTrigger>
          <TabsTrigger value="analysis">Analysis <span className="ml-1 font-mono text-[10px]">{workItems.length}</span></TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>

        <TabsContent value="collection" className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Commits" value={commits.length} icon={GitCommit} />
            <Metric label="Files changed" value={totalFiles} icon={FileCode2} />
            <Metric label="Insertions" value={`+${totalInsertions}`} tone="positive" icon={ArrowRight} />
            <Metric label="Deletions" value={`-${totalDeletions}`} tone="negative" icon={ArrowRight} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[280px_1fr] items-start">
            <aside className="surface sticky top-24 rounded-xl p-3">
              <div className="flex items-center justify-between px-2 pb-2">
                <p className="text-xs font-medium text-muted-foreground">Repository summaries</p>
                <button type="button" onClick={() => { setEditRepoIds(collection?.repoIds ?? null); setRepoEditOpen(true); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Settings2 className="size-3" />
                </button>
              </div>
              <div className="space-y-1">
                {(collection?.repoIds ? repos.filter((r) => collection.repoIds?.includes(r.id)) : repos).filter(Boolean).map((repo) => {
                  const repoCommits = commits.filter((commit) => commit.repoId === repo.id);
                  const insertions = repoCommits.reduce((total, commit) => total + commit.insertions, 0);
                  const deletions = repoCommits.reduce((total, commit) => total + commit.deletions, 0);
                  return (
                    <button key={repo.id} type="button" onClick={() => setSelectedRepo(repo.id)} className={`w-full rounded-xl p-3 text-left transition-colors ${selectedRepo === repo.id ? "bg-primary/8" : "hover:bg-muted"}`}>
                      <div className="flex items-center gap-2"><GitBranch className="size-3.5 text-muted-foreground" /><span className="truncate text-sm font-semibold">{repo.name}</span><span className="ml-auto font-mono text-xs">{repoCommits.length}</span></div>
                      <div className="mt-2 flex gap-3 font-mono text-[10px] text-muted-foreground"><span className="text-success-foreground">+{insertions}</span><span className="text-destructive">-{deletions}</span></div>
                      <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); collectRepo(repo.id); }}
                          disabled={busy === "collect"}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {busy === "collect" ? <Loader2 className="size-3 animate-spin" /> : <GitCommit className="size-3" />}
                          Collect
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); analyzeRepo(repo.id); }}
                          disabled={busy === "analyze" || repoCommits.length === 0}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {busy === "analyze" ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          Analyze
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="surface overflow-hidden rounded-xl">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div><h2 className="font-semibold">{repoMap.get(selectedRepo || 0)?.name || "Commits"}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selectedCommits.length} commits in this reporting period</p></div>
                <GitCommit className="size-4 text-muted-foreground" />
              </div>
              {selectedCommits.length === 0 ? (
                <div className="px-6 py-16 text-center"><GitCommit className="mx-auto size-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium">No commits collected</p><p className="mt-1 text-xs text-muted-foreground">Run collection to populate this repository.</p></div>
              ) : selectedCommits.map((commit) => (
                <article key={commit.id} className="border-b last:border-b-0">
                  <button type="button" onClick={() => setExpandedCommit(expandedCommit === commit.id ? null : commit.id)} className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/35">
                    {expandedCommit === commit.id ? <ChevronDown className="mt-0.5 size-4 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{commit.message}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <code className="font-mono text-[11px]">{commit.hash.slice(0, 8)}</code><span>{commit.authorName}</span><span>{new Date(commit.date).toLocaleDateString()}</span><span>{commit.filesChanged} files</span>
                        <span className="font-mono text-success-foreground">+{commit.insertions}</span><span className="font-mono text-destructive">-{commit.deletions}</span>
                      </div>
                    </div>
                  </button>
                  {expandedCommit === commit.id && <CommitEvidence commit={commit} />}
                </article>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-5">
          {workItems.length === 0 ? (
            <EmptyState icon={Bot} title="Analysis has not run" description="Collect commits first, then run AI analysis to identify work and supporting evidence.">
              <Button onClick={() => runAction("analyze")} disabled={!!busy || commits.length === 0}>{busy === "analyze" ? <Loader2 className="animate-spin" /> : <Sparkles />} Run analysis</Button>
            </EmptyState>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
              <div className="space-y-4">
                {workItems.map((item) => <WorkItemCard key={item.key} item={item} repoName={repoMap.get(item.repoId)?.name || "Unknown repository"} />)}
              </div>
              <aside className="space-y-4">
                <div className="surface rounded-xl p-5">
                  <p className="text-xs font-medium text-muted-foreground">Analysis coverage</p>
                  <p className="mt-3 font-mono text-3xl font-semibold">{analyses.filter((item) => item.status === "completed").length}<span className="text-base text-muted-foreground">/{collectionRepos.length}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">repositories analyzed</p>
                  <div className="mt-4 space-y-2">
                    {collectionRepos.map((repo) => {
                      const analysis = analyses.find((item) => item.repoId === repo.id);
                      return <div key={repo.id} className="flex items-center gap-2 text-xs"><span className={`size-1.5 rounded-full ${analysis?.status === "completed" ? "bg-success" : "bg-muted-foreground/30"}`} /><span className="truncate">{repo.name}</span><span className="ml-auto text-muted-foreground">{analysis?.status || "pending"}</span></div>;
                    })}
                  </div>
                </div>
                <div className="surface rounded-xl p-5">
                  <h3 className="text-sm font-semibold">Repository findings</h3>
                  <div className="mt-4 space-y-4">
                    {analyses.map((analysis) => (
                      <div key={analysis.id}>
                        <p className="text-xs font-semibold">{repoMap.get(analysis.repoId)?.name}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{analysis.summary || "No summary returned."}</p>
                        {analysis.status !== "completed" && <Button className="mt-2" size="sm" variant="outline" onClick={() => analyzeRepo(analysis.repoId)}>Retry</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </TabsContent>

        <TabsContent value="report" className="mt-5">
          {!report ? (
            <div className="mx-auto max-w-lg space-y-6 py-10">
              <div className="text-center">
                <FileText className="mx-auto size-10 text-muted-foreground/30" />
                <h3 className="mt-4 text-lg font-semibold">Generate a report</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose a style, then generate your monthly report.</p>
              </div>
              <div className="flex justify-center">
                <select value={reportStyle} onChange={(e) => setReportStyle(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-xs text-foreground shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-none">
                  <option value="simple">Simple Report</option>
                  <option value="executive">Executive Summary</option>
                  <option value="office">Office Report</option>
                </select>
              </div>
              <div className="flex justify-center">
                <Button onClick={() => runAction("report")} disabled={!!busy || analyses.length === 0} className="min-w-[200px]">
                  {busy === "report" ? <Loader2 className="animate-spin" /> : <FileText />} Generate report
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold tracking-[-0.02em]">Report editor</h2><p className="mt-0.5 text-xs text-muted-foreground">{report.isEdited ? "Edited manually" : "Generated from analysis"}</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setReportMode((mode) => mode === "split" ? "preview" : "split")}>{reportMode === "split" ? <Monitor className="size-3.5" /> : <Columns2 className="size-3.5" />} {reportMode === "split" ? "Preview only" : "Split view"}</Button>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(reportDraft); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check className="size-3.5 text-success-foreground" /> : <Clipboard />} {copied ? "Copied!" : "Copy"}</Button>
                  <div ref={downloadRef} className="relative">
                                      <Button size="sm" variant="outline" onClick={() => setDownloadOpen((o) => !o)}>
                                        <FileDown className="size-3.5" /> Download <ChevronDown className="size-3" />
                                      </Button>
                                      {downloadOpen && (
                                        <div className="absolute right-0 top-full mt-1 min-w-[180px] overflow-hidden rounded-xl border bg-card shadow-xl shadow-black/10 dark:shadow-black/30 z-50">
                                          <button type="button" onClick={async () => {
                                                                                      setDownloadOpen(false);
                                                                                      if (!report) return;
                                                                                      const loadingId = addToast({ type: 'loading', title: 'Downloading markdown...' });
                                                                                      try {
                                                                                        const token = localStorage.getItem('auth_token');
                                                                                        const wsId = getActiveWorkspaceId();
                                                                                        const res = await fetch(apiUrl(`/reports/${report.id}/download/markdown`), {
                                                                                          headers: { 'Authorization': `Bearer ${token}`, ...(wsId ? { 'X-Workspace-Id': String(wsId) } : {}) },
                                                                                        });
                                                                                        if (!res.ok) { removeToast(loadingId); const body = await res.text().catch(()=>''); addToast({ type: 'error', title: 'Download failed', description: body || res.statusText }); return; }
                                                                                        const blob = await res.blob();
                                                                                        const url = URL.createObjectURL(blob);
                                                                                        const a = document.createElement('a');
                                                                                        a.href = url; a.download = `laporan-kemajuan-pekerjaan-${collection?.title || 'report'}.md`;
                                                                                        document.body.appendChild(a); a.click();
                                                                                        a.remove(); URL.revokeObjectURL(url);
                                                                                        removeToast(loadingId);
                                                                                        addToast({ type: 'success', title: 'Downloaded', description: 'Markdown file downloaded' });
                                                                                      } catch (e) { removeToast(loadingId); addToast({ type: 'error', title: 'Download failed', description: String(e) }); }
                                                                                    }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl">
                                            <FileCode2 className="size-3.5" /> Markdown (.md)
                                          </button>
                                          <div className="h-px bg-border" />
                                          <button type="button" onClick={async () => {
                                                                                      setDownloadOpen(false);
                                                                                      if (!report) return;
                                                                                      const loadingId = addToast({ type: 'loading', title: 'Downloading DOCX...' });
                                                                                      try {
                                                                                        const token = localStorage.getItem('auth_token');
                                                                                        const wsId = getActiveWorkspaceId();
                                                                                        const res = await fetch(apiUrl(`/reports/${report.id}/export.docx`), {
                                                                                          headers: { 'Authorization': `Bearer ${token}`, ...(wsId ? { 'X-Workspace-Id': String(wsId) } : {}) },
                                                                                        });
                                                                                        if (!res.ok) { removeToast(loadingId); const body = await res.text().catch(()=>''); addToast({ type: 'error', title: 'Download failed', description: body || res.statusText }); return; }
                                                                                        const blob = await res.blob();
                                                                                        const url = URL.createObjectURL(blob);
                                                                                        const a = document.createElement('a');
                                                                                        a.href = url; a.download = `laporan-kemajuan-pekerjaan-${collection?.title || 'report'}.docx`;
                                                                                        document.body.appendChild(a); a.click();
                                                                                        a.remove(); URL.revokeObjectURL(url);
                                                                                        removeToast(loadingId);
                                                                                        addToast({ type: 'success', title: 'Downloaded', description: 'DOCX file downloaded' });
                                                                                      } catch (e) { removeToast(loadingId); addToast({ type: 'error', title: 'Download failed', description: String(e) }); }
                                                                                    }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl">
                                            <FileDown className="size-3.5" /> Word (.docx)
                                          </button>
                                        </div>
                                      )}
                                    </div>
                  <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}><Share2 className="size-3.5" /> Share</Button>
                  <Button size="sm" onClick={saveReport} disabled={busy === "save" || reportDraft === report.content}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save</Button>
                </div>
              </div>
              <div className={`grid min-h-[680px] overflow-hidden rounded-xl border bg-card ${reportMode === "split" ? "lg:grid-cols-2" : ""}`}>
                {reportMode === "split" && (
                  <div className="flex min-h-[680px] flex-col border-b lg:border-b-0 lg:border-r">
                    <div className="flex h-11 items-center border-b px-4 text-xs font-medium text-muted-foreground"><Pencil className="mr-2 size-3.5" /> Markdown</div>
                    <textarea value={reportDraft} onChange={(event) => setReportDraft(event.target.value)} className="min-h-0 flex-1 resize-none bg-card p-6 font-mono text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground dark:bg-black/15" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="sticky top-0 flex h-11 items-center border-b bg-card px-4 text-xs font-medium text-muted-foreground"><FileText className="mr-2 size-3.5" /> Preview</div>
                  <article className="report-prose mx-auto max-w-3xl px-7 py-10 sm:px-12">{renderMarkdown(reportDraft)}</article>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit repos dialog */}
      <Dialog open={repoEditOpen} onOpenChange={setRepoEditOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Edit repositories</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <button type="button" onClick={() => setEditRepoIds(null)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${editRepoIds === null ? "border-primary/40 bg-primary/5" : "hover:bg-muted"}`}>
              <GitBranch className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">All enabled repositories</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{repos.length}</span>
            </button>
            <div className="grid max-h-52 gap-2 overflow-y-auto">
              {repos.map((repo) => {
                const checked = editRepoIds?.includes(repo.id) || false;
                return (
                  <label key={repo.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
                    <input type="checkbox" checked={checked} onChange={() => setEditRepoIds((current) => current === null ? [repo.id] : checked ? current.filter((id) => id !== repo.id) : [...current, repo.id])} className="size-4 rounded border-input bg-card" />
                    <span className="text-sm">{repo.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRepoEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveRepos} disabled={busy === "save" || editRepoIds?.length === 0}>
                {busy === "save" && <Loader2 className="animate-spin" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Share report</DialogTitle>
            <DialogDescription className="text-xs">Create a public link to share this report with others.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {shareInfo ? (
              <>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-medium text-muted-foreground">Share URL</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg bg-muted px-2 py-1 font-mono text-xs">{shareUrl}</code>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}>
                      {shareCopied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                  {shareInfo.visibility === "protected" ? <Lock className="size-4 text-muted-foreground" /> : <Globe className="size-4 text-muted-foreground" />}
                  <span className="text-sm text-muted-foreground">{shareInfo.visibility === "protected" ? "Password protected" : "Public"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDeleteShare} disabled={shareBusy}>Delete link</Button>
                  <Button size="sm" onClick={() => { setShareOpen(false); }}>Close</Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShareVisibility("public")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm ${shareVisibility === "public" ? "border-primary/40 bg-primary/5 font-medium" : "hover:bg-muted"}`}>
                    <Globe className="size-4" /> Public
                  </button>
                  <button type="button" onClick={() => setShareVisibility("protected")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm ${shareVisibility === "protected" ? "border-primary/40 bg-primary/5 font-medium" : "hover:bg-muted"}`}>
                    <Lock className="size-4" /> Protected
                  </button>
                </div>
                {shareVisibility === "protected" && (
                  <div className="space-y-2">
                    <Label htmlFor="share-password">Password</Label>
                    <Input id="share-password" type="password" placeholder="Enter a password" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button>
                  <Button onClick={handleShare} disabled={shareBusy || (shareVisibility === "protected" && !sharePassword)}>
                    {shareBusy ? <Loader2 className="animate-spin" /> : <Share2 className="size-4" />} Generate link
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof GitCommit; tone?: "positive" | "negative" }) {
  return <div className="surface rounded-xl p-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" /></div><p className={`mt-5 font-mono text-2xl font-semibold ${tone === "positive" ? "text-success-foreground" : tone === "negative" ? "text-destructive" : ""}`}>{value}</p></div>;
}

function CommitEvidence({ commit }: { commit: Commit }) {
  const files = parseJson<string[]>(commit.changedFiles, []);
  const snippets = parseJson<{ file: string; patch: string }[]>(commit.patchSnippets, []);
  return (
    <div className="border-t bg-muted/20 px-5 py-5">
      <div className="flex flex-wrap gap-1.5">{files.map((file) => <Badge key={file} variant="outline" className="font-mono font-normal">{file}</Badge>)}</div>
      <div className="mt-4 space-y-3">
        {snippets.slice(0, 4).map((snippet) => (
          <details key={snippet.file} className="overflow-hidden rounded-xl border bg-card dark:border-white/[0.07] dark:bg-white/[0.025]">
            <summary className="cursor-pointer px-4 py-3 font-mono text-xs font-medium">{snippet.file}</summary>
            <pre className="diff-block max-h-80 overflow-auto border-t p-4 font-mono text-[11px] leading-5">
              {snippet.patch.split("\n").map((line, index) => <span key={index} className={`block ${line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-del" : line.startsWith("@@") ? "diff-hunk" : ""}`}>{line || " "}</span>)}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}

function WorkItemCard({ item, repoName }: { item: any; repoName: string }) {
  const title = item.judul || item.title || "Untitled finding";
  const description = item.deskripsi || item.description || "";
  const impact = item.dampak || item.impact || "low";
  const confidence = item.keyakinan || item.confidence || "medium";
  const category = item.kategori || item.category || "other";
  const evidence = item.bukti || item.evidence || [];
  const confidenceVariant = ["tinggi", "high"].includes(String(confidence).toLowerCase()) ? "success" : "secondary";
  const impactVariant = ["tinggi", "high"].includes(String(impact).toLowerCase()) ? "warning" : "secondary";
  return (
    <article className="surface rounded-xl p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{category}</Badge><span className="flex items-center gap-1 text-xs text-muted-foreground"><GitBranch className="size-3" /> {repoName}</span></div>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.025em]">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 gap-2"><Badge variant={impactVariant}>Impact: {impact}</Badge><Badge variant={confidenceVariant}>Confidence: {confidence}</Badge></div>
      </div>
      {evidence.length > 0 && (
        <div className="mt-5 rounded-xl bg-muted/55 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold"><FileCode2 className="size-3.5 text-muted-foreground" /> Supporting evidence</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {evidence.map((item: any, index: number) => (
              <div key={index} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 font-mono text-[11px] dark:bg-black/20">
                <code className="text-primary">{String(item.hashCommit || item.commitHash || "").slice(0, 7)}</code>
                <span className="truncate text-muted-foreground">{item.berkas || item.file || "Commit evidence"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function EmptyState({ icon: Icon, title, description, children }: { icon: typeof Bot; title: string; description: string; children: React.ReactNode }) {
  return <div className="surface rounded-xl px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p><div className="mt-5">{children}</div></div>;
}

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let tableRows: string[][] | null = null;

  function flushTable() {
    if (!tableRows || tableRows.length < 2) {
      tableRows = null;
      return;
    }
    // Second row is the separator
    const headerCells = tableRows[0];
    const bodyRows = tableRows.slice(2);
    const colCount = headerCells.length;

    elements.push(
      <div key={`table-${elements.length}`} className="my-4 w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {headerCells.map((cell, ci) => (
                <th key={ci} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{inlineMarkdown(cell.trim())}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri} className="border-b border-border last:border-b-0 hover:bg-muted/25">
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td key={ci} className={`px-3 py-1.5 text-xs ${ci === 0 ? "font-medium text-foreground" : "text-muted-foreground"} ${ci > 0 && ci < colCount - 1 ? "whitespace-nowrap" : ""}`}>
                    {inlineMarkdown(row[ci]?.trim() || "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = null;
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    // Code block toggle
    if (line.trim().startsWith("```")) {
      flushTable();
      if (inCodeBlock) {
        elements.push(<pre key={`code-${index}`} className="my-4 overflow-x-auto rounded-xl border bg-muted/50 p-4 font-mono text-[11px] leading-5 dark:bg-black/20"><code>{codeBlockContent.join("\n")}</code></pre>);
        codeBlockContent = [];
        inCodeBlock = false;
        continue;
      }
      inCodeBlock = true;
      continue;
    }
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Check for special markers first
    const trimmed = line.trim();

    if (trimmed === "<!-- PAGE_BREAK -->") {
      flushTable();
      elements.push(<div key={index} className="my-4 flex items-center gap-2 text-xs text-muted-foreground/50"><hr className="flex-1 border-dashed border-muted-foreground/20" /><span className="italic">Page break</span><hr className="flex-1 border-dashed border-muted-foreground/20" /></div>);
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      flushTable();
      elements.push(<hr key={index} className="my-6 border-border" />);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushTable();
      elements.push(<div key={index} className="h-3" />);
      continue;
    }

    // Table row detection
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const pipeRe = /(?:\|([^|]*)\|)/g;
      let match;
      const cells: string[] = [];
      // Use a simpler split approach
      const parts = line.trim().split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1);
      tableRows = tableRows || [];
      tableRows.push(parts.map(p => p.trim()));
      continue;
    }

    // Not a table row — flush any pending table
    if (tableRows) {
      flushTable();
    }

    // H1 with bold: `# **text**`
    const h1BoldMatch = line.match(/^# \*\*(.+)\*\*$/);
    if (h1BoldMatch) {
      elements.push(<h1 key={index} className="text-center text-2xl font-bold tracking-tight">{inlineMarkdown(h1BoldMatch[1])}</h1>);
      continue;
    }

    // H1
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      elements.push(<h1 key={index}>{inlineMarkdown(line.slice(2))}</h1>);
      continue;
    }

    // H4 (####)
    if (line.startsWith("#### ")) {
      elements.push(<h4 key={index} className="scroll-m-20 text-sm font-semibold tracking-tight text-muted-foreground">{inlineMarkdown(line.slice(5))}</h4>);
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(<h3 key={index}>{inlineMarkdown(line.slice(4))}</h3>);
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(<h2 key={index}>{inlineMarkdown(line.slice(3))}</h2>);
      continue;
    }

    // Ordered list `1. item` or `a. item` or `i. item`
    const orderedMatch = line.match(/^(\s*)(\d+|[a-i])\.\s+(.*)$/);
    if (orderedMatch) {
      const [, indent, num, text] = orderedMatch;
      const depth = Math.floor(indent.length / 2);
      elements.push(
        <div key={index} className={`flex gap-2 ${depth > 0 ? "ml-6" : ""}`}>
          <span className="mt-px shrink-0 font-medium text-foreground">{num}.</span>
          <span>{inlineMarkdown(text)}</span>
        </div>,
      );
      continue;
    }

    // Unordered list `- text`
    const unorderedMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (unorderedMatch) {
      const [, indent, text] = unorderedMatch;
      const depth = Math.floor(indent.length / 2);
      elements.push(
        <div key={index} className={`flex gap-2 ${depth > 0 ? (depth > 1 ? "ml-12" : "ml-6") : ""}`}>
          <span className="mt-px shrink-0 text-muted-foreground">{depth > 0 ? "\u02d9" : "\u2022"}</span>
          <span>{inlineMarkdown(text)}</span>
        </div>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(<p key={index}>{inlineMarkdown(line)}</p>);
  }

  // Flush any remaining table
  if (tableRows) {
    flushTable();
  }

  return elements;
}

function inlineMarkdown(text: string) {
  // Match **bold**, *italic*, `code`, and _italic_
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|_[^_]+_)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{part.slice(1, -1)}</code>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}
