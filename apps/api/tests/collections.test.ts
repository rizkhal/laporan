import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import Database from "better-sqlite3";

let dbPath: string;
let cleanupDir: string;
let sqlite: Database.Database;
let testToken: string;
let testWorkspaceId: number;

/**
 * Create a temporary SQLite database, create all tables from schema,
 * seed auth data (user + session + workspace + workspace_member),
 * then set DATABASE_URL so that db/index.ts uses the test database.
 *
 * We use a REAL file-based database (not :memory:) because better-sqlite3
 * with WAL pragma does not work reliably in :memory: mode.
 */
beforeAll(() => {
  cleanupDir = mkdtempSync(path.join(tmpdir(), "report-test-"));
  dbPath = path.join(cleanupDir, "test.db");

  // Create raw SQLite connection for setup
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
});

afterAll(() => {
  if (sqlite) {
    sqlite.close();
  }
  // Clean up WAL/SHM files too
  try {
    rmSync(cleanupDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
  delete process.env.DATABASE_URL;
});

/**
 * Seed auth data so requireAuth() can find a user + session + workspace.
 * This must happen BEFORE we import the collections router.
 */
function seedAuthData() {
  const userId = sqlite.prepare(
    "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) RETURNING id",
  ).get("Test User", "test@example.com", "fake-hash") as { id: number };

  const session = sqlite.prepare(
    "INSERT INTO sessions (user_id, token) VALUES (?, ?) RETURNING token",
  ).get(userId.id, "test-token-12345") as { token: string };
  testToken = session.token;

  const workspace = sqlite.prepare(
    "INSERT INTO workspaces (name, slug) VALUES (?, ?) RETURNING id",
  ).get("Test Workspace", "test-workspace") as { id: number };
  testWorkspaceId = workspace.id;

  sqlite.prepare(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)",
  ).run(testWorkspaceId, userId.id, "owner");
}

/**
 * Create all tables needed for tests directly from schema definitions.
 * We use raw SQL to avoid depending on Drizzle migrations.
 */
function createTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL,
      remote_url TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      enabled INTEGER NOT NULL DEFAULT 1,
      author_names TEXT NOT NULL,
      author_emails TEXT NOT NULL,
      clone_status TEXT NOT NULL DEFAULT 'pending_clone',
      clone_error TEXT,
      last_cloned_at TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      repo_ids TEXT,
      unique_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Create unique index for DB-level duplicate prevention
    CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_unique
    ON collections(workspace_id, year, month, unique_key);
  `);
}

/**
 * Shared test helpers
 */
function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${testToken}`,
    "X-Workspace-Id": String(testWorkspaceId),
    "Content-Type": "application/json",
  };
}

/**
 * Re-create the database for each test group that needs a clean slate.
 * We close the existing sqlite, delete the file, create a new one,
 * then reset DATABASE_URL so the next dynamic import picks it up.
 */
function resetDatabase() {
  if (sqlite) sqlite.close();
  try {
    rmSync(dbPath, { force: true });
    rmSync(dbPath + "-wal", { force: true });
    rmSync(dbPath + "-shm", { force: true });
  } catch {
    // ignore
  }
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  createTables();
  seedAuthData();
  process.env.DATABASE_URL = `file:${dbPath}`;
}

describe("POST /api/collections — Duplicate Validation", () => {
  let app: any;

  beforeAll(async () => {
    resetDatabase();

    // Force fresh imports so db/index.ts reads the test DATABASE_URL
    vi.resetModules();

    const { collectionsRouter } = await import("../routes/collections");
    const { Hono } = await import("hono");
    app = new Hono();
    app.route("/api/collections", collectionsRouter);
  });

  it("1. should create a collection successfully", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ year: 2026, month: 6, repoIds: [1, 2] }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.year).toBe(2026);
    expect(data.month).toBe(6);
    expect(data.repoIds).toEqual([1, 2]);
  });

  it("2. should reject duplicate (same year + month + repoIds)", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ year: 2026, month: 6, repoIds: [1, 2] }),
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("sudah ada");
  });

  it("3. should allow same year+month with different repoIds", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ year: 2026, month: 6, repoIds: [3] }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.repoIds).toEqual([3]);
  });

  it("4. should allow same repoIds with different month", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ year: 2026, month: 7, repoIds: [1, 2] }),
    });
    expect(res.status).toBe(201);
  });

  it("5. should treat [2,1] as duplicate of [1,2] (order-independent)", async () => {
    // [1,2] already exists from test 1
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ year: 2026, month: 6, repoIds: [2, 1] }),
    });
    expect(res.status).toBe(409);
  });

  it("6. should reject duplicate with null repoIds", async () => {
    // Create first with null repoIds
    const res1 = await app.request("/api/collections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ year: 2025, month: 1 }),
    });
    expect(res1.status).toBe(201);

    // Same year+month with null repoIds should be duplicate
    const res2 = await app.request("/api/collections", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ year: 2025, month: 1 }),
    });
    expect(res2.status).toBe(409);
  });

  it("7. should allow same data in different workspace", async () => {
    // Create a second workspace
    const ws2 = sqlite.prepare(
      "INSERT INTO workspaces (name, slug) VALUES (?, ?) RETURNING id",
    ).get("Other Workspace", "other-ws") as { id: number };
    sqlite.prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)",
    ).run(ws2.id, 1, "owner");

    const res = await app.request("/api/collections", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "X-Workspace-Id": String(ws2.id),
      },
      body: JSON.stringify({ year: 2026, month: 6, repoIds: [1, 2] }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.workspaceId).toBe(ws2.id);
  });
});
