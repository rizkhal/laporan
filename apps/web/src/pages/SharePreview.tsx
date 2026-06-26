import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FileText, Globe, Lock, Moon, Sun, Check, Copy } from "lucide-react";

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

  // ── Render markdown ──
  function renderMarkdown(md: string) {
    const lines = md.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent = "";
    let codeBlockLang = "";
    let tableRows: string[] = [];

    function flushTable() {
      if (tableRows.length === 0) return;
      const headerCells = tableRows[0]?.split("|").filter((c) => c.trim()).map((c) => c.trim()) || [];
      const bodyRows = tableRows.slice(2).filter((r) => r.trim() && !r.trim().startsWith("|--"));
      const colCount = headerCells.length;
      if (colCount === 0 || bodyRows.length === 0) {
        tableRows = [];
        return;
      }
      elements.push(
        <div key={`table-${elements.length}`} className="my-4 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="bg-muted/50">
                {headerCells.map((cell: string, i: number) => (
                  <th key={i} className="px-4 py-2.5 text-left font-medium text-muted-foreground">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bodyRows.map((row: string, ri: number) => {
                const cells = row.split("|").filter((c) => c.trim()).map((c) => c.trim());
                return (
                  <tr key={ri} className="even:bg-muted/20">
                    {cells.map((cell: string, ci: number) => (
                      <td key={ci} className="px-4 py-2 text-foreground">{cell}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <div key={`code-${elements.length}`} className="group relative my-4 overflow-hidden rounded-xl border border-border bg-muted/50 dark:bg-black/25">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{codeBlockLang || "code"}</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(codeBlockContent); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground opacity-0 transition-all hover:bg-muted-foreground/10 group-hover:opacity-100"
                >
                  {copied ? <><Check className="size-3 text-success-foreground" /> Copied</> : <><Copy className="size-3" /> Copy</>}
                </button>
              </div>
              <div className="overflow-x-auto p-4">
                <pre className="font-mono text-sm leading-6 text-foreground">
                  <code>
                    {codeBlockContent.split("\n").map((line, li) => {
                      const text = line.replace(/^\+/, "").replace(/^-/, "");
                      if (line.startsWith("+")) {
                        return <div key={li} className="text-emerald-600 dark:text-emerald-400">{line}</div>;
                      }
                      if (line.startsWith("-")) {
                        return <div key={li} className="text-red-500 dark:text-red-400">{line}</div>;
                      }
                      return <div key={li}>{line}</div>;
                    })}
                  </code>
                </pre>
              </div>
            </div>
          );
          codeBlockContent = "";
          codeBlockLang = "";
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeBlockLang = line.slice(3).trim();
          codeBlockContent = "";
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent += (codeBlockContent ? "\n" : "") + line;
        continue;
      }

      const trimmed = line.trim();

      // Table row
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        tableRows.push(trimmed);
        continue;
      }
      if (tableRows.length > 0) {
        flushTable();
      }

      // Empty line
      if (!trimmed) {
        elements.push(<div key={`spacer-${i}`} className="h-4" />);
        continue;
      }

      // Horizontal rule
      if (/^[-*_]{3,}$/.test(trimmed)) {
        elements.push(<hr key={`hr-${i}`} className="my-6 border-border" />);
        continue;
      }

      // H1
      if (trimmed.startsWith("# ")) {
        elements.push(
          <h1 key={`h1-${i}`} className="mb-4 mt-8 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {inlineMarkdown(trimmed.slice(2))}
          </h1>
        );
        continue;
      }

      // H2
      if (trimmed.startsWith("## ")) {
        elements.push(
          <h2 key={`h2-${i}`} className="mb-3 mt-6 text-xl font-semibold tracking-[-0.02em] text-foreground">
            {inlineMarkdown(trimmed.slice(3))}
          </h2>
        );
        continue;
      }

      // H3 (handle both ### and ####)
      if (/^#{3,5}\s/.test(trimmed)) {
        const level = trimmed.match(/^#+/)?.[0].length || 3;
        const text = trimmed.replace(/^#+\s*/, "");
        const size = level >= 4 ? "text-base" : "text-lg";
        elements.push(
          <h3 key={`h3-${i}`} className={`mb-2 mt-5 ${size} font-semibold text-foreground`}>
            {inlineMarkdown(text)}
          </h3>
        );
        continue;
      }

      // Unordered list
      const ulMatch = trimmed.match(/^[-*+]\s+(.*)/);
      if (ulMatch) {
        elements.push(
          <li key={`ul-${i}`} className="ml-5 list-disc text-sm leading-7 text-foreground">
            {inlineMarkdown(ulMatch[1])}
          </li>
        );
        continue;
      }

      // Ordered list
      const olMatch = trimmed.match(/^\d+\.\s+(.*)/);
      if (olMatch) {
        elements.push(
          <li key={`ol-${i}`} className="ml-5 list-decimal text-sm leading-7 text-foreground">
            {inlineMarkdown(olMatch[1])}
          </li>
        );
        continue;
      }

      // Bold heading (e.g., **Title: text**)
      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*[:\s]*(.*)/);
      if (boldMatch) {
        elements.push(
          <p key={`p-${i}`} className="text-sm leading-7 text-foreground">
            <strong>{boldMatch[1]}</strong>
            {boldMatch[2] ? `: ${boldMatch[2]}` : ""}
          </p>
        );
        continue;
      }

      // Default paragraph
      elements.push(
        <p key={`p-${i}`} className="text-sm leading-7 text-foreground">
          {inlineMarkdown(trimmed)}
        </p>
      );
    }

    // Flush remaining table rows
    if (tableRows.length > 0) flushTable();

    return elements;
  }

  function inlineMarkdown(text: string) {
    // Handle **bold**, *italic*, _italic_, and `code`
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("_") && part.endsWith("_")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">
            {part.slice(1, -1)}
          </code>
        );
      }
      // Render numbers as plain text (no special formatting)
      const numberParts = part.split(/([+-]?\d+(?:[.,]\d+)*)/g);
      return numberParts.map((np, j) => {
        return <span key={`${i}-${j}`}>{np}</span>;
      });
    });
  }

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
          {renderMarkdown(data?.content || "")}
        </article>
      </main>
    </div>
  );
}
