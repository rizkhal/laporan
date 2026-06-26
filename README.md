# Monthly Dev Report

An internal web application for generating monthly software development reports from multiple Git repositories. Collects commits, analyzes them via LLM, and produces formatted reports in multiple styles (Simple, Executive, Office).

## Tech Stack

- **Backend:** Hono (TypeScript), Drizzle ORM, SQLite (better-sqlite3)
- **Frontend:** React 18, Vite, Tailwind CSS v4, shadcn/ui components
- **Database:** SQLite via better-sqlite3
- **Analysis:** OpenAI-compatible LLM API

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
│   │   ├── src/                  # Source code (routes, services, db, lib)
│   │   │   ├── index.ts          # Server entry point
│   │   │   ├── db/               # Drizzle schema & DB connection
│   │   │   ├── routes/           # API route handlers
│   │   │   ├── services/         # Git collector, LLM analyzer, report formatter
│   │   │   └── lib/              # Auth helpers, rate limiter
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
# Server port
PORT=3000

# Frontend URL (for CORS)
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

### Activity Center
- Real-time background job status via the activity dropdown
- View queue position and progress for collect, analyze, and generate jobs

## Database

SQLite database stored at `apps/api/db/dev.db`. Schema managed via Drizzle ORM with 14 tables:

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
| `jobs` | Background job queue (collect, analyze, generate) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both API and web dev servers |
| `npm run build -w apps/web` | Build frontend for production |
| `npm run db:push` | Push Drizzle schema to SQLite |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run workspace migration script |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run test -w apps/api` | Run API test suite (Vitest) |

## Workflow

1. **Add Repositories** → Configure remote URL and author identities
2. **Generate SSH Key** → Add the public key to GitHub (Settings → SSH keys)
3. **Test Connection** → Verify GitHub access via workspace SSH key
4. **Create Collection** → Select year, month, and one or more repositories
5. **Collect Commits** → Fetches commits matching author identities for selected repos
6. **Analyze** → Sends commits to LLM for structured analysis (per repo)
7. **Generate Report** → Choose a style and produce a formatted Markdown report
8. **Edit & Save** → Edit the Markdown directly in the split editor

## Testing

```bash
# Run all API tests
npm run test -w apps/api
```

Tests use an isolated temporary SQLite database (no data loss). Tests cover collection CRUD, repo uniqueness validation, and error handling.

## Deployment (aaPanel / Linux VPS)

### Prerequisites (Server)
- Node.js 18+ (LTS recommended)
- PM2 (`npm install -g pm2`)
- Git
- aaPanel with Nginx (or any reverse proxy)

### Server Setup

```bash
# 1. Clone the repository
cd /www/wwwroot
git clone <your-repo-url> laporan.rizkal.space
cd laporan.rizkal.space

# 2. Install dependencies (clean install on Linux)
rm -rf node_modules package-lock.json
npm install

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your settings:
#   - PORT=3000 (internal, no need to change)
#   - FRONTEND_URL=https://laporan.rizkal.space

# 4. Build frontend
npm run build -w apps/web

# 5. Push database schema
npm run db:push -w apps/api

# 6. Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Nginx Reverse Proxy (aaPanel)

Create a new website in aaPanel, then configure the reverse proxy:

```nginx
server {
    listen 80;
    server_name laporan.rizkal.space;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name laporan.rizkal.space;

    ssl_certificate /www/server/panel/vhost/cert/laporan.rizkal.pace/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/laporan.rizkal.space/privkey.pem;

    # Frontend (Vite preview or static files)
    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
    }

    # Increase body size for report data
    client_max_body_size 10M;
}
```

**Alternative:** Serve frontend static files directly via Nginx (no `vite preview` needed):

```nginx
# Build the frontend first:
#   npm run build -w apps/web
# This creates apps/web/dist/

location / {
    root /www/wwwroot/laporan.rizkal.space/apps/web/dist;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```

### PM2 Configuration

The project includes `ecosystem.config.cjs` at the root. Ensure it's configured:

```javascript
module.exports = {
  apps: [{
    name: "laporan-api",
    cwd: "/www/wwwroot/laporan.rizkal.space",
    script: "apps/api/src/index.ts",
    interpreter: "node_modules/.bin/tsx",
    env: {
      NODE_ENV: "production",
    },
  }],
};
```

### Important Notes for Linux Deployment

1. **Platform binaries:** If you deployed from macOS, reinstall dependencies on the Linux server:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **esbuild/lightningcss binaries:** These platform-specific packages must be installed on the target OS. The `.npmrc` with `optional=true` ensures they install correctly.

3. **Database path:** The API resolves the DB path dynamically. Ensure `apps/api/db/` directory exists:
   ```bash
   mkdir -p apps/api/db
   ```

4. **PM2 restart:** Never use `kill -9` on port 3000 — it may interfere with other processes. Use:
   ```bash
   pm2 restart laporan-api
   ```

5. **Logs:**
   ```bash
   pm2 logs laporan-api
   pm2 monit
   ```

## Important Notes

- All git commands run asynchronously via `child_process.spawn()` — non-blocking
- Lockfiles and build artifacts are automatically excluded from commit collection
- LLM analysis processes one repository at a time to avoid token overflow
- Analysis results are evidence-based (linked to commit hashes and file paths)
- Background jobs are processed sequentially — one at a time, FIFO order
- Stuck jobs from a server restart are automatically marked as failed
- The app runs entirely locally — no external data storage
