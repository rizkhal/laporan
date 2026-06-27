import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-border bg-muted/50 dark:bg-black/25">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground opacity-0 transition-all hover:bg-muted-foreground/10 group-hover:opacity-100"
        >
          {copied ? (
            <><Check className="size-3 text-success" /> Copied</>
          ) : (
            <><Copy className="size-3" /> Copy</>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-4">
        <pre className="font-mono text-sm leading-6 text-foreground">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
