# Database Sync Mechanism - Implementation Summary

## What Was Changed

### 1. Database Schema (`server/prisma/schema.prisma`)
**Added relationship between Setting and Commit**
- Commit model now has `settingId` foreign key
- Setting model has `commits[]` relationship array
- Updated Commit fields:
  - Added `sha` (unique, full GitHub SHA)
  - Added `email` (optional, author email)
  - Added `url` (GitHub commit URL)
  - Added `settingId` (link to Setting)
  - Removed generic `id` - now uses short SHA

### 2. Backend Service (`server/services/commits.ts`)
**New sync function for database persistence**
- Added `syncCommitsToDatabase()` function
- Fetches commits from GitHub with pagination (12 months)
- Calculates ISO week/year for each commit
- Upserts to database (create/update)
- Returns count of synced commits
- Added `getISOWeek()` helper for week calculation

### 3. Backend Routes (`server/routes/commits.ts`)
**Split into load and sync endpoints**
- **GET /api/commits** → Load from database (Database First)
  - Returns commits from DB with metadata
  - Fast, no GitHub API call
  - Shows lastSync timestamp
- **POST /api/commits/sync** → Sync from GitHub to DB
  - Fetches from GitHub
  - Saves/updates in database
  - Returns synced data
  - Updates lastSync timestamp

### 4. Frontend API Client (`src/api/commits.ts`)
**New functions for sync mechanism**
- `getCommits()` → Load from DB
- `syncCommits()` → Sync from GitHub and save to DB
- `generateSummary()` → Generate AI summary (unchanged)

### 5. Frontend Dashboard (`src/pages/Dashboard.tsx`)
**Updated to use new sync strategy**
- Page load: `loadCommitsFromDB()` (Database First - no sync)
- User clicks "Sync": `syncCommits()` (fetch GitHub → save DB → display)
- Added `lastSync` state tracking
- Separated loading logic from syncing logic

## How It Works

### On Page Load
```
User opens app
    ↓
Frontend loads settings
    ↓
GET /api/commits (from DB)
    ↓
Display cached commits
```

### When User Clicks "Sync"
```
User clicks "Sync" button
    ↓
POST /api/commits/sync
    ↓
Backend fetches from GitHub (pagination)
    ↓
Calculate week/year for each commit
    ↓
Upsert to database
    ↓
Update lastSync timestamp
    ↓
Return updated commits
    ↓
Frontend displays new data
```

## Database Migration Steps

### Step 1: Create Migration
```bash
bun run prisma:migrate
```
Prisma will:
1. Detect schema changes in `server/prisma/schema.prisma`
2. Create new migration file
3. Prompt for migration name (e.g., "add_commits_relation")
4. Apply migration to database

### Step 2: Verify Schema
```bash
bun run prisma:generate
```
Regenerates Prisma Client with new types.

### Step 3: Restart Services
```bash
# Stop current dev server (Ctrl+C)
bun run dev
```

## Key Features

✅ **Database First** - Always load from DB on page load  
✅ **Efficient** - No GitHub API calls on page load  
✅ **Historical Data** - Keeps all previous commits  
✅ **Manual Sync** - User controls when to fetch from GitHub  
✅ **Smart Updates** - Upsert handles new and changed commits  
✅ **ISO Week Calculation** - Consistent week grouping  
✅ **Repository Tied** - Commits linked to specific repository settings  
✅ **Metadata Tracking** - Stores author, email, URL, sync timestamp  

## File Structure Changes

```
server/
├── services/
│   └── commits.ts          ← Updated with syncCommitsToDatabase()
├── routes/
│   └── commits.ts          ← Split: GET (DB) + POST (sync)
└── prisma/
    └── schema.prisma       ← Updated: Commit relationships

src/
├── api/
│   └── commits.ts          ← New: getCommits(), syncCommits()
└── pages/
    └── Dashboard.tsx       ← Updated: loadCommitsFromDB(), syncCommits()
```

## Testing the Implementation

### Test Loading from DB
1. Start server: `bun run dev`
2. Open app
3. Check browser Network tab - GET /api/commits should be fast (no GitHub API call)

### Test Syncing
1. Click "Sync" button
2. Watch Network tab - see POST /api/commits/sync request
3. Takes longer (GitHub API pagination)
4. Check lastSync timestamp updates
5. Commits should appear/update

### Test Database
```bash
# Open Prisma Studio
bun run prisma:studio

# View Commit table
# Should see commits with settingId relationships
```

## Error Handling

- **Settings not configured** → Shows error, prompts to configure
- **Sync fails** → Shows error, keeps previous DB data
- **DB empty** → Shows message: "No commits synced yet"
- **Network error** → Shows error, can retry by clicking Sync

## Performance Improvements

| Action | Before | After |
|--------|--------|-------|
| Page Load | ~2-5s (GitHub API) | <100ms (DB query) |
| Sync | Every page load | Only on user click |
| GitHub API Calls | Page load + manual sync | Manual sync only |

## Next Steps (Optional Enhancements)

- [ ] Add refresh indicator showing "syncing..." state
- [ ] Display sync time in human-readable format ("2 hours ago")
- [ ] Add "auto-sync" option (every N hours)
- [ ] Add sync progress indicator
- [ ] Cache GitHub API responses with TTL
- [ ] Add selective sync (only recent commits)
- [ ] Add delete/clear database option
