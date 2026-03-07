# Git Weekly Report

A modern web application that syncs commits from GitHub and generates beautiful weekly development reports with analytics and summaries.

## Key Features

- **Database-First Architecture**: Commits are loaded from database on page load (fast & efficient)
- **Smart Sync Mechanism**: Manual sync from GitHub updates database with pagination support
- **Repository Configuration**: Easy setup with GitHub repository credentials
- **Commit Analytics**: Track commits, contributors, and changes per week
- **Intelligent Navigation**: Custom back button with history tracking
- **Statistics**: Real-time commit metrics and contributor analysis
- **Commit List**: Browse all commits with authors, dates, and commit types
- **Modern UI**: Clean, minimal interface built with React and Tailwind CSS
- **Type-Safe**: Full TypeScript support with strict type checking
- **Historical Data**: All commits automatically persisted in SQLite database
- **Responsive Design**: Works seamlessly on desktop and mobile

## Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **React Router v7** - Client-side routing
- **Tailwind CSS** - Styling (no external UI component libraries)
- **React Hook Form** - Form state management
- **Chart.js** - Data visualization

### Backend
- **Express.js** - REST API server
- **Prisma 7** - ORM for database operations
- **SQLite** - Database with better-sqlite3 adapter
- **GitHub API** - Commit data source
- **TypeScript** - Type safety

### DevTools
- **Bun** - JavaScript runtime and package manager
- **tsx** - TypeScript executor with watch mode
- **Concurrently** - Run multiple dev servers simultaneously

## Installation

### Prerequisites
- Node.js 18+ or Bun 1.3+
- GitHub Personal Access Token (for accessing repository data)

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd weekly-report
```

2. **Install dependencies**
```bash
bun install
# or
npm install
```

3. **Configure environment**
Create a `.env` file in the root:
```env
# Backend
DATABASE_URL="file:./server/prisma/dev.db"

# Frontend (optional - defaults to http://localhost:3000)
VITE_API_BASE="http://localhost:3000"
VITE_GITHUB_TOKEN="your_github_token_here"
```

4. **Setup database**
```bash
bun run prisma:migrate
# This creates tables: Setting and Commit with relationships
```

If updating from previous version, migration will:
- Add `settingId` foreign key to Commit table
- Add `sha` (unique), `email`, `url` fields to Commit
- Create indexes for performance
- Establish Setting → Commit relationship

5. **Start development server**
```bash
bun run dev
```

This starts both frontend (port 5173) and backend (port 3000) concurrently.

## Usage

### 1. Configure Repository

1. Open the app at `http://localhost:5173`
2. Click the **Settings** link in the navigation
3. Enter your repository details:
   - **Owner**: GitHub username or organization
   - **Repository**: Repository name
   - **Branch**: Default branch (e.g., `main`)
   - **Token**: GitHub Personal Access Token
4. Click **Save Settings**

### 2. Sync Commits from GitHub

Click the **Sync** button in the header to fetch commits from GitHub. This will:
- Fetch commits from the past 12 months (with pagination)
- Calculate ISO week number for each commit
- Save/update commits in database (upsert)
- Update the `lastSync` timestamp

**Note**: Page load displays commits from database (fast). Only click Sync to update from GitHub.

### 3. View Dashboard

The dashboard displays:
- **Weekly Blocks**: Each week with commit counts and statistics (from database)
- **Commit Stats**: Number of commits, files changed, and contributors
- **Commit Details**: Click a week to see all commits for that week
- **Last Sync**: Shows when commits were last synced from GitHub

### 4. Navigate Pages

Use the navigation links:
- Dashboard (`/`) - View all weeks
- Settings (`/settings`) - Configure repository

The back button intelligently navigates to your previous page using `useBack()` hook.

## Project Structure

```
weekly-report/
├── server/                          # Backend (Express + Prisma)
│   ├── index.ts                     # Main server file
│   ├── config/db.ts                 # Prisma client configuration
│   ├── routes/
│   │   ├── settings.ts              # Repository settings endpoints
│   │   └── commits.ts               # Commit fetch endpoints
│   └── prisma/
│       ├── schema.prisma            # Database schema
│       ├── migrations/              # Database migrations
│       └── dev.db                   # SQLite database file
│
├── src/                             # Frontend (React + Vite + Router)
│   ├── main.tsx                     # Entry point with BrowserRouter
│   ├── index.css                    # Tailwind directives
│   ├── types.d.ts                   # TypeScript type definitions
│   ├── pages/
│   │   ├── Dashboard.tsx            # Main dashboard page
│   │   └── Setting.tsx              # Settings configuration page
│   ├── components/
│   │   └── ui/                      # Reusable UI primitives
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Input.tsx
│   │       ├── Container.tsx
│   │       ├── SectionHeader.tsx
│   │       ├── WeekBlock.tsx        # Weekly data block component
│   │       ├── CommitRow.tsx        # Commit list item
│   │       ├── CommitTag.tsx        # Commit type tag (feat, fix, etc)
│   │       ├── Avatar.tsx           # User avatar display
│   │       ├── ErrorBanner.tsx      # Error message display
│   │       ├── SkeletonBlock.tsx    # Loading skeleton
│   │       └── SummaryCard.tsx      # Summary card display
│   ├── context/
│   │   └── HistoryContext.tsx       # Navigation history context
│   ├── hooks/
│   │   └── useBack.tsx              # Custom hook for back navigation
│   ├── config/
│   │   └── theme.ts                 # Theme colors and configuration
│   ├── api/
│   │   ├── github.ts                # GitHub API client
│   │   └── settings.ts              # Settings API client
│   └── utils/
│       ├── cn.ts                    # Classname utility
│       └── date.ts                  # Date & week grouping utilities
│
├── package.json                     # Dependencies and scripts
├── vite.config.js                   # Vite configuration
├── tailwind.config.js               # Tailwind CSS configuration
├── tsconfig.json                    # TypeScript configuration
└── README.md                        # This file
```

## API Endpoints

### Settings Routes
**Base URL**: `http://localhost:3000/api/settings`

#### GET /api/settings
Retrieve current repository configuration.

**Response** (200 OK):
```json
{
  "id": 1,
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "token": "ghp_...",
  "lastSync": "2026-03-07T12:30:00Z",
  "createdAt": "2026-03-06T10:00:00Z",
  "updatedAt": "2026-03-07T12:30:00Z"
}
```

**Response** (404 Not Found):
```json
{
  "message": "Settings not found"
}
```

#### POST /api/settings
Create or update repository configuration.

**Request Body**:
```json
{
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "token": "ghp_..."
}
```

**Response** (200 OK):
```json
{
  "id": 1,
  "owner": "username",
  "repo": "repository-name",
  "branch": "main",
  "token": "ghp_...",
  "lastSync": null,
  "createdAt": "2026-03-07T12:30:00Z",
  "updatedAt": "2026-03-07T12:30:00Z"
}
```

### Commits Routes
**Base URL**: `http://localhost:3000/api/commits`

#### GET /api/commits
**Load commits from database (Database First approach)**

**Response** (200 OK):
```json
{
  "commits": [
    {
      "id": "abc123def",
      "sha": "abc123def456...",
      "message": "feat: add settings endpoint",
      "author": "John Doe",
      "email": "john@example.com",
      "date": "2026-03-07T10:00:00Z",
      "week": 10,
      "year": 2026,
      "url": "https://github.com/owner/repo/commit/abc123def456",
      "settingId": 1,
      "createdAt": "2026-03-07T10:00:00Z",
      "updatedAt": "2026-03-07T10:00:00Z"
    }
  ],
  "lastSync": "2026-03-07T14:30:00Z",
  "count": 45,
  "message": "No commits synced yet. Click sync to fetch commits." // optional, only if empty
}
```

**Response** (400 Bad Request):
```json
{
  "message": "Repository settings not configured."
}
```

#### POST /api/commits/sync
**Sync commits from GitHub and update database**

Fetches commits from GitHub API (12 months, paginated), calculates week/year, and upserts to database.

**Response** (200 OK):
```json
{
  "message": "Successfully synced 45 commits",
  "commits": [...],
  "lastSync": "2026-03-07T14:35:00Z",
  "count": 45
}
```

**Response** (400 Bad Request):
```json
{
  "message": "GitHub API error: Unauthorized"
}
```

#### POST /api/commits/ai/summary
**Generate AI summary from commit messages**

**Request Body**:
```json
{
  "commits": ["feat: add settings", "fix: resolve CORS issue", ...]
}
```

**Response**:
```json
{
  "summary": "This week we implemented the settings page, fixed CORS issues..."
}
```

## Database Schema

### Setting Model
Stores repository configuration for GitHub API access and sync tracking.

```prisma
model Setting {
  id        Int       @id @default(autoincrement())
  owner     String    // GitHub username or organization
  repo      String    // Repository name
  branch    String    // Git branch (e.g., "main")
  token     String    // GitHub Personal Access Token
  lastSync  DateTime? // Last successful sync timestamp
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  
  commits   Commit[]  // One-to-many relationship to commits
}
```

### Commit Model
Stores all synced commits with week grouping and metadata.

```prisma
model Commit {
  id        String    @id          // Short SHA (first 12 chars) for quick access
  sha       String    @unique      // Full GitHub SHA (40 chars)
  message   String                 // Commit message
  author    String                 // Author name
  email     String?                // Author email (optional)
  date      DateTime               // Commit date/time
  week      Int                    // ISO 8601 week number
  year      Int                    // Year for grouping
  url       String?                // GitHub commit URL
  
  settingId Int                    // Foreign key to Setting
  setting   Setting   @relation(...) // One-to-many relationship
  
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  
  @@index([year, week])            // Fast week-based queries
  @@index([date])                  // Fast date-based queries
  @@index([settingId])             // Fast per-repository queries
}
```

## Configuration

### GitHub Personal Access Token

To sync commits, you need a GitHub Personal Access Token:

1. Go to [GitHub Settings → Developer settings → Personal access tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token**
3. Grant these scopes:
   - `public_repo` - Access public repositories
   - `repo` - Access private repositories (if needed)
4. Copy the token and paste it in Settings

### Environment Variables

```env
# Backend Database
DATABASE_URL="file:./server/prisma/dev.db"

# Frontend API Base URL (optional)
VITE_API_BASE="http://localhost:3000"

# Your GitHub Token (for frontend API calls)
VITE_GITHUB_TOKEN="ghp_..."
```

## Development Workflow

### Start Development Servers
```bash
bun run dev
```
Starts both Vite (port 5173) and Express (port 3000) with hot reload.

### Development Commands

```bash
# Vite frontend only
bun run dev:web

# Express backend only (with watch)
bun run dev:server

# Build for production
bun run build

# Preview production build
bun run preview

# Prisma CLI
bun run prisma:migrate    # Create new migration
bun run prisma:generate   # Regenerate Prisma client
bun run prisma:studio     # Open Prisma Studio (visual DB editor)

# Database reset (caution: deletes all data)
bun run db:reset
```

### Development Features

**Hot Module Replacement (HMR)**
- Vite enables instant UI updates on file changes
- No page refresh needed during development

**TypeScript Compilation**
- All files are type-checked with TypeScript
- Full IDE autocomplete and error checking

**Backend Watch Mode**
- tsx automatically restarts server on file changes
- Useful for testing API changes

### Project Configuration Files

- **vite.config.js** - Vite settings, proxy configuration
- **tailwind.config.js** - Tailwind CSS customization
- **tsconfig.json** - TypeScript compiler options
- **postcss.config.js** - CSS processing
- **prisma.config.ts** - Custom Prisma configuration

## Architecture

### Routing
- **React Router v7** handles client-side routing
- Routes defined in `src/main.tsx`:
  - `/` - Dashboard (list of weeks)
  - `/settings` - Settings configuration
- Navigation history tracked via `HistoryContext`
- Custom `useBack()` hook for intelligent back navigation

### State Management
- Dashboard uses React's `useState` for:
  - Weeks data grouped by ISO week dates
  - Sync status and error handling
  - Loading states
- `HistoryContext` tracks browser history for back navigation

### Data Flow
```
GitHub API
    ↓
Fetch /api/commits
    ↓
Express Backend (commits.ts)
    ↓
Fetch from GitHub, return commits array
    ↓
React Dashboard
    ↓
groupByWeek() utility → organize by week (ISO 8601)
    ↓
Render weekly blocks with commit data
```

### Component Architecture

**UI Primitives** (`components/ui/`)
- Reusable, basic components: Button, Card, Input, Container
- WeekBlock: Displays week summary with commit stats
- CommitRow: Individual commit display with metadata
- CommitTag: Visual tag for commit type (feat, fix, etc)
- Avatar: User profile image display
- ErrorBanner: Error message display
- SkeletonBlock: Loading placeholder

**Type System** (`types.d.ts`)
```typescript
interface IGithubCommit {
  sha: string
  commit: { author: { name: string; date: string }, message: string }
  author: { login: string; avatar_url: string } | null
  html_url: string
}

interface IWeekGroup {
  week: string          // ISO week like "2026-W10"
  label: string         // Human-readable date range
  commits: IGithubCommit[]
}
```

### Weekly Grouping Algorithm
- Uses ISO 8601 week format (YYYY-W##)
- `getISOWeek()` calculates correct international week number
- `getWeekLabel()` generates human-readable format: "Mar 10 – Mar 16"
- `groupByWeek()` organizes commits by week and sorts newest first

### Theme & Styling
- Tailwind CSS with custom configuration
- Commit type colors defined in `config/theme.ts`:
  - feat: Green (#22c55e)
  - fix: Orange (#f97316)
  - refactor: Purple (#8b5cf6)
  - docs: Blue (#3b82f6)
  - test: Cyan (#06b6d4)
  - chore: Gray (#6b7280)

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Modern mobile browsers

## Performance Considerations

- **Frontend**: Vite with code splitting for fast load times
- **Backend**: Single Prisma client instance with better-sqlite3 adapter
- **Database**: SQLite with indexed queries on year/week/date
- **API Caching**: GitHub API results stored in database to reduce API calls
- **CORS**: Configured for development (localhost:5173 and :3000)

## Troubleshooting

### "Settings not configured" error
**Solution**: Navigate to `/settings` page and save your repository configuration.

### Commits not loading
**Solutions**:
- Check GitHub token is valid (tokens can expire or be regenerated)
- Verify repository owner and name are correct
- Ensure branch exists in the repository
- Check browser console (F12) for API error messages
- Check server console for backend errors

### CORS errors
**Solution**: These should be automatically handled by Vite proxy. If occurring in production:
- Ensure backend CORS is configured for your frontend URL
- Check `server/index.ts` CORS configuration

### Database errors
**Solution**: Run `bun run db:reset` to reset the database and migrations.

### Route not found (404 on page navigation)
**Solution**: Ensure React Router is properly configured in `main.tsx` with correct routes defined.

### Styles not appearing
**Solution**: 
- Rebuild Tailwind CSS: `npm run build`
- Check `tailwind.config.js` includes correct file paths
- Check `src/index.css` has Tailwind directives

## Custom Utilities & Hooks

### Date Utilities (`src/utils/date.ts`)

**getISOWeek(dateStr: string): string**
- Calculates ISO 8601 week number
- Returns format: "2026-W10"
- Handles year boundary transitions correctly

**getWeekLabel(dateStr: string): string**
- Generates human-readable week range
- Returns format: "Mar 10 – Mar 16"
- Useful for week headers and UI display

**groupByWeek(commits: IGithubCommit[]): IWeekGroup[]**
- Groups commits by ISO week
- Returns sorted array (newest first)
- Includes both week key and human-readable label

### Class Name Utility (`src/utils/cn.ts`)

**cn(...classes): string**
- Combines Tailwind CSS classes
- Filters out falsy values (false, null, undefined)
- Useful for conditional styling:
```typescript
cn(
  "base classes",
  isActive && "active-classes",
  isDark && "dark-classes"
)
```

### Custom Hooks (`src/hooks/`)

**useBack()**
- Navigates to previous page in history
- Falls back to home "/" if no history
- Uses `HistoryContext` for tracking
- Integrates with React Router's `useNavigate()`

### Context (`src/context/`)

**HistoryProvider**
- Wraps app to track navigation history
- Maintains array of visited paths
- Used by `useBack()` hook for intelligent navigation

**useAppHistory()**
- Hook to access navigation history
- Returns: `string[]` of visited paths

## License

MIT

## Sync Mechanism Documentation

For detailed information about how the Database-First sync mechanism works, see:
- **[SYNC_MECHANISM.md](./SYNC_MECHANISM.md)** - Complete technical documentation
- **[SYNC_IMPLEMENTATION.md](./SYNC_IMPLEMENTATION.md)** - Implementation details and setup

Key points:
- ⚡ **Database First**: Loads from DB on page load (fast, no API calls)
- 🔄 **Manual Sync**: Click "Sync" to fetch from GitHub and update DB
- 💾 **Historical Data**: Commits are persisted in SQLite
- 📊 **Pagination**: Fetches 12 months of commits with automatic pagination

## Future Enhancements

- [ ] Pull request analytics
- [ ] Code review statistics
- [ ] Contributor insights and leaderboards
- [ ] Custom date range filtering
- [ ] Export reports to PDF/Markdown
- [ ] Dark mode support
- [ ] Team insights and comparisons
- [ ] GitHub Actions integration
- [ ] Slack/Discord notifications
- [ ] Multiple repository support

## Support

For issues or questions, please create an issue in the repository.

---

**Last Updated**: March 7, 2026
