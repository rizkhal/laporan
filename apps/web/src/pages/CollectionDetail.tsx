import { useToast } from "../components/toast";
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { apiFetch, getActiveWorkspaceId } from "../lib/utils";
import { renderMarkdown, parseJson } from "../lib/markdown-renderer";
import { Metric, CommitEvidence, WorkItemCard, EmptyState } from "../components/report-components";
import { downloadReportFile } from "../lib/download";
import { useClickOutside } from "../hooks/use-click-outside";
import { ShareDialog } from "../components/share-dialog";
import type { Collection, Analysis, Report, Repo, LlmProvider, Commit } from "../lib/types";
import {
  ArrowLeft, ArrowRight, Bot, Check, ChevronDown, ChevronRight, Clipboard,
  Columns2, FileCode2, FileDown, FileText, GitBranch, GitCommit,
  Loader2, Monitor, Pencil, Save, Settings2, Share2, Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/Input";

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
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);
  const { addToast, removeToast } = useToast();

  useClickOutside(downloadRef, () => setDownloadOpen(false), downloadOpen);

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
                  <Button size="sm" variant="outline" onClick={() => setReportMode((mode) => mode === "split" ? "preview" : "split")}>
                    {reportMode === "split" ? <Monitor className="size-3.5" /> : <Columns2 className="size-3.5" />} {reportMode === "split" ? "Preview only" : "Split view"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(reportDraft); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                    {copied ? <Check className="size-3.5 text-success-foreground" /> : <Clipboard />} {copied ? "Copied!" : "Copy"}
                  </Button>
                  <div ref={downloadRef} className="relative">
                    <Button size="sm" variant="outline" onClick={() => setDownloadOpen((o) => !o)}>
                      <FileDown className="size-3.5" /> Download <ChevronDown className="size-3" />
                    </Button>
                    {downloadOpen && (
                      <div className="absolute right-0 top-full mt-1 min-w-[180px] overflow-hidden rounded-xl border bg-card shadow-xl shadow-black/10 dark:shadow-black/30 z-50">
                        <button
                          type="button"
                          onClick={() => {
                            setDownloadOpen(false);
                            if (report) downloadReportFile({
                              reportId: report.id,
                              filename: `laporan-kemajuan-pekerjaan-${collection?.title || 'report'}.md`,
                              apiPath: `/reports/${report.id}/download/markdown`,
                              addToast, removeToast,
                            });
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          <FileCode2 className="size-3.5" /> Markdown (.md)
                        </button>
                        <div className="h-px bg-border" />
                        <button
                          type="button"
                          onClick={() => {
                            setDownloadOpen(false);
                            if (report) downloadReportFile({
                              reportId: report.id,
                              filename: `laporan-kemajuan-pekerjaan-${collection?.title || 'report'}.docx`,
                              apiPath: `/reports/${report.id}/export.docx`,
                              addToast, removeToast,
                            });
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          <FileText className="size-3.5" /> DOCX (.docx)
                        </button>
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}><Share2 className="size-3.5" /> Share</Button>
                  <Button size="sm" onClick={saveReport} disabled={busy === "save"}>
                    {busy === "save" ? <Loader2 className="animate-spin" /> : <Save className="size-3.5" />} Save
                  </Button>
                </div>
              </div>

              <div className="surface overflow-hidden rounded-xl">
                {reportMode === "preview" ? (
                  <article className="report-prose mx-auto max-w-3xl px-7 py-10 sm:px-12">{renderMarkdown(reportDraft)}</article>
                ) : (
                  <div className="grid xl:grid-cols-2">
                    <textarea
                      value={reportDraft}
                      onChange={(e) => setReportDraft(e.target.value)}
                      className="min-h-[70dvh] resize-none border-r border-border bg-card p-6 font-mono text-sm leading-6 text-foreground outline-none focus:bg-muted/20"
                      placeholder="Report content will appear here..."
                    />
                    <article className="report-prose mx-auto max-w-3xl px-7 py-10 sm:px-12">{renderMarkdown(reportDraft)}</article>
                  </div>
                )}
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
      {report && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          collectionId={collectionId}
          reportId={report.id}
        />
      )}
    </div>
  );
}
