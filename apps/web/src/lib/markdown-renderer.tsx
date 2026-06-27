import { type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

// ── Types ──

export interface MarkdownOptions {
  /** Whether a code block has been copied (for copy button feedback) */
  copied?: boolean;
  /** Called when a code block copy button is clicked */
  setCopied?: (v: boolean) => void;
}

// ── Helpers ──

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return JSON.parse(value || "") as T; } catch { return fallback; }
}

// ── Inline Markdown Parser ──

export function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|_[^_]+_)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">{part.slice(1, -1)}</code>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

// ── Full Markdown Renderer ──

export function renderMarkdown(content: string, options?: MarkdownOptions): ReactNode[] {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";
  let tableRows: string[][] | null = null;

  function flushTable() {
    if (!tableRows || tableRows.length < 2) {
      tableRows = null;
      return;
    }
    const headerCells = tableRows[0];
    const bodyRows = tableRows.slice(2);
    const colCount = headerCells.length;

    elements.push(
      <div key={`table-${elements.length}`} className="my-4 w-full overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr className="bg-muted/50">
              {headerCells.map((cell, ci) => (
                <th key={ci} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{inlineMarkdown(cell.trim())}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bodyRows.map((row, ri) => (
              <tr key={ri} className="even:bg-muted/20">
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td key={ci} className={`px-4 py-2 text-xs ${ci === 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trim().startsWith("```")) {
      flushTable();
      if (inCodeBlock) {
        const code = codeBlockContent.join("\n");
        elements.push(
          <div key={`code-${i}`} className="group relative my-4 overflow-hidden rounded-xl border border-border bg-muted/50 dark:bg-black/25">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{codeBlockLang || "code"}</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(code); options?.setCopied?.(true); setTimeout(() => options?.setCopied?.(false), 2000); }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground opacity-0 transition-all hover:bg-muted-foreground/10 group-hover:opacity-100"
              >
                {options?.copied ? <><Check className="size-3 text-success-foreground" /> Copied</> : <><Copy className="size-3" /> Copy</>}
              </button>
            </div>
            <div className="overflow-x-auto p-4">
              <pre className="font-mono text-sm leading-6 text-foreground">
                <code>
                  {codeBlockContent.map((cl, li) => {
                    if (cl.startsWith("+")) {
                      return <div key={li} className="text-emerald-600 dark:text-emerald-400">{cl}</div>;
                    }
                    if (cl.startsWith("-")) {
                      return <div key={li} className="text-red-500 dark:text-red-400">{cl}</div>;
                    }
                    return <div key={li}>{cl}</div>;
                  })}
                </code>
              </pre>
            </div>
          </div>
        );
        codeBlockContent = [];
        codeBlockLang = "";
        inCodeBlock = false;
        continue;
      }
      inCodeBlock = true;
      codeBlockLang = line.trim().slice(3).trim();
      continue;
    }
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Page break
    if (trimmed === "<!-- PAGE_BREAK -->") {
      flushTable();
      elements.push(<div key={`pb-${i}`} className="my-4 flex items-center gap-2 text-xs text-muted-foreground/50"><hr className="flex-1 border-dashed border-muted-foreground/20" /><span className="italic">Page break</span><hr className="flex-1 border-dashed border-muted-foreground/20" /></div>);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushTable();
      elements.push(<hr key={`hr-${i}`} className="my-6 border-border" />);
      continue;
    }

    // Empty line
    if (!trimmed) {
      flushTable();
      elements.push(<div key={`spacer-${i}`} className="h-4" />);
      continue;
    }

    // Table row detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const parts = trimmed.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows = tableRows || [];
      tableRows.push(parts.map(p => p.trim()));
      continue;
    }

    if (tableRows) {
      flushTable();
    }

    // H1 with bold: `# **text**`
    const h1BoldMatch = line.match(/^# \*\*(.+)\*\*$/);
    if (h1BoldMatch) {
      elements.push(<h1 key={`h1b-${i}`} className="mb-4 mt-8 text-2xl font-bold tracking-[-0.03em]">{inlineMarkdown(h1BoldMatch[1])}</h1>);
      continue;
    }

    // H1
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      elements.push(<h1 key={`h1-${i}`} className="mb-4 mt-8 text-2xl font-semibold tracking-[-0.03em] text-foreground">{inlineMarkdown(line.slice(2))}</h1>);
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(<h2 key={`h2-${i}`} className="mb-3 mt-6 text-xl font-semibold tracking-[-0.02em] text-foreground">{inlineMarkdown(line.slice(3))}</h2>);
      continue;
    }

    // H3/H4/H5
    const hMatch = trimmed.match(/^(#{3,5})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const size = level >= 4 ? "text-base" : "text-lg";
      elements.push(
        <h3 key={`h3-${i}`} className={`mb-2 mt-5 ${size} font-semibold text-foreground`}>
          {inlineMarkdown(text)}
        </h3>
      );
      continue;
    }

    // Ordered list `1. item` or `a. item` or `i. item`
    const orderedMatch = line.match(/^(\s*)(\d+|[a-i])\.\s+(.*)$/);
    if (orderedMatch) {
      const [, indent, num, text] = orderedMatch;
      const depth = Math.floor(indent.length / 2);
      elements.push(
        <div key={`ol-${i}`} className={`flex gap-2 ${depth > 0 ? "ml-6" : ""}`}>
          <span className="mt-px shrink-0 font-medium text-foreground">{num}.</span>
          <span>{inlineMarkdown(text)}</span>
        </div>
      );
      continue;
    }

    // Unordered list `- text`
    const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      const [, indent, text] = unorderedMatch;
      const depth = Math.floor(indent.length / 2);
      elements.push(
        <li key={`ul-${i}`} className={`ml-5 text-sm leading-7 text-foreground ${depth === 0 ? "list-disc" : "list-circle"}`}>
          {inlineMarkdown(text)}
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

    // Regular paragraph
    elements.push(<p key={`p-${i}`} className="text-sm leading-7 text-foreground">{inlineMarkdown(line)}</p>);
  }

  if (inCodeBlock) {
    const code = codeBlockContent.join("\n");
    elements.push(
      <pre key="code-final" className="my-4 overflow-x-auto rounded-xl border bg-muted/50 p-4 font-mono text-[11px] leading-5 dark:bg-black/20">
        <code>{code}</code>
      </pre>
    );
  }

  if (tableRows) {
    flushTable();
  }

  return elements;
}
