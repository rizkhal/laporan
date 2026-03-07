# Database Sync Mechanism - Implementation Checklist

## ✅ Files Already Updated

- [x] `server/prisma/schema.prisma` - Updated with Commit relationships
- [x] `server/services/commits.ts` - Added `syncCommitsToDatabase()` function
- [x] `server/routes/commits.ts` - Split into GET (load DB) and POST (sync GitHub)
- [x] `src/api/commits.ts` - Added `getCommits()` and `syncCommits()` functions
- [x] `src/pages/Dashboard.tsx` - Updated to use new sync strategy
- [x] `README.md` - Updated with new API documentation and Sync Mechanism info

## 🚀 Setup Instructions

### Step 1: Create Database Migration
```bash
cd /Volumes/XStorage/Projects/weekly-report

# Create migration from schema changes
bun run prisma:migrate

# You'll be prompted for a migration name, e.g.:
# ✔ Name of migration … add_commit_relationships
```

### Step 2: Verify Schema
```bash
# Regenerate Prisma Client
bun run prisma:generate
```

### Step 3: Start Development Server
```bash
# Stop any running dev server (Ctrl+C)

# Start both frontend and backend with the new schema
bun run dev
```

## 🧪 Testing the Implementation

### Test 1: Check if database loads correctly
```bash
1. Open browser: http://localhost:5173
2. Open DevTools Network tab
3. Look for GET /api/commits request
4. It should be fast (<100ms) - loading from DB
5. If no commits, you'll see: "No commits synced yet. Click sync to fetch commits."
```

### Test 2: Test the Sync functionality
```bash
1. On Dashboard, click "Sync" button
2. Watch Network tab for POST /api/commits/sync request
3. It should take longer (10-30s depending on GitHub API)
4. Server console should show: "Successfully synced X commits"
5. Frontend should display: commits grouped by week
6. "Last Sync" timestamp should update
```

### Test 3: Verify database persistence
```bash
# Open Prisma Studio
bun run prisma:studio

# Then:
1. Check "Commit" table - should see commits with settingId
2. Check "Setting" table - should see lastSync timestamp
3. Verify commits are linked by settingId
```

## 📝 Expected Behavior After Setup

### On Page Load
- ✅ Loads from database (fast, <100ms)
- ✅ Shows commits from previous sync
- ✅ Shows "No commits synced yet" if empty
- ✅ **No GitHub API call**

### When User Clicks "Sync"
- ✅ Button shows "Syncing..." (disabled)
- ✅ Fetches from GitHub API (takes 10-30 seconds)
- ✅ Saves to database with upsert
- ✅ Updates `lastSync` timestamp
- ✅ Returns updated commits
- ✅ Displays new data in UI

## 🐛 Troubleshooting

### "Column 'settingId' does not exist" Error
**Cause**: Migration not applied
**Solution**: 
```bash
bun run prisma:migrate
# If stuck:
bun run db:reset  # Caution: deletes all data
bun run prisma:migrate
```

### "No commits synced yet" always showing
**Cause**: Sync not run or sync failed
**Solutions**:
1. Check browser console (F12) for errors
2. Check server console for error messages
3. Verify GitHub token is valid
4. Try clicking "Sync" again
5. Check server logs

### Frontend shows old data after sync
**Cause**: Frontend cache or state not updating
**Solution**:
1. Hard refresh browser: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Clear browser cache
3. Restart dev server

### "Repository settings not configured" error
**Cause**: Settings not saved
**Solution**:
1. Navigate to Settings page
2. Fill in all repository details
3. Click "Save Settings"
4. Go back to Dashboard

## 📊 Migration Details

The migration will:
1. Create `Commit` table with all new fields
2. Add `settingId` column as foreign key
3. Create relationship: `Setting` → `Commit[]`
4. Create indexes on `[year, week]`, `[date]`, `[settingId]`
5. Keep existing `Setting` table

## 🔍 Verification Commands

After setup, you can verify everything is working:

```bash
# Check Prisma schema is valid
bun run prisma:validate

# View database structure (visual)
bun run prisma:studio

# View migration history
ls -la server/prisma/migrations/

# Query commits from CLI
bunx prisma db execute --stdin << 'EOF'
SELECT COUNT(*) as commit_count FROM "Commit";
EOF
```

## 📚 Documentation Files

For more details, see:
- **[SYNC_MECHANISM.md](./SYNC_MECHANISM.md)** - How the sync works
- **[SYNC_IMPLEMENTATION.md](./SYNC_IMPLEMENTATION.md)** - What was changed

## ✨ Complete!

Once you've followed these steps:
- ✅ Database schema is updated
- ✅ Sync endpoints are working
- ✅ Frontend loads from DB
- ✅ Manual sync from GitHub works
- ✅ Data persists in SQLite
- ✅ Historical commits are preserved

Your sync mechanism is ready to use! 🎉
