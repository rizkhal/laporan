# Git Weekly Report

A modern web application that syncs commits from GitHub and generates beautiful weekly development reports with analytics and summaries.

## Features

- **Weekly Dashboard**: Visualize commits grouped by week with statistics
- **Repository Configuration**: Easy setup with GitHub repository credentials
- **Commit Analytics**: Track commits, contributors, and changes per week
- **Intelligent Navigation**: Custom back button with history tracking
- **Statistics**: Real-time commit metrics and contributor analysis
- **Commit List**: Browse all commits with authors, dates, and commit types
- **Modern UI**: Clean, minimal interface built with React and Tailwind CSS
- **Type-Safe**: Full TypeScript support with strict type checking
- **Real-time Sync**: Fetch latest commits from GitHub on demand
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
# or reset if needed
bun run db:reset
```

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

### 2. Sync Commits

Click the **Sync** button in the header to fetch commits from GitHub. This will:
- Retrieve commits from the past 3 months
- Store them in the database
- Update the `lastSync` timestamp

### 3. View Dashboard

The dashboard displays:
- **Weekly Blocks**: Each week with commit counts and statistics
- **Commit Stats**: Number of commits, files changed, and contributors
- **Commit Details**: Click a week to see all commits for that week

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
Fetch commits from GitHub and update lastSync timestamp.

**Query Parameters**:
- `per_page` (optional): Results per page (default: 100)

**Response** (200 OK):
Returns array of GitHub API commit objects:
```json
[
  {
    "sha": "abc123...",
    "commit": {
      "message": "feat: add settings endpoint",
      "author": {
        "name": "Developer",
        "email": "dev@example.com",
        "date": "2026-03-07T10:00:00Z"
      }
    },
    "html_url": "https://github.com/owner/repo/commit/abc123"
  }
]
```

**Response** (400 Bad Request):
```json
{
  "message": "Repository settings not configured. Please configure settings first."
}
```

**Response** (401 Unauthorized):
```json
{
  "message": "GitHub API error: Unauthorized"
}
```

## Database Schema

### Setting Model
Stores repository configuration for GitHub API access.

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
}
```

### Commit Model
Stores commit data grouped by week for analytics.

```prisma
model Commit {
  id        String    @id   // GitHub commit SHA
  message   String            // Commit message
  author    String            // Author name
  date      DateTime          // Commit date
  week      String            // Week identifier (YYYY-[W]WW format)
  year      Int               // Year for indexing
  createdAt DateTime  @default(now())

  @@index([year, week])
  @@index([date])
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
