/**
 * Workspace migration - idempotent, safe to run on every startup.
 *
 * Creates the workspaces table, adds workspaceId columns,
 * creates default workspaces for users, and assigns existing
 * data to the appropriate workspace.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace("file:", "")
  : path.join(__dirname, "dev.db");

let migrated = false;

export function runMigration(): void {
  if (migrated) return;
  migrated = true;

  console.log("🔧 Running workspace migration check...");

  let sqlite: Database.Database | null = null;
  try {
    sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = OFF");

    // 1. Create workspaces table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 2. Create default workspace for each user who doesn't have one
    const users = sqlite.prepare("SELECT id, name FROM users").all() as any[];
    let workspaceCount = 0;
    for (const user of users) {
      const existing = sqlite.prepare("SELECT id FROM workspaces WHERE user_id = ?").get(user.id);
      if (!existing) {
        sqlite.prepare("INSERT INTO workspaces (name, user_id) VALUES (?, ?)").run(`${user.name}'s Workspace`, user.id);
        workspaceCount++;
      }
    }
    if (workspaceCount > 0) {
      console.log(`  → Created ${workspaceCount} workspaces for new users`);
    }

    // 3. Determine default workspace for existing records (first user's workspace)
    const firstUser = users[0];
    let defaultWorkspaceId = 1;
    if (firstUser) {
      const ws = sqlite.prepare("SELECT id FROM workspaces WHERE user_id = ?").get(firstUser.id) as any;
      if (ws) defaultWorkspaceId = ws.id;
    }

    // 4. Add workspace_id columns to tables that need them
    const tablesToMigrate = [
      { name: "repositories", hasData: true },
      { name: "collections", hasData: true },
      { name: "llm_providers", hasData: true },
      { name: "categories", hasData: true },
      { name: "report_templates", hasData: true },
    ];

    for (const table of tablesToMigrate) {
      const cols = sqlite.prepare(`PRAGMA table_info(${table.name})`).all() as any[];
      const hasCol = cols.some((c: any) => c.name === "workspace_id");
      if (!hasCol) {
        try {
          sqlite!.exec(`ALTER TABLE ${table.name} ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;`);
          console.log(`  → Added workspace_id to ${table.name}`);

          if (table.hasData) {
            const count = (sqlite!.prepare(`SELECT COUNT(*) as cnt FROM ${table.name}`).get() as any).cnt;
            if (count > 0) {
              sqlite!.prepare(`UPDATE ${table.name} SET workspace_id = ? WHERE workspace_id IS NULL`).run(defaultWorkspaceId);
              console.log(`    → Assigned ${count} records to workspace ${defaultWorkspaceId}`);
            }
          }
        } catch (err: any) {
          console.log(`  ⚠️ Could not migrate ${table.name}: ${err.message}`);
        }
      }
    }

    // 5. Recreate categories table without old unique constraint on name,
    //    since names are now scoped per workspace.
    try {
      const oldIndices = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='categories'").all() as any[];
      const hasOldUnique = oldIndices.some((i: any) =>
        i.name.includes("categories_name_unique") || i.name.includes("sqlite_autoindex_categories")
      );
      if (hasOldUnique) {
        // Check if the new table already exists (from a previous partial migration)
        const hasNewTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='categories_new'").get();
        if (!hasNewTable) {
          sqlite!.exec(`
            CREATE TABLE categories_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
          `);
          sqlite!.exec(`INSERT INTO categories_new (id, workspace_id, name, created_at) SELECT id, workspace_id, name, created_at FROM categories`);
          sqlite!.exec("DROP TABLE categories");
          sqlite!.exec("ALTER TABLE categories_new RENAME TO categories");
          console.log("  → Recreated categories table (no unique constraint on name)");
        }
      }
    } catch (err: any) {
      console.log(`  ⚠️ Categories migration skipped: ${err.message}`);
    }

    console.log("✅ Workspace migration check complete");
  } catch (err: any) {
    console.error("❌ Workspace migration error:", err.message);
  } finally {
    if (sqlite) {
      sqlite.pragma("foreign_keys = ON");
      sqlite.close();
    }
  }
}

// Allow running standalone: npx tsx db/migrate-workspaces.ts
const isMain = process.argv[1]?.includes("migrate-workspaces");
if (isMain) {
  runMigration();
}
