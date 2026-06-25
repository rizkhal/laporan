# Monthly Dev Report

An internal web application for generating monthly software development reports from multiple Git repositories. Collects commits, analyzes them via LLM, and produces formatted Markdown reports.

## Tech Stack

- **Backend:** Hono (TypeScript), Drizzle ORM, SQLite (better-sqlite3)
- **Frontend:** React 18, Vite, Tailwind CSS v4, shadcn/ui components
- **Database:** SQLite via better-sqlite3
- **Analysis:** OpenAI-compatible LLM API

## Project Structure

```
report/
├── package.json              # Workspace root
├── apps/
│   ├── api/                  # Hono backend server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── index.ts          # Server entry point
│   │   ├── db/               # Drizzle schema & DB connection
│   │   ├── routes/           # API route handlers
│   │   └── services/         # Git collector, LLM analyzer, report formatter
│   └── web/                  # React + Vite frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── components/   # Layout & shadcn UI components
│           ├── pages/        # Dashboard, Repositories, Collections, Settings
│           └── lib/          # Utilities & API helpers
├── tsconfig.json             # Root TS references
└── .gitignore
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Git (for commit collection)
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

## Features

### Phase 1: Git Commit Collector
- Manage repositories with author identities (names/emails)
- Create monthly collections by selecting year/month
- Collect commits filtered by author identity from local Git repos
- Excludes noisy files: lockfiles, build artifacts, node_modules, etc.
- Stores commit details: hash, diff stats, patch snippets, changed files

### Phase 2: LLM Analyzer
- Configure OpenAI-compatible LLM providers (base URL, API key, model)
- Analyze one repository at a time to avoid token overflow
- Structured JSON output: work items, categories, impact, evidence
- Manual editing support for analysis results

### Phase 3: Report Formatter
- Generate monthly reports from all repo analyses
- Markdown output with customizable templates
- Manual editing before export
- Export-ready format

## Database

SQLite database stored at `apps/api/db/dev.db`. Schema managed via Drizzle ORM with 7 tables:
- `repositories` — Git repos with paths and author identities
- `collections` — Monthly commit collections (year/month)
- `commits` — Collected commit data with diff stats
- `llm_providers` — LLM API configuration
- `analyses` — LLM analysis results per repo per collection
- `report_templates` — Markdown templates with placeholders
- `reports` — Generated report content

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both API and web dev servers |
| `npm run build` | Build frontend for production |
| `npm run db:push` | Push Drizzle schema to SQLite |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:studio` | Open Drizzle Studio |

## Workflow

1. **Add Repositories** → Configure local paths and author identities
2. **Create Collection** → Select year/month
3. **Collect Commits** → Fetches commits matching author identities
4. **Analyze** → Sends commits to LLM for structured analysis
5. **Generate Report** → Produces formatted Markdown report
6. **Export** → Copy or download the report

## Important Notes

- All git commands run locally via `child_process.execSync()`
- Lockfiles and build artifacts are automatically excluded
- LLM analysis processes one repository at a time
- Analysis results are evidence-based (linked to commit hashes and file paths)
- The app runs entirely locally — no external data storage
