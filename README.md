# Monthly Dev Report

An internal web application for generating monthly software development reports from multiple Git repositories. Collects commits, analyzes them via LLM, and produces formatted reports in multiple styles (Simple, Executive, Office) with optional Google Docs export.

## Tech Stack

- **Backend:** Hono (TypeScript), Drizzle ORM, SQLite (better-sqlite3)
- **Frontend:** React 18, Vite, Tailwind CSS v4, shadcn/ui components
- **Database:** SQLite via better-sqlite3
- **Analysis:** OpenAI-compatible LLM API
- **Export:** Google Docs API (optional)

## Project Structure

```
report/
├── package.json                  # Workspace root
├── apps/
│   ├── api/                      # Hono backend server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── vitest.config.ts
│   │   ├── index.ts              # Server entry point
│   │   ├── db/                   # Drizzle schema & DB connection
│   │   ├── routes/               # API route handlers
│   │   ├── services/             # Git collector, LLM analyzer, report formatter
│   │   ├── lib/                  # Auth helpers
│   │   └── tests/                # Vitest test suite
│   └── web/                      # React + Vite frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── components/       # Layout, toast, activity center, shadcn UI
│           ├── pages/            # Dashboard, Repositories, Collections, Settings
│           └── lib/              # API fetch helpers, auth context, protected route
├── tsconfig.json                 # Root TS references
└── .gitignore
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Git (for commit collection)
- SSH key pair added to GitHub (for private repos)
- An OpenAI-compatible LLM API key (optional, for analysis)

### Setup

```bash
# Install dependencies (workspaces hoisted to root)
npm install

# Push database schema
npm run db:push

# Start development servers (frontend + backend concurrently)
npm run dev
```

This starts:
- **API server:** http://localhost:3000
- **Web frontend:** http://localhost:5173

The frontend calls the API directly at `http://localhost:3000` (no proxy).

### Individual Start

```bash
# Frontend only
npm run dev -w apps/web

# Backend only
npm run dev -w apps/api
```

### Environment Variables

```env
# Google OAuth (optional — for Google Docs export)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback

# Frontend URL (for OAuth redirect)
FRONTEND_URL=http://localhost:5173
```

## Features

### Repository Management
- Add remote Git repositories (GitHub, GitLab, etc.) by URL
- SSH key generation per workspace (Ed25519) — add the public key to GitHub
- Automatic cloning and periodic refresh via background jobs
- Author identity filtering (names/emails) per repository

### Monthly Collections
- Create monthly collections by selecting year, month, and repos
- Per-repo uniqueness: same repo can't be in two collections for the same period
- Collect commits filtered by configured author identities
- Stores commit details: hash, diff stats, patch snippets, changed files
- Background job queue — one repo at a time, cancelable

### LLM Analysis
- Configure OpenAI-compatible LLM providers (base URL, API key, model)
- Analyze one repository at a time to avoid token overflow
- Structured JSON output: work items, categories, impact, evidence
- Manual editing support for analysis results
- Per-repo analyze button for multi-repo collections

### Report Generation
Three report styles available:

| Style | Purpose | Format |
|-------|---------|--------|
| **Simple Report** | Quick internal monthly recap | Executive summary, work items, statistics, conclusion |
| **Executive Summary** | Management and leadership | Key metrics, risks, recommendations, business-focused |
| **Office Report** | Formal government/enterprise report | Cover, Kata Pengantar, Daftar Isi, structured sections (I–IV), Kesimpulan, Appendices A–F |

Reports are generated as Markdown with a live split-editor (edit raw Markdown / preview rendered).

### Google Docs Export (Optional)
- Connect a Google account via OAuth 2.0
- Export any generated report to Google Docs
- Exported document uses proper heading styles (H1/H2/H3)
- Background job queue for export — progress tracking
- Document naming: `Laporan Kemajuan Pekerjaan - <Period> - <Workspace Name>`
- OAuth tokens stored per workspace

### Activity Center
- Real-time background job status via the activity dropdown
- View queue position and progress for collect, analyze, generate, and export jobs

## Database

SQLite database stored at `apps/api/db/dev.db`. Schema managed via Drizzle ORM with 15 tables:

| Table | Purpose |
|-------|---------|
| `users` | User accounts (name, email, password hash) |
| `sessions` | Auth session tokens |
| `workspaces` | Multi-tenant workspaces |
| `workspace_members` | User-to-workspace membership with roles |
| `ssh_keys` | Ed25519 SSH key fingerprints per workspace |
| `repositories` | Git repos with remote URL, local path, clone status |
| `collections` | Monthly commit collections (year/month/repo selection) |
| `collection_repos` | Junction table for per-repo uniqueness per period |
| `commits` | Collected commit data with diff stats and snippets |
| `llm_providers` | LLM API configuration (base URL, model, API key) |
| `analyses` | LLM analysis results per repo per collection |
| `reports` | Generated report Markdown content |
| `report_templates` | Custom Markdown report templates |
| `google_integrations` | Google OAuth tokens per workspace |
| `jobs` | Background job queue (collect, analyze, generate, export) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both API and web dev servers |
| `npm run build` | Build frontend for production |
| `npm run db:push` | Push Drizzle schema to SQLite |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run workspace migration script |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run test` | Run API test suite (Vitest) |

## Workflow

1. **Add Repositories** → Configure remote URL and author identities
2. **Generate SSH Key** → Add the public key to GitHub (Settings → SSH keys)
3. **Test Connection** → Verify GitHub access via workspace SSH key
4. **Create Collection** → Select year, month, and one or more repositories
5. **Collect Commits** → Fetches commits matching author identities for selected repos
6. **Analyze** → Sends commits to LLM for structured analysis (per repo)
7. **Generate Report** → Choose a style and produce a formatted Markdown report
8. **Edit & Save** → Edit the Markdown directly in the split editor
9. **Export** → Download as `.md` or export to Google Docs (with native TOC)

## Testing

```bash
# Run all API tests
npm run test
```

Tests use an isolated temporary SQLite database (no data loss). 17 tests covering collection CRUD, repo uniqueness validation, and error handling.

## Important Notes

- All git commands run asynchronously via `child_process.spawn()` — non-blocking
- Lockfiles and build artifacts are automatically excluded from commit collection
- LLM analysis processes one repository at a time to avoid token overflow
- Analysis results are evidence-based (linked to commit hashes and file paths)
- Background jobs are processed sequentially — one at a time, FIFO order
- Stuck jobs from a server restart are automatically marked as failed
- The app runs entirely locally — no external data storage
- Google Docs export requires OAuth configuration (see Environment Variables above)
