import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { apiFetch } from "../lib/utils";
import { GitCommit, GitBranch, FileText, Users, ArrowRight, Plus } from "lucide-react";

interface DashboardStats {
  totalRepos: number;
  totalCollections: number;
  totalCommits: number;
  latestCollection: { id: number; title: string; year: number; month: number; status: string } | null;
  perRepoStats: { repoId: number; repoName: string; commits: number; lastCollected: string }[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    try {
      setLoading(true);
      setError(null);
      const [repos, collections] = await Promise.all([
        apiFetch<any[]>("/repos"),
        apiFetch<any[]>("/collections"),
      ]);

      const latestCol = collections.length > 0 ? collections[0] : null;
      let latestStats = { totalCommits: 0, perRepoStats: [] as any[] };

      if (latestCol) {
        latestStats = await apiFetch(`/collections/${latestCol.id}/stats`);
      }

      setStats({
        totalRepos: repos.length,
        totalCollections: collections.length,
        latestCollection: latestCol ? { id: latestCol.id, title: latestCol.title, year: latestCol.year, month: latestCol.month, status: latestCol.status } : null,
        totalCommits: latestStats.totalCommits || 0,
        perRepoStats: [],
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your development activity</p>
        </div>
        <Link to="/collections">
          <Button><Plus className="h-4 w-4" /> New Collection</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Repositories</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRepos || 0}</div>
            <p className="text-xs text-muted-foreground">Configured repos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collections</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCollections || 0}</div>
            <p className="text-xs text-muted-foreground">Monthly reports</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCommits || 0}</div>
            <p className="text-xs text-muted-foreground">In latest collection</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Authors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="text-xs text-muted-foreground">Unique contributors</p>
          </CardContent>
        </Card>
      </div>

      {stats?.latestCollection && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-lg">{stats.latestCollection.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={stats.latestCollection.status === "generated" ? "success" : stats.latestCollection.status === "analyzed" ? "warning" : "secondary"}>
                    {stats.latestCollection.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {stats.totalCommits} commits collected
                  </span>
                </div>
              </div>
              <Link to={`/collections/${stats.latestCollection.id}`}>
                <Button variant="outline">
                  View Details <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {stats && stats.totalRepos === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No repositories yet</h3>
            <p className="text-muted-foreground mb-4">Add your first repository to start collecting commits.</p>
            <Link to="/repositories">
              <Button><Plus className="h-4 w-4" /> Add Repository</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CalendarIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
      <line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/>
      <line x1="3" x2="21" y1="10" y2="10"/>
    </svg>
  );
}
