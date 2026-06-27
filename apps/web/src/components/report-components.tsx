import type { ReactNode } from "react";
import { Bot, GitBranch, GitCommit, Sparkles, ArrowRight } from "lucide-react";
import { renderMarkdown } from "../lib/markdown-renderer";
import type { Commit } from "../lib/types";

// ── Metric Card ──

export function Metric({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof GitCommit; tone?: "positive" | "negative" }) {
  return (
    <div className="surface rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <p className={`mt-1.5 font-mono text-2xl font-semibold tracking-tight ${tone === "positive" ? "text-success-foreground" : tone === "negative" ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}

// ── Commit Evidence ──

export function CommitEvidence({ commit }: { commit: Commit }) {
  const files: string[] = (() => { try { return JSON.parse(commit.changedFiles || "[]"); } catch { return []; } })();
  const snippets: { file: string; patch: string }[] = (() => { try { return JSON.parse(commit.patchSnippets || "[]"); } catch { return []; } })();

  return (
    <div className="border-t bg-muted/30 px-5 py-4">
      {files.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Changed files</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {files.map((file, fi) => (
              <code key={fi} className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px]">{file}</code>
            ))}
          </div>
        </div>
      )}
      {snippets.map((snippet, si) => (
        <div key={si} className="mb-3 last:mb-0">
          <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px]">{snippet.file}</code>
          <pre className="mt-1 overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[10px] leading-4">
            <code>{snippet.patch}</code>
          </pre>
        </div>
      ))}
    </div>
  );
}

// ── Work Item Card ──

const categoryIcons: Record<string, typeof Sparkles> = {
  feature: Sparkles,
  bugfix: GitCommit,
  refactor: GitBranch,
  performance: ArrowRight,
};

export function WorkItemCard({ item, repoName }: { item: any; repoName: string }) {
  const title: string = item.judul || item.title || "Work item";
  const description: string = item.deskripsi || item.description || "";
  const impact: string = item.dampak || item.impact || "";
  const confidence: string = item.keyakinan || item.confidence || "";
  const category: string = item.kategori || item.category || "";
  const evidence: any[] = item.bukti || item.evidence || [];

  const Icon = categoryIcons[category] || Bot;

  const confidenceVariant: Record<string, string> = {
    tinggi: "border-emerald-500/30 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400",
    sedang: "border-amber-500/30 bg-amber-500/8 text-amber-600 dark:text-amber-400",
    rendah: "border-red-500/30 bg-red-500/8 text-red-600 dark:text-red-400",
  };

  const impactVariant: Record<string, string> = {
    tinggi: "border-emerald-500/30 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400",
    sedang: "border-amber-500/30 bg-amber-500/8 text-amber-600 dark:text-amber-400",
    rendah: "border-red-500/30 bg-red-500/8 text-red-600 dark:text-red-400",
  };

  return (
    <article className="surface overflow-hidden rounded-xl">
      <div className="border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary"><Icon className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold tracking-[-0.01em]">{title}</h3>
              {category && <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{category}</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{repoName}</p>
          </div>
        </div>
      </div>
      {description && (
        <div className="border-b px-5 py-4">
          <div className="report-prose text-sm leading-7">{renderMarkdown(description)}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        {impact && <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${impactVariant[impact] || "border-border text-muted-foreground"}`}>{impact}</span>}
        {confidence && <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${confidenceVariant[confidence] || "border-border text-muted-foreground"}`}>{confidence}</span>}
        {evidence.length > 0 && <span className="text-[10px] text-muted-foreground">{evidence.length} bukti commit</span>}
      </div>
    </article>
  );
}

// ── Empty State ──

export function EmptyState({ icon: Icon, title, description, children }: { icon: typeof Bot; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon className="size-10 text-muted-foreground/30" />
      <p className="mt-4 text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
