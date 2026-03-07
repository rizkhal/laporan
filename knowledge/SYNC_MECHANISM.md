# Commit Sync Mechanism Documentation

## Overview

This project implements a **Database-First** sync mechanism where:
- **Database is the source of truth** for commit data
- **Frontend always loads from DB on page load** (not GitHub)
- **Manual sync updates DB from GitHub** when user clicks "Sync"
- **Historical data is preserved** and gradually updated

## Architecture

### Data Flow

```
Frontend Load
    ↓
GET /api/commits
    ↓
Load commits from database
    ↓
Display to user
    ↑
User clicks "Sync" button
    ↓
POST /api/commits/sync
    ↓
Fetch commits from GitHub (pagination)
    ↓
Calculate ISO week/year for each commit
    ↓
Upsert to database (update existing, create new)
    ↓
Update lastSync timestamp
    ↓
Return DB commits to frontend
    ↓
Display updated data
```

## API Endpoints

### GET /api/commits
**Load commits from database (Database First)**

**Response:**
```json
{
  "commits": [
    {
      "id": "abc123",
      "sha": "abc123def456...",
      "message": "feat: add settings page",
      "author": "John Doe",
      "email": "john@example.com",
      "date": "2026-03-07T10:00:00Z",
      "week": 10,
      "year": 2026,
      "url": "https://github.com/owner/repo/commit/abc123",
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

### POST /api/commits/sync
**Sync commits from GitHub and update database**

**Process:**
1. Fetch all commits from GitHub (last 12 months, with pagination)
2. Calculate ISO week and year for each commit
3. Upsert to database (create new or update existing by SHA)
4. Update setting's `lastSync` timestamp
5. Return updated commits from database

**Response:**
```json
{
  "message": "Successfully synced 45 commits",
  "commits": [...],
  "lastSync": "2026-03-07T14:35:00Z",
  "count": 45
}
```

## Database Schema

### Setting Model
```prisma
model Setting {
  id        Int       @id @default(autoincrement())
  owner     String
  repo      String
  branch    String
  token     String
  lastSync  DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  
  commits   Commit[]  // One-to-many relationship
}
```

### Commit Model
```prisma
model Commit {
  id        String    @id          // Short SHA (first 12 chars)
  sha       String    @unique      // Full SHA from GitHub
  message   String
  author    String
  email     String?
  date      DateTime
  week      Int                    // ISO week number
  year      Int                    // Year for indexing
  url       String?                // GitHub commit URL
  
  settingId Int
  setting   Setting   @relation(...)  // Link to repository settings
  
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([year, week])
  @@index([date])
  @@index([settingId])
}
```

## Sync Service

### Functions in `server/services/commits.ts`

#### `fetchAllCommits(owner, repo, branch, token)`
- Fetches commits from GitHub API with pagination
- Covers last 12 months of history
- Handles pagination (100 commits per page)

#### `syncCommitsToDatabase(owner, repo, branch, token, settingId)`
- Fetches all commits from GitHub
- Transforms and saves to database
- Uses `upsert` to create new or update existing commits
- Calculates ISO week and year for each commit
- Returns count of synced commits

#### Helper: `getISOWeek(date)`
- Calculates ISO 8601 week number
- Returns `{ week: number, year: number }`

## Frontend API Integration

### Functions in `src/api/commits.ts`

#### `getCommits()`
- Calls GET /api/commits
- Returns commits from database
- Used on page load

#### `syncCommits()`
- Calls POST /api/commits/sync
- Syncs from GitHub and returns updated database
- Called when user clicks "Sync" button

#### `generateSummary(commits)`
- Calls POST /api/commits/ai/summary
- Generates AI summary of commit messages

## Frontend Usage

### Dashboard Component

```typescript
// Page load: Load from database
async function loadInitialData() {
  const settings = await getSettings()
  if (settings) await loadCommitsFromDB()
}

// Load from DB
async function loadCommitsFromDB() {
  const data = await getCommits()
  setWeeks(groupByWeek(data.commits))
  setLastSync(data.lastSync)
}

// User clicks "Sync": Sync from GitHub and update DB
async function syncCommits() {
  const data = await apiSyncCommits()
  setWeeks(groupByWeek(data.commits))
  setLastSync(data.lastSync)
}
```

## Implementation Checklist

Before using this, ensure:

- [ ] Run database migration: `bun run prisma:migrate`
- [ ] Restart backend server
- [ ] Frontend will now:
  - Load from DB on page load (not sync automatically)
  - Sync from GitHub only when user clicks "Sync"
  - Display lastSync timestamp to user
  - Show loading state during sync
  - Show error messages if sync fails

## Benefits

1. **Faster Page Load** - Loads from DB instead of GitHub API
2. **Better UX** - No automatic sync delays on page load
3. **Historical Data** - Keeps all previous commits in database
4. **Efficient Updates** - Only syncs when user explicitly requests
5. **Data Persistence** - Commits stay in DB even if sync fails
6. **Bandwidth Efficient** - Reduces GitHub API calls

## Troubleshooting

### "No commits synced yet" message
- **Cause**: Database is empty, no sync has been performed
- **Solution**: Click "Sync" button in the navbar to fetch from GitHub

### Commits not updating after sync
- **Cause**: Frontend may not have refreshed or sync failed silently
- **Solution**: Check browser console for errors, verify GitHub token is valid

### lastSync shows old timestamp
- **Cause**: Sync was not successful
- **Solution**: Click "Sync" again, check console for errors

### Database migration errors
```bash
# Reset entire database (caution: deletes all data)
bun run db:reset

# Or generate new migration
bun run prisma:migrate
```

## ISO Week Calculation

The system uses ISO 8601 week numbering:
- Week 1 = First week with Thursday in the year
- Week 01-53 format with leading zero
- Example: "2026-W10" = Week 10 of 2026

This ensures consistent week grouping across year boundaries.
