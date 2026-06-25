import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { requireUser, requireAuth, assertOwnership, slugify } from "../lib/auth";
import { HTTPException } from "hono/http-exception";
import {
  generateSshKey,
  getFingerprint,
  deleteSshKeyFiles,
} from "../services/ssh-key";
import { testGitHubConnection } from "../services/git-ssh";

const router = new Hono();

// List all workspaces the user belongs to
router.get("/", (c) => {
  const { user } = requireUser(c);
  const memberships = db
    .select()
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, user.id))
    .all();

  const workspaceIds = memberships.map(m => m.workspaceId);
  if (workspaceIds.length === 0) return c.json([]);

  const workspaces = db
    .select()
    .from(schema.workspaces)
    .where(inArray(schema.workspaces.id, workspaceIds))
    .all();

  const result = workspaces.map(w => {
    const member = memberships.find(m => m.workspaceId === w.id);
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      description: w.description,
      role: member?.role || "member",
    };
  });

  return c.json(result);
});

// Create a new workspace
router.post("/", async (c) => {
  const { user } = requireUser(c);
  const body = await c.req.json();
  const parsed = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).nullable().optional(),
  }).parse(body);

  const slug = slugify(parsed.name);

  // Check slug uniqueness
  const existing = db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, slug)).get();
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  const ws = db.insert(schema.workspaces).values({
    name: parsed.name,
    slug: finalSlug,
    description: parsed.description || null,
  }).returning().get();

  // Create owner membership
  db.insert(schema.workspaceMembers).values({
    workspaceId: ws.id,
    userId: user.id,
    role: "owner",
  }).run();

  return c.json({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    description: ws.description,
    role: "owner",
  }, 201);
});

// Get workspace details
router.get("/:id", (c) => {
  const { user } = requireUser(c);
  const id = parseInt(c.req.param("id"));

  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)))
    .get();

  if (!membership) {
    throw new HTTPException(403, { message: "Access denied" });
  }

  const workspace = db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).get();
  if (!workspace) {
    return c.json({ error: "Not found" }, 404);
  }

  // Get members count
  const memberCount = db
    .select()
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, id))
    .all().length;

  return c.json({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    role: membership.role,
    memberCount,
    createdAt: workspace.createdAt,
  });
});

// Update workspace
router.put("/:id", async (c) => {
  const { user } = requireUser(c);
  const id = parseInt(c.req.param("id"));

  // Verify membership with admin+ role
  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)))
    .get();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }

  const body = await c.req.json();
  const parsed = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
  }).parse(body);

  const updateData: any = { updatedAt: new Date().toISOString() };
  if (parsed.name !== undefined) {
    updateData.name = parsed.name;
    updateData.slug = slugify(parsed.name);
  }
  if (parsed.description !== undefined) {
    updateData.description = parsed.description;
  }

  const updated = db.update(schema.workspaces).set(updateData).where(eq(schema.workspaces.id, id)).returning().get();
  if (!updated) return c.json({ error: "Not found" }, 404);

  return c.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    description: updated.description,
  });
});

// Delete workspace (cascading delete)
router.delete("/:id", async (c) => {
  const { user } = requireUser(c);
  const id = parseInt(c.req.param("id"));

  // Only owner can delete
  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)))
    .get();

  if (!membership || membership.role !== "owner") {
    throw new HTTPException(403, { message: "Only the workspace owner can delete" });
  }

  // Explicit cascading delete to ensure all data is cleaned up
  // regardless of SQLite foreign key enforcement

  // 1. Delete SSH keys
  db.delete(schema.sshKeys).where(eq(schema.sshKeys.workspaceId, id)).run();

  // 2. Find all collections in this workspace for cascading deletes
  const workspaceCollections = db.select().from(schema.collections).where(eq(schema.collections.workspaceId, id)).all();
  const collectionIds = workspaceCollections.map(c => c.id);

  if (collectionIds.length > 0) {
    // Delete commits for all collections
    for (const cid of collectionIds) {
      db.delete(schema.commits).where(eq(schema.commits.collectionId, cid)).run();
    }
    // Delete analyses for all collections
    for (const cid of collectionIds) {
      db.delete(schema.analyses).where(eq(schema.analyses.collectionId, cid)).run();
    }
    // Delete reports for all collections
    for (const cid of collectionIds) {
      db.delete(schema.reports).where(eq(schema.reports.collectionId, cid)).run();
    }
    // Delete collections
    db.delete(schema.collections).where(eq(schema.collections.workspaceId, id)).run();
  }

  // 3. Delete repositories
  db.delete(schema.repositories).where(eq(schema.repositories.workspaceId, id)).run();

  // 4. Delete LLM providers
  db.delete(schema.llmProviders).where(eq(schema.llmProviders.workspaceId, id)).run();

  // 5. Delete report templates
  db.delete(schema.reportTemplates).where(eq(schema.reportTemplates.workspaceId, id)).run();

  // 6. Delete workspace members
  db.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, id)).run();

  // 8. Finally delete the workspace itself
  db.delete(schema.workspaces).where(eq(schema.workspaces.id, id)).run();

  return c.json({ success: true });
});

// Get SSH key for workspace
router.get("/:id/ssh-key", (c) => {
  const { user } = requireUser(c);
  const workspaceId = parseInt(c.req.param("id"));

  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
    .get();

  if (!membership) {
    throw new HTTPException(403, { message: "Access denied" });
  }

  const key = db
    .select()
    .from(schema.sshKeys)
    .where(eq(schema.sshKeys.workspaceId, workspaceId))
    .get();

  if (!key) return c.json({ error: "No SSH key configured" }, 404);

  return c.json({
    id: key.id,
    name: key.name,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
    createdAt: key.createdAt,
  });
});

// Generate new SSH key for workspace
router.post("/:id/ssh-key/generate", async (c) => {
  const { user } = requireUser(c);
  const workspaceId = parseInt(c.req.param("id"));

  // Only owner/admin can manage SSH keys
  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
    .get();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({
    name: z.string().optional().default("default"),
  }).parse(body);

  try {
    // Generate the key pair and store on disk
    const { publicKey, fingerprint } = generateSshKey(workspaceId);

    // Delete existing SSH key record if any
    const existing = db
      .select()
      .from(schema.sshKeys)
      .where(eq(schema.sshKeys.workspaceId, workspaceId))
      .get();

    if (existing) {
      db.update(schema.sshKeys)
        .set({
          name: parsed.name,
          fingerprint,
          publicKey,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.sshKeys.id, existing.id))
        .run();
    } else {
      db.insert(schema.sshKeys).values({
        workspaceId,
        name: parsed.name,
        fingerprint,
        privateKey: "", // Key stored on disk, not in DB
        publicKey,
      }).run();
    }

    return c.json({
      success: true,
      name: parsed.name,
      publicKey,
      fingerprint,
    });
  } catch (err: any) {
    // Clean up files on failure
    deleteSshKeyFiles(workspaceId);
    return c.json({ error: err.message || "Failed to generate SSH key" }, 500);
  }
});

// Delete SSH key for workspace
router.delete("/:id/ssh-key", async (c) => {
  const { user } = requireUser(c);
  const workspaceId = parseInt(c.req.param("id"));

  // Only owner/admin can manage SSH keys
  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
    .get();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }

  // Delete from database
  db.delete(schema.sshKeys).where(eq(schema.sshKeys.workspaceId, workspaceId)).run();

  // Delete key files from disk
  deleteSshKeyFiles(workspaceId);

  return c.json({ success: true });
});

// Test GitHub connection using workspace SSH key
router.post("/:id/ssh-key/test-github", async (c) => {
  const { user } = requireUser(c);
  const workspaceId = parseInt(c.req.param("id"));

  // User must be a member
  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
    .get();

  if (!membership) {
    throw new HTTPException(403, { message: "Access denied" });
  }

  // Check if key exists
  const key = db
    .select()
    .from(schema.sshKeys)
    .where(eq(schema.sshKeys.workspaceId, workspaceId))
    .get();

  if (!key) {
    return c.json({
      success: false,
      message: "No SSH key found for this workspace. Generate an SSH key first.",
      details: "",
    });
  }

  const result = await testGitHubConnection(workspaceId);
  return c.json(result);
});

export { router as workspacesRouter };
