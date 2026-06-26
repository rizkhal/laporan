import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun, Github, FileText, Check, ChevronRight, Copy, Terminal, ArrowUpRight } from "lucide-react";

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

const sections = [
  { id: "overview", title: "Overview" },
  { id: "architecture", title: "Architecture" },
  { id: "quick-start", title: "Quick Start" },
  { id: "manual-install", title: "Manual Installation" },
  { id: "configuration", title: "Configuration" },
  { id: "ssh-keys", title: "SSH Key Setup" },
  { id: "repositories", title: "Adding Repositories" },
  { id: "collections", title: "Collections" },
  { id: "collect-commits", title: "Collecting Commits" },
  { id: "llm-analysis", title: "LLM Analysis" },
  { id: "reports", title: "Report Generation" },
  { id: "deployment", title: "Production Deployment" },
  { id: "troubleshooting", title: "Troubleshooting" },
  { id: "faq", title: "FAQ" },
];

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
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

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">
      {children}
    </code>
  );
}

function Step({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-[11px] font-mono font-medium text-muted-foreground">
        {number}
      </span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary"
    >
      {children}
      <ArrowUpRight className="size-3" />
    </a>
  );
}

export default function Docs() {
  const { dark, setDark } = useLandingTheme();
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    const els = document.querySelectorAll("[data-section]");
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && sections.find((s) => s.id === hash)) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ── Nav ── */}
      <nav className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border/75 bg-background/88 backdrop-blur-xl dark:border-white/[0.06] dark:bg-background/78">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
                <FileText className="size-4" strokeWidth={1.8} />
              </span>
              laporan
            </a>
            <span className="hidden text-sm text-muted-foreground sm:inline">/</span>
            <span className="hidden text-sm font-medium text-foreground sm:inline">docs</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark((v) => !v)}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.06]"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <a href="/login" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
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

      <div className="mx-auto flex max-w-6xl px-5 pt-20 sm:px-6">
        {/* ── Sidebar ── */}
        <aside className="sticky top-20 hidden h-[calc(100dvh-5rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
          <nav className="space-y-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                data-active={activeSection === s.id}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-foreground data-[active=true]:bg-muted/50"
              >
                {activeSection === s.id && <ChevronRight className="size-3 shrink-0 text-primary" />}
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── Content ── */}
        <main className="min-w-0 flex-1 py-10 pb-32 lg:pl-12">
          {/* ── Overview ── */}
          <section data-section id="overview">
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">Documentation</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              laporan is a self-hosted tool that turns Git commit history into structured monthly engineering reports.
              It collects commits from one or more repositories, sends them to an LLM for analysis, and generates reports
              in three styles — Simple, Executive, and Office.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-2xl font-semibold">3</p>
                <p className="text-sm text-muted-foreground">report styles</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-2xl font-semibold">1</p>
                <p className="text-sm text-muted-foreground">deploy command</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-2xl font-semibold">MIT</p>
                <p className="text-sm text-muted-foreground">open source license</p>
              </div>
            </div>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Architecture ── */}
          <section data-section id="architecture">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Architecture</h2>
            <div className="mt-6 grid gap-4 rounded-2xl border border-border bg-card p-6 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
              <div>
                <p className="font-semibold text-foreground">API Server</p>
                <p className="mt-1">Hono.js backend with Drizzle ORM. Handles routing, authentication, job queue, and API endpoints.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Database</p>
                <p className="mt-1">SQLite via better-sqlite3. Zero external services — the database is a single file.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Frontend</p>
                <p className="mt-1">React 18 + Vite + Tailwind CSS v4. Markdown editor with live split-pane preview.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">LLM Integration</p>
                <p className="mt-1">OpenAI-compatible API. Bring your own key and model. Each repo is analyzed independently.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Job Queue</p>
                <p className="mt-1">In-process FIFO queue. Collect, analyze, generate, and export run sequentially with progress tracking.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Git Operations</p>
                <p className="mt-1">Native git commands via child_process. Clone, pull, log, and diff — all async and cancelable.</p>
              </div>
            </div>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Quick Start ── */}
          <section data-section id="quick-start">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Quick Start</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              The fastest way to get laporan running on a Linux server. This works on any VPS with Node.js 18+ installed.
            </p>

            <h3 className="mt-8 text-base font-semibold">Prerequisites</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Linux machine (Ubuntu 22.04+, Debian 12+, or CentOS 9+)
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Root or sudo access
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                An OpenAI-compatible LLM API key (optional for analysis)
              </li>
            </ul>

            <h3 className="mt-8 text-base font-semibold">One-command install</h3>
            <CodeBlock code={`curl -fsSL https://raw.githubusercontent.com/rizkhal/laporan/master/scripts/install.sh | bash`} lang="bash" />

            <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">What this does</p>
  <ol className="mt-2 space-y-1.5 list-decimal pl-5">
    <li>Checks for Node.js 18+ and installs it if missing</li>
    <li>Clones the repository to <InlineCode>./laporan</InlineCode></li>
    <li>Installs dependencies</li>
    <li>Prompts for admin email and password</li>
    <li>Creates admin account automatically</li>
    <li>Shows instructions to run <InlineCode>npm run dev</InlineCode></li>
  </ol>
</div>

            <h3 className="mt-8 text-base font-semibold">Post-install steps</h3>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground list-decimal pl-5">
              <li>
                <p className="font-medium text-foreground">Start the app</p>
                <CodeBlock code={`cd laporan
npm run dev`} lang="bash" />
              </li>
              <li>
                <p className="font-medium text-foreground">Open the app</p>
                <p>Access the frontend at <InlineCode>http://localhost:4321</InlineCode> and log in with the admin credentials you set during install.</p>
              </li>
              <li>
                <p className="font-medium text-foreground">Add your LLM key</p>
                <p>Go to Settings → LLM Providers and configure your API key, base URL, and model.</p>
              </li>
            </ol>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Manual Installation ── */}
          <section data-section id="manual-install">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Manual Installation</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              If you prefer to install step by step, or if the quick start script doesn't fit your environment.
            </p>

            <h3 className="mt-8 text-base font-semibold">1. Clone the repository</h3>
            <CodeBlock code={`git clone https://github.com/rizkhal/laporan.git
cd laporan`} lang="bash" />

            <h3 className="mt-8 text-base font-semibold">2. Install dependencies</h3>
            <CodeBlock code={`rm -rf node_modules package-lock.json
npm install`} lang="bash" />

            <h3 className="mt-8 text-base font-semibold">3. Configure environment</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Create <InlineCode>apps/api/.env</InlineCode> and set the required variables:</p>
            <CodeBlock code={`PORT=1234
FRONTEND_URL=http://localhost:4321
NODE_ENV=development`} lang="bash" />

            <h3 className="mt-8 text-base font-semibold">4. Setup the database</h3>
            <CodeBlock code={`npm run db:push -w apps/api`} lang="bash" />

            <h3 className="mt-8 text-base font-semibold">5. Run the app</h3>
            <CodeBlock code={`npm run dev`} lang="bash" />
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The API starts on <InlineCode>http://localhost:1234</InlineCode> and the frontend on <InlineCode>http://localhost:4321</InlineCode>.
            </p>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Configuration ── */}
          <section data-section id="configuration">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Configuration</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              All configuration is done through environment variables in <InlineCode>apps/api/.env</InlineCode>.
            </p>

            <div className="mt-6 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-foreground">Variable</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground">Required</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground">Default</th>
                    <th className="px-4 py-3 text-left font-medium text-foreground">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground">
                  <tr>
                    <td className="px-4 py-3 font-mono text-[13px] text-foreground">PORT</td>
                    <td className="px-4 py-3">No</td>
                    <td className="px-4 py-3 font-mono text-[13px]">1234</td>
                    <td className="px-4 py-3">Internal server port</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-[13px] text-foreground">FRONTEND_URL</td>
                    <td className="px-4 py-3">Yes</td>
                    <td className="px-4 py-3 font-mono text-[13px]">—</td>
                    <td className="px-4 py-3">Public URL of your frontend (used for CORS)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-[13px] text-foreground">DATABASE_URL</td>
                    <td className="px-4 py-3">No</td>
                    <td className="px-4 py-3 font-mono text-[13px]">file:./db/dev.db</td>
                    <td className="px-4 py-3">SQLite database path</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-[13px] text-foreground">NODE_ENV</td>
                    <td className="px-4 py-3">No</td>
                    <td className="px-4 py-3 font-mono text-[13px]">development</td>
                    <td className="px-4 py-3">Set to <InlineCode>production</InlineCode> for production</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <hr className="my-16 border-border" />

          {/* ── SSH Keys ── */}
          <section data-section id="ssh-keys">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">SSH Key Setup</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              laporan uses SSH keys to authenticate with remote Git repositories. Each workspace gets its own Ed25519 key pair.
            </p>

            <h3 className="mt-8 text-base font-semibold">Generate a key</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              From the workspace Settings page, click "Generate SSH Key". The system creates a new Ed25519 key pair
              and stores the public key. You can also manage keys from the API.
            </p>

            <h3 className="mt-8 text-base font-semibold">Add to GitHub</h3>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
              <li>Copy the public key from the Settings page</li>
              <li>Go to GitHub → Settings → SSH and GPG keys</li>
              <li>Click "New SSH Key"</li>
              <li>Paste the key and save</li>
              <li>Go back to laporan and click "Test Connection"</li>
            </ol>

            <h3 className="mt-8 text-base font-semibold">Test the connection</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The "Test Connection" button runs <InlineCode>ssh -T git@github.com</InlineCode> using the workspace key.
              A successful response confirms GitHub recognizes the key.
            </p>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Repositories ── */}
          <section data-section id="repositories">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Adding Repositories</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Repositories are added per workspace. Each repository stores its remote URL, author identity filters, and clone status.
            </p>

            <h3 className="mt-8 text-base font-semibold">Add a repository</h3>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
              <li>Navigate to Repositories → Add Repository</li>
              <li>Enter the remote URL (HTTPS or SSH format)</li>
              <li>Set author names and emails to filter commits (wildcards supported)</li>
              <li>Click "Save" — the system creates a <InlineCode>clone_repository</InlineCode> job</li>
              <li>Monitor progress from the activity dropdown</li>
            </ol>

            <h3 className="mt-8 text-base font-semibold">Author identity filtering</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You can set one or more author names and emails per repository. During commit collection, only commits matching
              these identities are collected. If left empty, all authors are included.
            </p>

            <h3 className="mt-8 text-base font-semibold">Supported Git providers</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                GitHub (SSH or HTTPS)
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                GitLab (SSH or HTTPS)
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Bitbucket (SSH or HTTPS)
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Self-hosted Git servers (any SSH-accessible remote)
              </li>
            </ul>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Collections ── */}
          <section data-section id="collections">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Collections</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              A collection groups one or more repositories under a specific year and month. Each collection represents one reporting cycle.
            </p>

            <h3 className="mt-8 text-base font-semibold">Create a collection</h3>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
              <li>Go to Collections → New Collection</li>
              <li>Select the year and month</li>
              <li>Select one or more repositories</li>
              <li>Click "Create"</li>
            </ol>

            <h3 className="mt-8 text-base font-semibold">Uniqueness rules</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The system enforces the following constraints:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                A repository can only belong to one collection per month
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Same year+month+repo combination is rejected as duplicate
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Different repositories at the same month are allowed
              </li>
            </ul>

            <h3 className="mt-8 text-base font-semibold">Collection actions</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                { title: "Collect", desc: "Fetch commits from all repos in the collection" },
                { title: "Analyze", desc: "Run LLM analysis per repo" },
                { title: "Generate", desc: "Produce a report from all analyses" },
              ].map((a) => (
                <div key={a.title} className="rounded-xl border border-border bg-card p-4">
                  <p className="font-medium text-foreground">{a.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{a.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Collect Commits ── */}
          <section data-section id="collect-commits">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Collecting Commits</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              The collect operation fetches commits from each repository in a collection for the selected month.
            </p>

            <h3 className="mt-8 text-base font-semibold">How it works</h3>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground list-decimal pl-5">
              <li>
                <p className="font-medium text-foreground">Pull latest changes</p>
                <p>The system runs <InlineCode>git pull</InlineCode> on the cloned repository.</p>
              </li>
              <li>
                <p className="font-medium text-foreground">Query commits</p>
                <p>Runs <InlineCode>git log --since=&lt;month-start&gt; --until=&lt;month-end&gt;</InlineCode> filtered by configured author identities.</p>
              </li>
              <li>
                <p className="font-medium text-foreground">Collect details</p>
                <p>For each commit: hash, message, author, date, file change stats (insertions/deletions per file), and patch snippets (first 80 lines per file, max 20 files).</p>
              </li>
              <li>
                <p className="font-medium text-foreground">Store in database</p>
                <p>All data is stored in the <InlineCode>commits</InlineCode> table, keyed by collection and repository. Previous data for the same repo+collection is replaced.</p>
              </li>
            </ol>

            <h3 className="mt-8 text-base font-semibold">Noisy file filtering</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The system automatically excludes lockfiles (<InlineCode>package-lock.json</InlineCode>, <InlineCode>yarn.lock</InlineCode>),
              build artifacts (<InlineCode>dist/</InlineCode>, <InlineCode>build/</InlineCode>), and dependency directories
              (<InlineCode>node_modules/</InlineCode>, <InlineCode>vendor/</InlineCode>) from collection statistics.
            </p>

            <h3 className="mt-8 text-base font-semibold">For multi-repo collections</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Each repository gets its own collect job. Jobs queue up and run sequentially (FIFO). You can also
              collect a single repository from the collection detail page.
            </p>
          </section>

          <hr className="my-16 border-border" />

          {/* ── LLM Analysis ── */}
          <section data-section id="llm-analysis">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">LLM Analysis</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              After commits are collected, you can analyze them using an LLM provider. Each repository is analyzed independently
              to avoid token overflow and maintain context quality.
            </p>

            <h3 className="mt-8 text-base font-semibold">Configure a provider</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Go to Settings → LLM Providers and add a provider with:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Base URL (e.g., <InlineCode>https://api.openai.com/v1</InlineCode>)
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                API Key
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                Model name (e.g., <InlineCode>gpt-4o-mini</InlineCode>, <InlineCode>claude-3-haiku</InlineCode>)
              </li>
            </ul>

            <h3 className="mt-8 text-base font-semibold">What the analysis produces</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              For each repository, the LLM produces a structured JSON output containing:
            </p>
            <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
              {[
                { title: "Work items", desc: "Named items with descriptions, category, impact level (tinggi/sedang/rendah), and commit evidence" },
                { title: "Ringkasan", desc: "Executive summary in Bahasa Indonesia (2–3 paragraphs)" },
                { title: "Dampak", desc: "Technical and business impact assessment" },
                { title: "Risiko", desc: "Identified risks from the changes" },
                { title: "Rekomendasi", desc: "Recommended next steps" },
              ].map((item) => (
                <li key={item.title} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="text-muted-foreground"> — {item.desc}</span>
                  </div>
                </li>
              ))}
            </ul>

            <h3 className="mt-8 text-base font-semibold">Editing analysis results</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              After analysis completes, you can edit the results from the collection detail page. Click on any work item
              to modify its title, description, category, or impact level. Changes are saved per repository.
            </p>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Reports ── */}
          <section data-section id="reports">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Report Generation</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              laporan offers three report styles, each designed for a different audience and purpose.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                {
                  name: "Simple Report",
                  audience: "Quick internal recap",
                  content: "Executive summary, work items, statistics, conclusion",
                  icon: "S",
                },
                {
                  name: "Executive Summary",
                  audience: "Management and leadership",
                  content: "Key metrics, risks, recommendations, business-focused",
                  icon: "E",
                },
                {
                  name: "Office Report",
                  audience: "Formal government/enterprise report",
                  content: "Cover, Kata Pengantar, Daftar Isi, structured sections (I–IV), Kesimpulan, Appendices A–F",
                  icon: "O",
                },
              ].map((style) => (
                <div key={style.name} className="rounded-xl border border-border bg-card p-5">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                    {style.icon}
                  </span>
                  <p className="mt-4 font-medium text-foreground">{style.name}</p>
                  <p className="text-sm text-muted-foreground">{style.audience}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{style.content}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-8 text-base font-semibold">Editing reports</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reports are generated as Markdown. The built-in editor provides a live split view — edit the raw Markdown
              on the left and see the rendered preview update in real time. This allows you to fine-tune the report
              before finalizing it.
            </p>

            <h3 className="mt-8 text-base font-semibold">Download</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reports can be downloaded as <InlineCode>.md</InlineCode> files directly from the report detail page.
            </p>
          </section>

          <hr className="my-16 border-border" />

          {/* ── Troubleshooting ── */}
          <section data-section id="troubleshooting">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Troubleshooting</h2>

            <div className="mt-6 space-y-6">
              {[
                {
                  q: "Connection refused on port 1234",
                  a: "Check if the API server is running. Common causes: missing <InlineCode>.env</InlineCode> file, database not migrated (<InlineCode>npm run db:push -w apps/api</InlineCode>), or port already in use.",
                },
                {
                  q: "SSH key test fails",
                  a: "Verify the public key is added to GitHub (Settings → SSH and GPG keys). Ensure the key was generated from the correct workspace. Run <InlineCode>ssh -T git@github.com</InlineCode> manually from the server to test.",
                },
                {
                  q: "Clone operation fails",
                  a: "Check that the repository URL is correct and accessible. If using SSH, verify the key is added to GitHub. If using HTTPS, the repository must be public or you need to configure a credential helper.",
                },
                {
                  q: "No commits collected",
                  a: "Verify that author names/emails are configured correctly. The system filters by these identities — if they don't match any committers in the selected period, no commits will be returned. Also check that the repository has commits during the selected month.",
                },
                {
                  q: "LLM analysis fails",
                  a: "Check that your LLM API key is valid and has quota. Verify the base URL and model name are correct. The analysis prompt includes patch snippets — large commits may exceed token limits. Try using a model with larger context window.",
                },
                {
                  q: "Blank page after deployment",
                  a: "Ensure Nginx is configured to serve the frontend files and proxy API requests. Check that <InlineCode>FRONTEND_URL</InlineCode> matches your public domain. Verify the frontend was built (<InlineCode>npm run build -w apps/web</InlineCode>).",
                },
                {
                  q: "How to reset the database",
                  a: "Stop the API, delete the database file, and re-run the migration: <InlineCode>rm apps/api/db/dev.db && npm run db:push -w apps/api</InlineCode>.",
                },
                {
                  q: "Npm install fails on Linux",
                  a: "If you cloned from macOS, always run <InlineCode>rm -rf node_modules package-lock.json</InlineCode> before installing on Linux. This ensures platform-specific binaries (esbuild, lightningcss) are downloaded for the correct architecture.",
                },
              ].map((item) => (
                <details key={item.q} className="group rounded-xl border border-border">
                  <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="border-t border-border px-5 pb-4 pt-3 text-sm leading-6 text-muted-foreground" dangerouslySetInnerHTML={{ __html: item.a }} />
                </details>
              ))}
            </div>
          </section>

          <hr className="my-16 border-border" />

          {/* ── FAQ ── */}
          <section data-section id="faq">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Frequently Asked Questions</h2>

            <div className="mt-6 space-y-6">
              {[
                {
                  q: "Do I need an internet connection to use laporan?",
                  a: "The API server, database, and frontend run entirely on your server. Internet is only needed for: (1) fetching commits from remote Git repositories, and (2) sending commit data to your LLM provider for analysis.",
                },
                {
                  q: "What data leaves my server?",
                  a: "Only commit messages, file paths, diff statistics, and patch snippets are sent to your configured LLM provider. No SSH keys, no database contents, and no report drafts leave your server unless you explicitly share them.",
                },
                {
                  q: "Which LLM providers are supported?",
                  a: "Any OpenAI-compatible API provider. This includes OpenAI (GPT-4, GPT-4o), Anthropic via API proxy, Ollama (self-hosted), Groq, Together AI, Azure OpenAI, and local models via vLLM or LocalAI. Configure the base URL, API key, and model name in Settings.",
                },
                {
                  q: "Can I use laporan with self-hosted Git servers?",
                  a: "Yes. If the server is accessible via SSH from your laporan instance, you can add it as a repository. The system uses standard git commands over SSH.",
                },
                {
                  q: "Is there a user limit?",
                  a: "No. laporan is self-hosted and does not enforce any user, workspace, or repository limits. The only constraints are your server's resources (CPU, memory, disk).",
                },
                {
                  q: "Can I customize the report templates?",
                  a: "Yes. Reports are generated as Markdown and can be edited in the built-in split editor before finalizing. You can also modify the report strategy code directly if you need structural changes.",
                },
                {
                  q: "How is data backed up?",
                  a: "The entire database is a single SQLite file at <InlineCode>apps/api/db/dev.db</InlineCode>. Clone and repository storage is at <InlineCode>/opt/laporan/repos/</InlineCode>. Back up these two locations. incremental backups are safe with SQLite.",
                },
                {
                  q: "What happens if the server restarts during a job?",
                  a: "Running jobs are marked as failed on startup. The repository clone status is reset. You can retry the job manually from the UI. The one-at-a-time FIFO queue prevents data corruption.",
                },
              ].map((item) => (
                <details key={item.q} className="group rounded-xl border border-border">
                  <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="border-t border-border px-5 pb-4 pt-3 text-sm leading-6 text-muted-foreground" dangerouslySetInnerHTML={{ __html: item.a }} />
                </details>
              ))}
            </div>
          </section>

        </main>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-border px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>laporan, monthly dev report &mdash; documentation</span>
          <div className="flex items-center gap-4">
            <a href="/" className="transition-colors hover:text-foreground">Home</a>
            <DocLink href="https://github.com/rizkhal/laporan">GitHub</DocLink>
          </div>
        </div>
      </footer>
    </div>
  );
}
