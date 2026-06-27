import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FileText, Globe, Lock, Moon, Sun, Check, Copy } from "lucide-react";
import { renderMarkdown } from "../lib/markdown-renderer";

interface ShareData {
  title: string;
  content: string;
  visibility: string;
}

export default function SharePreview() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [protected_, setProtected_] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const savedTheme = localStorage.getItem("theme");
    return savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#14151a" : "#f9fafb");
  }, [dark]);

  const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

  async function fetchShare(token?: string) {
    try {
      setLoading(true);
      setError(null);
      const url = `${API_BASE}/api/share/${slug}${token ? `?token=${token}` : ""}`;
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) {
        if (body.protected) {
          setProtected_(true);
          setLoading(false);
          return;
        }
        throw new Error(body.error || "Failed to load report");
      }
      setProtected_(false);
      setData(body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPassword() {
    try {
      setPasswordBusy(true);
      setPasswordError(null);
      const res = await fetch(`${API_BASE}/api/share/${slug}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPasswordError(body.error || "Invalid password");
        return;
      }
      await fetchShare(body.accessToken);
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  useEffect(() => {
    if (slug) fetchShare();
  }, [slug]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <FileText className="size-8 animate-pulse text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading report...</p>
        </div>
      </div>
    );
  }

  // ── Password prompt for protected links ──
  if (protected_) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground">
        <nav className="flex h-16 items-center justify-between border-b border-border/75 px-5 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <FileText className="size-4" strokeWidth={1.8} />
            </span>
            laporan
          </a>
        </nav>
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md items-center justify-center px-5">
          <div className="w-full space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-border bg-card">
                <Lock className="size-6 text-muted-foreground" />
              </div>
              <h1 className="text-xl font-semibold">Protected Report</h1>
              <p className="mt-1 text-sm text-muted-foreground">This report is password protected. Enter the password to view it.</p>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                onKeyDown={(e) => e.key === "Enter" && password && handleVerifyPassword()}
                className="h-10 w-full rounded-xl border border-input bg-card px-4 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 dark:border-white/[0.09] dark:bg-white/[0.035]"
              />
              {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
              <button
                type="button"
                onClick={handleVerifyPassword}
                disabled={passwordBusy || !password}
                className="flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-sm shadow-primary/15 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
              >
                {passwordBusy ? "Verifying..." : "View report"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm px-5">
          <div className="grid size-14 place-items-center rounded-2xl border border-border bg-card">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">Report not found</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a href="/" className="text-sm font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary">Go to homepage</a>
        </div>
      </div>
    );
  }

  // ── Report content ──
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border/75 bg-background/88 backdrop-blur-xl dark:border-white/[0.06] dark:bg-background/78">
        <div className="mx-auto flex h-full max-w-4xl items-center justify-between px-5 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <FileText className="size-4" strokeWidth={1.8} />
            </span>
            laporan
          </a>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {data?.visibility === "protected" ? <Lock className="size-3" /> : <Globe className="size-3" />}
              {data?.visibility === "protected" ? "Protected" : "Public"}
            </span>
            <button
              type="button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark((v) => !v)}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.06]"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-5 pt-24 pb-32 sm:px-6">
        <article className="report-prose">
          <header className="mb-10">
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">{data?.title || "Report"}</h1>
          </header>
          {renderMarkdown(data?.content || "", { copied, setCopied })}
        </article>
      </main>
    </div>
  );
}
