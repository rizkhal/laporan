/**
 * Workspace migration - idempotent, safe to run on every startup.
 *
 * Creates the workspaces table, workspace_members, ssh_keys,
 * adds slug/description columns, creates default workspaces
 * for users, and assigns existing data to the appropriate workspace.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let migrated = false;

function getDbPath(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace("file:", "");
  }
  return path.join(__dirname, "dev.db");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "workspace";
}

export function runMigration(): void {
  if (migrated) return;
  migrated = true;

  console.log("🔧 Running workspace migration check...");

  let sqlite: Database.Database | null = null;
  try {
    sqlite = new Database(getDbPath());
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = OFF");

    // 1. Create workspaces table (with new slug/description columns)
    const hasSlug = (sqlite.prepare("PRAGMA table_info(workspaces)").all() as any[]).some((c: any) => c.name === "slug");
    if (!hasSlug) {
      // Drop old table and recreate — safe because we backup data first
      const oldWorkspaces = sqlite.prepare("SELECT id, name, user_id, created_at, updated_at FROM workspaces").all() as any[];
      sqlite!.exec("DROP TABLE IF EXISTS workspaces");
      sqlite!.exec(`
        CREATE TABLE workspaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      // Migrate old workspaces
      for (const ws of oldWorkspaces) {
        const slug = slugify(ws.name);
        sqlite!.prepare("INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(ws.id, ws.name, slug, ws.created_at, ws.updated_at);
      }
      console.log(`  → Recreated workspaces table with slug/description (migrated ${oldWorkspaces.length} records)`);
    } else {
      console.log("  → workspaces table already has slug column");
    }

    // 2. Create workspace_members table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS workspace_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 3. Create ssh_keys table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ssh_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'default',
        private_key TEXT NOT NULL,
        public_key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 4. Create default workspace + owner membership for each user who needs it
    const users = sqlite.prepare("SELECT id, name FROM users").all() as any[];
    let newWorkspaceCount = 0;
    let newMemberCount = 0;

    for (const user of users) {
      // Check if user already has a membership
      const existingMembership = sqlite.prepare(
        "SELECT wm.id FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.user_id = ? AND wm.role = 'owner'"
      ).get(user.id);

      if (!existingMembership) {
        // Check if they have an old-style workspace (via user_id)
        const oldWorkspace = sqlite.prepare("SELECT id, name FROM workspaces WHERE id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)").get(user.id) as any;

        if (oldWorkspace) {
          // Create membership for existing workspace
          sqlite.prepare("INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')")
            .run(oldWorkspace.id, user.id);
          newMemberCount++;
        } else {
          // Create new workspace for this user
          const wsName = `${user.name}'s Workspace`;
          const slug = slugify(wsName);
          const result = sqlite!.prepare("INSERT INTO workspaces (name, slug) VALUES (?, ?)").run(wsName, slug);
          const workspaceId = result.lastInsertRowid as number;
          sqlite.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')")
            .run(workspaceId, user.id);
          newWorkspaceCount++;
          newMemberCount++;
        }
      }
    }
    if (newWorkspaceCount > 0) console.log(`  → Created ${newWorkspaceCount} new workspaces`);
    if (newMemberCount > 0) console.log(`  → Created ${newMemberCount} owner memberships`);

    // 5. Determine default workspace for existing orphan records (first user's first workspace)
    const firstUser = users[0];
    let defaultWorkspaceId: number | null = null;
    if (firstUser) {
      const ws = sqlite.prepare(
        "SELECT w.id FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = ? AND wm.role = 'owner' LIMIT 1"
      ).get(firstUser.id) as any;
      if (ws) defaultWorkspaceId = ws.id;
    }
    if (!defaultWorkspaceId) {
      const anyWs = sqlite.prepare("SELECT id FROM workspaces LIMIT 1").get() as any;
      defaultWorkspaceId = anyWs?.id || 1;
    }

    // 6. Add workspace_id columns to tables that need them
    const tablesToMigrate = [
      { name: "repositories", hasData: true },
      { name: "collections", hasData: true },
      { name: "llm_providers", hasData: true },
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

    // 8. Add fingerprint column to ssh_keys table
    try {
      const sshKeyCols = sqlite!.prepare("PRAGMA table_info(ssh_keys)").all() as any[];
      const hasFingerprint = sshKeyCols.some((c: any) => c.name === "fingerprint");
      if (!hasFingerprint) {
        sqlite!.exec("ALTER TABLE ssh_keys ADD COLUMN fingerprint TEXT;");
        console.log("  → Added fingerprint column to ssh_keys");
      }
    } catch (err: any) {
      console.log(`  ⚠️ SSH keys fingerprint migration skipped: ${err.message}`);
    }
    // 9. Rename label column to name in ssh_keys table
    try {
      const sshKeyCols2 = sqlite!.prepare("PRAGMA table_info(ssh_keys)").all() as any[];
      const hasLabel = sshKeyCols2.some((c: any) => c.name === "label");
      const hasName2 = sshKeyCols2.some((c: any) => c.name === "name");
      if (hasLabel && !hasName2) {
        sqlite!.exec("ALTER TABLE ssh_keys RENAME COLUMN label TO name;");
        console.log("  → Renamed label column to name in ssh_keys");
      }
    } catch (err: any) {
      console.log(`  ⚠️ SSH keys column rename skipped: ${err.message}`);
    }

    // 10. Add remote_url column to repositories
    try {
      const repoCols = sqlite!.prepare("PRAGMA table_info(repositories)").all() as any[];
      const hasRemoteUrl = repoCols.some((c: any) => c.name === "remote_url");
      if (!hasRemoteUrl) {
        sqlite!.exec("ALTER TABLE repositories ADD COLUMN remote_url TEXT NOT NULL DEFAULT '';");
        console.log("  → Added remote_url column to repositories");
      }
    } catch (err: any) {
      console.log(`  ⚠️ Repositories remote_url migration skipped: ${err.message}`);
    }

    console.log("✅ Workspace migration check complete");

    // 11. Add clone status columns to repositories
    try {
      const repoCols = sqlite!.prepare("PRAGMA table_info(repositories)").all() as any[];
      const hasCloneStatus = repoCols.some((c: any) => c.name === "clone_status");
      if (!hasCloneStatus) {
        sqlite!.exec("ALTER TABLE repositories ADD COLUMN clone_status TEXT NOT NULL DEFAULT 'connected';");
        sqlite!.exec("ALTER TABLE repositories ADD COLUMN clone_error TEXT;");
        sqlite!.exec("ALTER TABLE repositories ADD COLUMN last_cloned_at TEXT;");
        sqlite!.exec("ALTER TABLE repositories ADD COLUMN last_synced_at TEXT;");
        // Update existing repos to connected since they are already cloned
        sqlite!.exec("UPDATE repositories SET clone_status = 'connected' WHERE clone_status = 'pending_clone';");
        console.log("  → Added clone status columns to repositories");
      }
    } catch (err: any) {
      console.log(`  ⚠️ Repositories clone status migration skipped: ${err.message}`);
    }

    // 12. Create jobs table
    try {
      sqlite!.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          progress INTEGER NOT NULL DEFAULT 0,
          message TEXT NOT NULL DEFAULT '',
          payload TEXT NOT NULL DEFAULT '{}',
          result TEXT,
          error TEXT,
          started_at TEXT,
          completed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      console.log("  → Created jobs table");
    } catch (err: any) {
      console.log(`  ⚠️ Jobs table creation skipped: ${err.message}`);
    }

    // 13. Create google_integrations table
    try {
      sqlite!.exec(`
        CREATE TABLE IF NOT EXISTS google_integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
          google_account_email TEXT NOT NULL,
          access_token TEXT,
          refresh_token TEXT,
          expires_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      console.log("  → Created google_integrations table");
    } catch (err: any) {
      console.log(`  ⚠️ google_integrations table creation skipped: ${err.message}`);
    }

    // 14. Add google_doc_id/docs columns to reports
    try {
      const reportCols = sqlite!.prepare("PRAGMA table_info(reports)").all() as any[];
      const hasGoogleDocId = reportCols.some((c: any) => c.name === "google_doc_id");
      if (!hasGoogleDocId) {
        sqlite!.exec("ALTER TABLE reports ADD COLUMN google_doc_id TEXT;");
        sqlite!.exec("ALTER TABLE reports ADD COLUMN google_doc_url TEXT;");
        console.log("  → Added google_doc_id and google_doc_url columns to reports");
      }
    } catch (err: any) {
      console.log(`  ⚠️ Reports google_doc_id migration skipped: ${err.message}`);
    }

    // 15. Add unique_key column to collections and create UNIQUE index for duplicate prevention
    try {
      const collectionsCols = sqlite!.prepare("PRAGMA table_info(collections)").all() as any[];
      const hasUniqueKey = collectionsCols.some((c: any) => c.name === "unique_key");
      if (!hasUniqueKey) {
        sqlite!.exec("ALTER TABLE collections ADD COLUMN unique_key TEXT;");
        console.log("  → Added unique_key column to collections");

        // Backfill existing records with computed unique keys
        const allCollections = sqlite!.prepare("SELECT id, repo_ids, updated_at FROM collections").all() as any[];
        for (const col of allCollections) {
          let uniqueKey: string;
          if (!col.repo_ids) {
            uniqueKey = "__ALL__";
          } else {
            try {
              const parsed = JSON.parse(col.repo_ids);
              uniqueKey = JSON.stringify([...parsed].sort());
            } catch {
              uniqueKey = "__ALL__";
            }
          }
          sqlite!.prepare("UPDATE collections SET unique_key = ? WHERE id = ?").run(uniqueKey, col.id);
        }

        // Remove duplicates: keep only the newest record per unique_key within same (workspace_id, year, month)
        // Uses SQLite's rowid trick to identify and delete older duplicates
        const duplicates = sqlite!.prepare(`
          SELECT c1.id FROM collections c1
          WHERE c1.id != (
            SELECT c2.id FROM collections c2
            WHERE c2.workspace_id = c1.workspace_id
              AND c2.year = c1.year
              AND c2.month = c1.month
              AND c2.unique_key = c1.unique_key
            ORDER BY c2.updated_at DESC, c2.id DESC
            LIMIT 1
          )
        `).all() as any[];
        if (duplicates.length > 0) {
          const ids = duplicates.map((d: any) => d.id);
          sqlite!.prepare(`DELETE FROM collections WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
          console.log(`  → Removed ${duplicates.length} duplicate collections`);
        }

        // Create UNIQUE index for DB-level duplicate enforcement
        sqlite!.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_unique
          ON collections(workspace_id, year, month, unique_key);
        `);
        console.log("  → Created UNIQUE index on (workspace_id, year, month, unique_key)");
      }
    } catch (err: any) {
      console.log(`  ⚠️ Collections unique_key migration skipped: ${err.message}`);
    }

    // 16. Create collection_repos table for per-repo uniqueness enforcement
    try {
      const hasCollectionRepos = (sqlite!.prepare("PRAGMA table_info(collection_repos)").all() as any[]).length > 0;
      if (!hasCollectionRepos) {
        sqlite!.exec(`
          CREATE TABLE IF NOT EXISTS collection_repos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER NOT NULL,
            collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            repo_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL
          );
        `);
        console.log("  → Created collection_repos table");

        // Migrate existing data: for each collection with non-null repo_ids, insert rows
        const allCollections = sqlite!.prepare("SELECT id, year, month, repo_ids FROM collections WHERE repo_ids IS NOT NULL").all() as any[];
        let inserted = 0;
        for (const col of allCollections) {
          let repoIds: number[] = [];
          try { repoIds = JSON.parse(col.repo_ids); } catch { continue; }
          if (!Array.isArray(repoIds) || repoIds.length === 0) continue;
          // workspace_id is migrated via JOIN with collections table
          const insertStmt = sqlite!.prepare(
            `INSERT OR IGNORE INTO collection_repos (workspace_id, collection_id, repo_id, year, month)
             SELECT c.workspace_id, ?, ?, ?, ?
             FROM collections c WHERE c.id = ?`
          );
          for (const repoId of repoIds) {
            insertStmt.run(col.id, repoId, col.year, col.month, col.id);
            inserted++;
          }
        }
        console.log(`  → Migrated ${inserted} collection_repo entries from existing collections`);

        // Create UNIQUE index for per-repo per-period enforcement per workspace
        sqlite!.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_repos_unique
          ON collection_repos(workspace_id, repo_id, year, month);
        `);
        console.log("  → Created UNIQUE index on (workspace_id, repo_id, year, month) in collection_repos");
      }
    } catch (err: any) {
      console.log(`  ⚠️ Collection repos migration skipped: ${err.message}`);
    }
  } catch (err: any) {
  console.error("❌ Workspace migration error:", err.message);
} finally {
  if (sqlite) {
    sqlite.pragma("foreign_keys = ON");
    sqlite.close();
  }
}
}
const isMain = process.argv[1]?.includes("migrate-workspaces");
if (isMain) {
runMigration();
}
