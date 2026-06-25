import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { cn, WEB_URL } from "./lib/utils";
import {
  ArrowRight, Bot, FileText, GitCommit, GitPullRequest,
  Sparkles, Shield,
} from "lucide-react";

const features = [
  {
    icon: GitCommit,
    title: "Git collection engine",
    description: "Scan multiple repositories in one run. Filter by author, exclude noise, and store everything in a structured database.",
  },
  {
    icon: Bot,
    title: "AI-powered analysis",
    description: "Every commit batch is analyzed by an LLM to extract meaningful work items, impact, risks, and next steps.",
  },
  {
    icon: FileText,
    title: "Executive reports",
    description: "Generate professional monthly reports in markdown. Business-friendly language, ready for managers and stakeholders.",
  },
  {
    icon: GitPullRequest,
    title: "Multi-repo support",
    description: "Group repositories by category, track multiple authors, and collect commits from any local Git repository.",
  },
  {
    icon: Sparkles,
    title: "Smart categorization",
    description: "Work items are automatically categorized and tagged. Review, edit, and refine before publishing.",
  },
  {
    icon: Shield,
    title: "Local & private",
    description: "Everything runs on your infrastructure. No data leaves your network. Connect your own LLM providers.",
  },
];

const steps = [
  {
    number: "01",
    title: "Configure repositories",
    description: "Add your Git repositories, set up author identities, and organize them into categories.",
  },
  {
    number: "02",
    title: "Collect monthly activity",
    description: "Select a period and collect all commits from configured authors. Noise files are automatically excluded.",
  },
  {
    number: "03",
    title: "Analyze with AI",
    description: "Each repository is analyzed by your chosen LLM provider. Work items, impacts, and risks are extracted.",
  },
  {
    number: "04",
    title: "Generate & share",
    description: "Review the analysis, generate a professional report, and export it to share with your team.",
  },
];

export default function App() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">

      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-white shadow-sm shadow-primary/20">
              <FileText className="size-4" strokeWidth={1.8} />
            </span>
            <span className="text-sm font-semibold tracking-[-0.02em]">Monthly Report</span>
          </a>
          <nav className="flex items-center gap-3">
            <a href={`${WEB_URL}/login`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Sign in</a>
            <Button size="sm" asChild>
              <a href={`${WEB_URL}/register`}>Get started <ArrowRight className="size-3.5" /></a>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="mx-auto max-w-6xl px-5 pt-20 pb-28 sm:pt-28 sm:pb-36">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-5">Internal developer tools</Badge>
            <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl leading-[1.08]">
              Monthly developer reports,<br />
              <span className="text-primary">generated from Git</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Collect commits, analyze with AI, and generate professional monthly reports.
              Built for engineering teams that value data-driven retrospectives.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button size="lg" asChild>
                <a href={`${WEB_URL}/register`}>Get started <ArrowRight className="size-4" /></a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href={`${WEB_URL}/login`}>Sign in</a>
              </Button>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-gradient-to-b from-primary/[0.04] to-transparent" />
      </section>

      {/* Stats */}
      <section className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {[
              { value: "3", label: "Phases", detail: "collect analyze report" },
              { value: "74+", label: "Commits", detail: "processed in tests" },
              { value: "SQLite", label: "Storage", detail: "zero-config database" },
              { value: "OpenAI", label: "Compatible", detail: "bring your own LLM" },
            ].map(({ value, label, detail }) => (
              <div key={label} className="text-center">
                <p className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
                <p className="mt-1 text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Everything you need for monthly reporting</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              From raw Git history to polished executive reports in one place.
            </p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="surface rounded-xl p-5 transition-colors hover:border-border">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">How it works</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Four steps to go from repositories to a published report.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ number, title, description }, index) => (
              <div key={number} className="relative">
                {index < steps.length - 1 && (
                  <div className="absolute left-5 top-8 hidden h-[calc(100%+1.5rem)] w-px bg-border lg:block" />
                )}
                <div className="relative z-10 flex items-start gap-4 lg:block">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">{number}</span>
                  <div className="lg:mt-4">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Built with modern tools</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A type-safe stack designed for maintainability and performance.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
            {["Hono", "React", "TypeScript", "Tailwind CSS", "shadcn/ui", "Drizzle ORM", "SQLite", "Vite"].map((tech) => (
              <span key={tech} className="font-mono text-xs font-medium tracking-tight">{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="surface rounded-2xl px-6 py-16 text-center sm:px-16">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Ready to automate your reports?</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Start collecting, analyzing, and generating monthly developer reports in minutes.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button size="lg" asChild>
                <a href={`${WEB_URL}/register`}>Get started <ArrowRight className="size-4" /></a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href={`${WEB_URL}/login`}>Sign in</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            <span>Monthly Developer Report</span>
          </div>
          <p className="text-xs text-muted-foreground">Built with Hono &middot; React &middot; Drizzle ORM &middot; SQLite</p>
        </div>
      </footer>
    </div>
  );
}
