import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Users ──
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatar: text("avatar"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── Sessions ──
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── Workspaces ──
export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── Workspace Members ──
export const workspaceMembers = sqliteTable("workspace_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // owner, admin, member
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── SSH Keys (per workspace) ──
export const sshKeys = sqliteTable("ssh_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("default"),
  fingerprint: text("fingerprint"),
  privateKey: text("private_key").notNull(),
  publicKey: text("public_key"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── Repositories ──
export const repositories = sqliteTable("repositories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  localPath: text("local_path").notNull(),
  remoteUrl: text("remote_url").notNull(),
  category: text("category").notNull().default("general"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  authorNames: text("author_names").notNull(), // JSON array
  authorEmails: text("author_emails").notNull(), // JSON array
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── Collections ──
export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"), // draft, collecting, completed, analyzing, analyzed, generating, generated
  repoIds: text("repo_ids"), // JSON array of repo IDs, null = all repos
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── Collected Commits ──
export const commits = sqliteTable("commits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  hash: text("hash").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  date: text("date").notNull(),
  message: text("message").notNull(),
  filesChanged: integer("files_changed").notNull().default(0),
  insertions: integer("insertions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
  diffStat: text("diff_stat"), // JSON
  patchSnippets: text("patch_snippets"), // JSON array of {file, patch}
  changedFiles: text("changed_files"), // JSON array
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── LLM Provider Settings ──
export const llmProviders = sqliteTable("llm_providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("default"),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(),
  model: text("model").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── Analysis Results ──
export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  repoId: integer("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  rawResponse: text("raw_response"),
  workItems: text("work_items"), // JSON array
  category: text("category"),
  summary: text("summary"),
  impact: text("impact"),
  risks: text("risks"),
  nextSuggestions: text("next_suggestions"),
  isEdited: integer("is_edited", { mode: "boolean" }).notNull().default(false),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
// ── Report Templates ──
export const reportTemplates = sqliteTable("report_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: text("content").notNull(), // Markdown template with placeholders
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── Generated Reports ──
export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => reportTemplates.id),
  title: text("title").notNull(),
  content: text("content").notNull(), // Markdown
  isEdited: integer("is_edited", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
