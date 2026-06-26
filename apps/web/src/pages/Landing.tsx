import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  FileText,
  GitBranch,
  Github,
  Layers3,
  LockKeyhole,
  Moon,
  ServerCog,
  Sparkles,
  Sun,
  Terminal,
} from "lucide-react";

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );

    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);
}

function useLandingTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const savedTheme = localStorage.getItem("theme");
    return savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#14151a" : "#f9fafb");
  }, [dark]);

  return { dark, setDark };
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div data-reveal className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const steps = [
  {
    number: "01",
    title: "Connect repositories",
    desc: "Add GitHub, GitLab, or self-hosted repositories and map the authors that belong in each monthly report.",
  },
  {
    number: "02",
    title: "Analyze the work",
    desc: "Commits are grouped by period, then sent to your OpenAI-compatible LLM provider for structured findings.",
  },
  {
    number: "03",
    title: "Publish the report",
    desc: "Generate a simple recap, executive summary, or formal office report, then edit the Markdown before export.",
  },
];

const bentoItems = [
  {
    title: "Multi-repository reporting",
    desc: "Group backend, frontend, infra, and mobile repositories into one reporting cycle without duplicate commit data.",
    icon: Boxes,
    className: "lg:col-span-2",
    visual: "pipeline",
  },
  {
    title: "Private by default",
    desc: "Run it on your own server. Repository data, SSH keys, and report drafts stay inside your infrastructure.",
    icon: LockKeyhole,
    className: "lg:row-span-2",
    visual: "privacy",
  },
  {
    title: "LLM-ready analysis",
    desc: "Bring any OpenAI-compatible provider and keep model routing under your control.",
    icon: Bot,
    className: "",
    visual: "model",
  },
  {
    title: "Background jobs",
    desc: "Collection, analysis, generation, and export run asynchronously with activity tracking.",
    icon: ServerCog,
    className: "",
    visual: "jobs",
  },
  {
    title: "Markdown editing",
    desc: "Review the generated draft in a split editor before sending it to leadership or clients.",
    icon: FileText,
    className: "lg:col-span-2",
    visual: "editor",
  },
];

const checklist = [
  "SQLite database, no managed service required",
  "Your LLM API key, your model routing",
  "Workspace-level SSH keys for repository access",
  "Open core foundation for internal deployment",
];

export default function Landing() {
  useReveal();
  const { dark, setDark } = useLandingTheme();

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_34rem)] dark:bg-[radial-gradient(circle_at_20%_0%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_36rem)]" />

      <nav className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border/75 bg-background/88 backdrop-blur-xl dark:border-white/[0.06] dark:bg-background/78">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-5 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <FileText className="size-4" strokeWidth={1.8} />
            </span>
            laporan
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark((value) => !value)}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.06]"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <a href="/docs" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline">
              Docs
            </a>
            <a href="/login" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline">
              Sign in
            </a>
            <a
              href="/docs#quick-start"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/15 transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              Get started
            </a>
          </div>
        </div>
      </nav>

      <section className="relative px-5 pb-20 pt-28 sm:px-6 md:pb-28 md:pt-32">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <Reveal>
              <span className="inline-flex rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.035]">
                Self-hosted reporting
              </span>
            </Reveal>
            <Reveal delay={90}>
              <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Monthly engineering reports from your Git history
              </h1>
            </Reveal>
            <Reveal delay={180}>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
                Collect commits, analyze them with your LLM, and produce formatted reports on infrastructure you control.
              </p>
            </Reveal>
            <Reveal delay={270}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/docs#quick-start"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/15 transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  Deploy on your server <ArrowRight className="size-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] dark:border-white/[0.08] dark:bg-white/[0.035] dark:shadow-none dark:hover:bg-white/[0.07]"
                >
                  See how it works
                </a>
              </div>
            </Reveal>
          </div>

          <Reveal delay={220}>
            <div className="surface overflow-hidden rounded-2xl">
              <div className="flex items-center gap-1.5 border-b px-4 py-3">
                <span className="size-2.5 rounded-full bg-muted-foreground/25" />
                <span className="size-2.5 rounded-full bg-muted-foreground/25" />
                <span className="size-2.5 rounded-full bg-muted-foreground/25" />
                <span className="ml-3 truncate text-[11px] text-muted-foreground">Laporan Kemajuan Pekerjaan, Juni 2026</span>
              </div>
              <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="border-b bg-muted/35 p-5 lg:border-b-0 lg:border-r dark:bg-black/15">
                  <div className="rounded-xl border border-border bg-card p-4 dark:border-white/[0.07] dark:bg-white/[0.025]">
                    <p className="font-mono text-[11px] text-muted-foreground">collection status</p>
                    <div className="mt-4 space-y-3">
                      {["api-service", "web-client", "infra-scripts"].map((repo, index) => (
                        <div key={repo} className="flex items-center gap-3">
                          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                            <GitBranch className="size-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{repo}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{24 - index * 6} commits collected</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-primary/10 p-4 text-primary">
                    <Sparkles className="size-4" />
                    <p className="mt-3 text-sm font-semibold">Analysis complete</p>
                    <p className="mt-1 text-xs leading-5 text-primary/80">12 work items with commit evidence are ready for report generation.</p>
                  </div>
                </div>
                <div className="space-y-3 p-5 font-mono text-[12px] leading-6 text-muted-foreground">
                  <p className="text-sm font-semibold tracking-tight text-foreground">LAPORAN KEMAJUAN PEKERJAAN</p>
                  <p>Periode: Juni 2026</p>
                  <p className="pt-2 font-medium text-foreground">I. PENGEMBANGAN SISTEM</p>
                  <p className="pl-4">• Fitur ekspor dashboard ke CSV dan Excel</p>
                  <p className="pl-4">• Integrasi API proses hukum</p>
                  <p className="pl-4">• Peningkatan visualisasi dashboard</p>
                  <p className="pt-2 font-medium text-foreground">II. KESIMPULAN</p>
                  <p>Seluruh perubahan dapat dilacak melalui commit yang terdokumentasi.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-border px-5 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">A short pipeline from commits to report</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal key={step.number} delay={index * 90}>
                <article className="surface h-full rounded-2xl p-6">
                  <span className="font-mono text-[11px] font-medium text-primary">{step.number}</span>
                  <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.desc}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border px-5 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">Built as a reporting workspace, not a toy generator</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              The bento layout mirrors the actual workflow: repository intake, controlled analysis, async jobs, and final editing.
            </p>
          </Reveal>

          <div className="mt-12 grid auto-rows-[minmax(220px,auto)] gap-4 lg:grid-cols-3">
            {bentoItems.map(({ title, desc, icon: Icon, className, visual }, index) => (
              <Reveal key={title} delay={index * 70} className={className}>
                <article className="surface group relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-2xl p-6 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/35">
                  <div className="flex items-start justify-between gap-5">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" strokeWidth={1.8} />
                    </span>
                    <BentoVisual kind={visual} />
                  </div>
                  <div className="mt-auto pt-8">
                    <h3 className="text-lg font-semibold tracking-[-0.025em]">{title}</h3>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{desc}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border px-5 py-20 sm:px-6 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <Reveal>
            <span className="inline-flex rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.035]">
              Private deployment
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em] md:text-3xl">Run the reporting stack on your own server</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              No SaaS dependency is required for the core workflow. Keep the database, keys, repository metadata, and drafts under your operational control.
            </p>
            <ul className="mt-6 space-y-3">
              {checklist.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <div className="surface overflow-hidden rounded-2xl">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Terminal className="size-4 text-muted-foreground" />
                <span className="font-mono text-[11px] text-muted-foreground">deploy.sh</span>
              </div>
              <div className="space-y-2 bg-muted/30 p-5 font-mono text-[13px] leading-6 dark:bg-black/15">
                <p className="text-foreground"><span className="text-muted-foreground">$</span> curl -fsSL https://get.laporan.dev | bash</p>
                <p className="text-muted-foreground">✓ Node.js 18+ detected</p>
                <p className="text-muted-foreground">✓ Git detected</p>
                <p className="text-muted-foreground">✓ Installing dependencies</p>
                <p className="text-muted-foreground">✓ Preparing workspace database</p>
                <p className="pt-2 font-semibold text-success-foreground">✓ laporan-api online on port 3000</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border px-5 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Layers3 className="mx-auto size-8 text-primary" />
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em] md:text-3xl">Start with one workspace</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Create a workspace, connect repositories, and generate your first monthly report from real commit history.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="/docs#quick-start"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/15 transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                Get started
              </a>
              <a
                href="https://github.com/rizkhal/laporan.rizkal.space"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] dark:border-white/[0.08] dark:bg-white/[0.035] dark:shadow-none dark:hover:bg-white/[0.07]"
              >
                <Github className="size-4" /> View on GitHub
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>laporan, monthly dev report</span>
          <span>MIT License</span>
        </div>
      </footer>

      <style>{`
        .reveal {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 600ms cubic-bezier(0.16, 1, 0.3, 1),
                      transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
        }
      `}</style>
    </div>
  );
}

function BentoVisual({ kind }: { kind: string }) {
  if (kind === "pipeline") {
    return (
      <div className="hidden min-w-56 grid-cols-3 gap-2 sm:grid">
        {["Collect", "Analyze", "Report"].map((item) => (
          <span key={item} className="rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-[10px] text-muted-foreground dark:border-white/[0.07] dark:bg-black/20">
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (kind === "privacy") {
    return (
      <div className="grid size-24 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <LockKeyhole className="size-8" strokeWidth={1.6} />
      </div>
    );
  }

  if (kind === "editor") {
    return (
      <div className="hidden w-64 rounded-xl border border-border bg-background p-3 font-mono text-[10px] text-muted-foreground dark:border-white/[0.07] dark:bg-black/20 sm:block">
        <p className="text-foreground">## Progress summary</p>
        <p className="mt-2">- API integration</p>
        <p>- dashboard export</p>
        <p>- report formatter</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((item) => (
        <span key={item} className="size-2 rounded-full bg-primary/35" />
      ))}
    </div>
  );
}
