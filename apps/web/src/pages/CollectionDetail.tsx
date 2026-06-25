import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { apiFetch } from "../lib/utils";
import { ArrowLeft, GitCommit, FileText, Plus, Minus, Loader2, Bot, Download } from "lucide-react";

interface Collection {
  id: number; year: number; month: number; title: string; status: string;
}

interface Commit {
  id: number; collectionId: number; repoId: number;
  hash: string; authorName: string; authorEmail: string;
  date: string; message: string;
  filesChanged: number; insertions: number; deletions: number;
  diffStat: string; patchSnippets: string; changedFiles: string;
}

interface Analysis {
  id: number; collectionId: number; repoId: number;
  status: string; workItems: string; category: string;
  summary: string; impact: string; risks: string;
  nextSuggestions: string; isEdited: boolean; error: string;
}

interface Report {
  id: number; collectionId: number; title: string;
  content: string; isEdited: boolean;
}

interface RepoInfo {
  id: number; name: string; category: string;
}

const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const collectionId = parseInt(id || "0");

  const [collection, setCollection] = useState<Collection | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandedCommit, setExpandedCommit] = useState<number | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
  const [editingAnalysis, setEditingAnalysis] = useState<{id: number; field: string; value: string} | null>(null);
  const [llmProviders, setLlmProviders] = useState<{id: number; name: string; model: string}[]>([]);
  const [selectedLlmId, setSelectedLlmId] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, [collectionId]);

  async function loadAll() {
    try {
      setLoading(true);
      const [col, allRepos, allCommits] = await Promise.all([
        apiFetch<Collection>(`/collections/${collectionId}`),
        apiFetch<RepoInfo[]>("/repos"),
        apiFetch<Commit[]>(`/collections/${collectionId}/commits`),
      ]);
      setCollection(col);
      setRepos(allRepos);
      setCommits(allCommits);

      // Load analyses for each repo
      try {
        const allAnalyses = await apiFetch<Analysis[]>(`/analyses/collection/${collectionId}`);
        setAnalyses(allAnalyses);
      } catch {}

      // Load report
      try {
        const r = await apiFetch<Report>(`/reports/${collectionId}`);
        setReport(r);
      } catch {}

      // Load LLM providers
      try {
        const providers = await apiFetch<{id: number; name: string; model: string}[]>("/settings/llm");
        setLlmProviders(providers);
        if (providers.length > 0 && selectedLlmId === null) {
          setSelectedLlmId(providers[0].id);
        }
      } catch {}

      // Set first repo as selected
      if (allRepos.length > 0 && !selectedRepo) {
        setSelectedRepo(allRepos[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCollect() {
    try {
      setCollecting(true);
      await apiFetch(`/collections/${collectionId}/collect`, { method: "POST" });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCollecting(false);
    }
  }

  async function handleAnalyze() {
    try {
      setAnalyzing(true);
      await apiFetch(`/collections/${collectionId}/analyze`, {
        method: "POST",
        body: JSON.stringify({ llmProviderId: selectedLlmId }),
      });
      const allAnalyses = await apiFetch<Analysis[]>(`/analyses/collection/${collectionId}`);
      setAnalyses(allAnalyses);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAnalyzeOneRepo(repoId: number) {
    try {
      setAnalyzing(true);
      await apiFetch(`/collections/${collectionId}/analyze`, {
        method: "POST",
        body: JSON.stringify({ repoId, llmProviderId: selectedLlmId }),
      });
      const allAnalyses = await apiFetch<Analysis[]>(`/analyses/collection/${collectionId}`);
      setAnalyses(allAnalyses);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerateReport() {
    try {
      setGenerating(true);
      const r = await apiFetch<Report>(`/reports/${collectionId}/generate`, {
        method: "POST",
        body: JSON.stringify({ llmProviderId: selectedLlmId }),
      });
      setReport(r);
      setCollection(prev => prev ? {...prev, status: "generated"} : prev);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveAnalysisEdit(id: number, field: string, value: string) {
    await apiFetch(`/analyses/${id}`, {
      method: "PUT",
      body: JSON.stringify({ [field]: value }),
    });
    setEditingAnalysis(null);
    const allAnalyses = await apiFetch<Analysis[]>(`/analyses/collection/${collectionId}`);
    setAnalyses(allAnalyses);
  }

  const repoCommits = selectedRepo ? commits.filter(c => c.repoId === selectedRepo) : commits;
  const repoAnalysis = analyses.find(a => a.repoId === selectedRepo);
  const repoMap = new Map(repos.map(r => [r.id, r]));

  // Stats
  const totalCommits = commits.length;
  const totalFiles = commits.reduce((s, c) => s + c.filesChanged, 0);
  const totalInsertions = commits.reduce((s, c) => s + c.insertions, 0);
  const totalDeletions = commits.reduce((s, c) => s + c.deletions, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
      </div>
    );
  }

  if (!collection) return <div className="text-center py-12 text-muted-foreground">Collection not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/collections")}><ArrowLeft className="h-4 w-4" /></Button>
            <h1 className="text-2xl font-bold tracking-tight">{collection.title}</h1>
            <Badge variant={collection.status === "generated" ? "success" : collection.status === "analyzed" ? "warning" : "default"}>
              {collection.status}
            </Badge>
          </div>
          <p className="text-muted-foreground ml-10">{collection.year}-{String(collection.month).padStart(2, "0")}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCollect} disabled={collecting}>
            {collecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCommit className="h-4 w-4" />}
            {collecting ? "Collecting..." : "Collect"}
          </Button>
          <Button onClick={handleAnalyze} disabled={analyzing || commits.length === 0} variant="outline">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {analyzing ? "Analyzing..." : "Analyze All"}
          </Button>
          <Button onClick={handleGenerateReport} disabled={generating || analyses.length === 0} variant="secondary">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {generating ? "Generating..." : "Generate Report"}
          </Button>
        </div>
      </div>

      {/* LLM Provider selector */}
      {llmProviders.length > 0 && (
        <div className="flex items-center gap-2 justify-end">
          <span className="text-xs text-muted-foreground">LLM:</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={selectedLlmId || ''}
            onChange={e => setSelectedLlmId(e.target.value ? parseInt(e.target.value) : null)}
          >
            {llmProviders.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Commits</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalCommits}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Files Changed</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalFiles}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Insertions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">+{totalInsertions}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Deletions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">-{totalDeletions}</div></CardContent></Card>
      </div>

      {/* Repo Selection */}
      <div className="flex gap-2 flex-wrap">
        {repos.map(repo => {
          const repoCommitsCount = commits.filter(c => c.repoId === repo.id).length;
          const hasAnalysis = analyses.find(a => a.repoId === repo.id);
          return (
            <Button
              key={repo.id}
              variant={selectedRepo === repo.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRepo(repo.id)}
              className="gap-2"
            >
              {repo.name}
              <Badge variant="secondary" className="ml-1">{repoCommitsCount}</Badge>
              {hasAnalysis?.status === "completed" && <span className="text-green-500">✓</span>}
            </Button>
          );
        })}
      </div>

      <Tabs defaultValue="commits">
        <TabsList>
          <TabsTrigger value="commits">Commits ({repoCommits.length})</TabsTrigger>
          <TabsTrigger value="analysis">Analysis {repoAnalysis && repoAnalysis.status === "completed" ? "✓" : ""}</TabsTrigger>
          <TabsTrigger value="report">Report {report ? "✓" : ""}</TabsTrigger>
        </TabsList>

        {/* Commits Tab */}
        <TabsContent value="commits" className="space-y-2">
          {repoCommits.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <GitCommit className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              No commits yet. Click "Collect" to fetch commits.
            </CardContent></Card>
          ) : (
            repoCommits.map(commit => (
              <Card key={commit.id}>
                <div className="p-3 cursor-pointer" onClick={() => setExpandedCommit(expandedCommit === commit.id ? null : commit.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-muted-foreground mb-1">{commit.hash.slice(0, 8)}</p>
                      <p className="text-sm font-medium truncate">{commit.message}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{commit.authorName}</span>
                        <span>{new Date(commit.date).toLocaleDateString()}</span>
                        <span>{commit.filesChanged} files</span>
                        <span className="text-green-600">+{commit.insertions}</span>
                        <span className="text-red-600">-{commit.deletions}</span>
                      </div>
                    </div>
                  </div>

                  {expandedCommit === commit.id && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Changed Files:</p>
                        <div className="flex flex-wrap gap-1">
                          {JSON.parse(commit.changedFiles || "[]").map((file: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs font-mono">{file}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Diff Preview:</p>
                        {JSON.parse(commit.patchSnippets || "[]").slice(0, 3).map((snippet: {file: string; patch: string}, i: number) => (
                          <details key={i} className="mb-1">
                            <summary className="text-xs font-mono cursor-pointer hover:text-primary">{snippet.file}</summary>
                            <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-48">{snippet.patch}</pre>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          {!repoAnalysis ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <Bot className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              No analysis yet. Click "Analyze All" or analyze this repo individually.
              {selectedRepo && <div className="mt-4"><Button onClick={() => handleAnalyzeOneRepo(selectedRepo)}>Analyze {repoMap.get(selectedRepo)?.name}</Button></div>}
            </CardContent></Card>
          ) : repoAnalysis.status === "failed" ? (
            <Card><CardContent className="py-4 text-destructive">{repoAnalysis.error || "Analysis failed"}</CardContent></Card>
          ) : repoAnalysis.status === "completed" ? (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
                <CardContent>
                  {editingAnalysis?.id === repoAnalysis.id && editingAnalysis.field === "summary" ? (
                    <div className="space-y-2">
                      <textarea className="w-full h-24 p-2 border rounded text-sm" value={editingAnalysis.value} onChange={e => setEditingAnalysis({...editingAnalysis, value: e.target.value})} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveAnalysisEdit(repoAnalysis.id, "summary", editingAnalysis.value)}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingAnalysis(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="group relative">
                      <p className="text-sm whitespace-pre-wrap">{repoAnalysis.summary}</p>
                      <Button variant="ghost" size="sm" className="absolute top-0 right-0 opacity-0 group-hover:opacity-100" onClick={() => setEditingAnalysis({id: repoAnalysis.id, field: "summary", value: repoAnalysis.summary || ""})}>Edit</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Work Items */}
              <Card>
                <CardHeader><CardTitle>Work Items</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {(JSON.parse(repoAnalysis.workItems || "[]")).map((item: any, i: number) => {
                    // Handle both Indonesian (from LLM) and English field names
                    const judul = item.judul || item.title || '';
                    const deskripsi = item.deskripsi || item.description || '';
                    const dampak = item.dampak || item.impact || 'rendah';
                    const keyakinan = item.keyakinan || item.confidence || 'sedang';
                    const kategori = item.kategori || item.category || 'other';
                    const bukti = item.bukti || item.evidence || [];
                    const dampakVariant = dampak === 'tinggi' ? 'destructive' : dampak === 'sedang' ? 'warning' : 'secondary';
                    const keyakinanVariant = keyakinan === 'tinggi' ? 'success' : 'secondary';
                    return (
                      <div key={i} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-sm">{judul}</p>
                            <p className="text-xs text-muted-foreground mt-1">{deskripsi}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Badge variant={dampakVariant}>{dampak}</Badge>
                            <Badge variant={keyakinanVariant}>{keyakinan}</Badge>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">Kategori:</span> {kategori}
                        </div>
                        {bukti.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {bukti.map((ev: any, j: number) => (
                              <Badge key={j} variant="outline" className="text-xs font-mono">
                                {(ev.hashCommit || ev.commitHash || '').slice(0,7)}: {ev.berkas || ev.file || ''}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Impact & Risks */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle>Impact</CardTitle></CardHeader>
                  <CardContent><p className="text-sm">{repoAnalysis.impact}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Risks</CardTitle></CardHeader>
                  <CardContent><p className="text-sm">{repoAnalysis.risks || "None identified"}</p></CardContent>
                </Card>
              </div>

              {/* Next Suggestions */}
              <Card>
                <CardHeader><CardTitle>Next Suggestions</CardTitle></CardHeader>
                <CardContent><p className="text-sm">{repoAnalysis.nextSuggestions}</p></CardContent>
              </Card>
            </div>
          ) : (
            <Card><CardContent className="py-8 text-center">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
              Analysis in progress...
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Report Tab */}
        <TabsContent value="report" className="space-y-4">
          {!report ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              No report generated yet. Complete analysis first, then generate.
            </CardContent></Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <CardTitle>Monthly Report: {report.title}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(report.content); }}>
                    Copy Markdown
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap font-mono text-sm bg-muted/30 p-4 rounded-lg border">
                  {report.content}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
