import { drizzle } from "drizzle-orm/better-sqlite3";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace("file:", "")
  : path.join(__dirname, "../../db/dev.db");

// Ensure the database directory exists
mkdirSync(path.dirname(DB_PATH), { recursive: true });

export let sqlite: DatabaseType = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export let db: ReturnType<typeof drizzle> = drizzle(sqlite);
export * as schema from "./schema";

/**
 * Re-initialize the database connection (used after DB import).
 * ESM live bindings ensure all importing modules see the new instances.
 */
export function reloadDatabase(): void {
  sqlite.close();
  sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite);
}
