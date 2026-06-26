import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth, slugify } from "../lib/auth";

const router = new Hono();

const registerPayload = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

const loginPayload = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateProfilePayload = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  avatar: z.string().nullable().optional(),
});

// Helper to get current user from token (without requiring workspace — used before workspace exists)
function getUserFromToken(token: string | undefined) {
  if (!token) return null;
  const session = db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
  if (!session) return null;
  const user = db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
  return user || null;
}

// Register
router.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = registerPayload.parse(body);

    // Check if email already exists
    const existing = db.select().from(schema.users).where(eq(schema.users.email, parsed.email)).get();
    if (existing) {
      return c.json({ error: "Email already registered" }, 409);
    }

    const passwordHash = await bcrypt.hash(parsed.password, 10);

    // Create user
    const user = db.insert(schema.users).values({
      name: parsed.name,
      email: parsed.email,
      passwordHash,
    }).returning().get();

    // Create default personal workspace for the user
    const workspaceName = `${parsed.name}'s Workspace`;
    const wsSlug = slugify(workspaceName);
    const ws = db.insert(schema.workspaces).values({
      name: workspaceName,
      slug: wsSlug,
    }).returning().get();

    // Create owner membership
    db.insert(schema.workspaceMembers).values({
      workspaceId: ws.id,
      userId: user.id,
      role: "owner",
    }).run();

    // Create session
    const token = crypto.randomBytes(48).toString("hex");
    db.insert(schema.sessions).values({ userId: user.id, token }).run();

    return c.json({
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
      token,
    }, 201);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.errors[0].message }, 400);
    }
    return c.json({ error: err.message || "Registration failed" }, 500);
  }
});

// Login
router.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = loginPayload.parse(body);

    const user = db.select().from(schema.users).where(eq(schema.users.email, parsed.email)).get();
    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Create session
    const token = crypto.randomBytes(48).toString("hex");
    db.insert(schema.sessions).values({ userId: user.id, token }).run();

    return c.json({
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
      token,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.errors[0].message }, 400);
    }
    return c.json({ error: err.message || "Login failed" }, 500);
  }
});

// Logout
router.post("/logout", async (c) => {
  const auth = c.req.header("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (token) {
    db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
  }
  return c.json({ success: true });
});

// Get current user with workspace info
router.get("/me", (c) => {
  try {
    const ctx = requireAuth(c);
    // Get all workspaces the user is a member of
    const memberships = db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, ctx.user.id))
      .all();
    const workspaceIds = memberships.map(m => m.workspaceId);
    let userWorkspaces: { id: number; name: string; slug: string; description: string | null }[] = [];
    if (workspaceIds.length > 0) {
      const raw = db.select().from(schema.workspaces)
        .where(inArray(schema.workspaces.id, workspaceIds))
        .all();
      userWorkspaces = raw.map(w => ({
        id: w.id, name: w.name, slug: w.slug, description: w.description,
      }));
    }
    return c.json({
      user: ctx.user,
      workspaces: userWorkspaces.map(w => ({
        id: w.id, name: w.name, slug: w.slug, description: w.description
      })),
      activeWorkspace: {
        id: ctx.workspace.id, name: ctx.workspace.name, slug: ctx.workspace.slug
      },
    });
  } catch {
    // Fallback to simple token lookup
    const auth = c.req.header("Authorization");
    const token = auth?.replace("Bearer ", "");
    const user = getUserFromToken(token);
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    return c.json({
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
      workspaces: [],
      activeWorkspace: null,
    });
  }
});

// Update profile
router.put("/profile", async (c) => {
  try {
    const ctx = requireAuth(c);

    const body = await c.req.json();
    const parsed = updateProfilePayload.parse(body);

    const updateData: any = { updatedAt: new Date().toISOString() };
    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.email !== undefined) {
      // Check email uniqueness
      const existing = db.select().from(schema.users).where(eq(schema.users.email, parsed.email)).get();
      if (existing && existing.id !== ctx.user.id) {
        return c.json({ error: "Email already in use" }, 409);
      }
      updateData.email = parsed.email;
    }
    if (parsed.avatar !== undefined) updateData.avatar = parsed.avatar;

    const updated = db.update(schema.users).set(updateData).where(eq(schema.users.id, ctx.user.id)).returning().get();
    return c.json({ id: updated.id, name: updated.name, email: updated.email, avatar: updated.avatar });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.errors[0].message }, 400);
    }
    return c.json({ error: err.message || "Update failed" }, 500);
  }
});

// Delete account (permanently)
router.delete("/account", async (c) => {
  try {
    const ctx = requireAuth(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.object({ password: z.string().min(1) }).parse(body);

    // Verify password
    const user = db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id)).get();
    if (!user) return c.json({ error: "User not found" }, 404);

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) return c.json({ error: "Invalid password" }, 403);

    // 1. Delete all sessions for this user
    db.delete(schema.sessions).where(eq(schema.sessions.userId, ctx.user.id)).run();

    // 2. Find all workspaces the user is a member of
    const memberships = db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, ctx.user.id))
      .all();

    // 3. For workspaces where user is owner, delete all workspace data
    const ownedWorkspaceIds = memberships.filter(m => m.role === "owner").map(m => m.workspaceId);
    for (const wsId of ownedWorkspaceIds) {
      // SSH keys
      db.delete(schema.sshKeys).where(eq(schema.sshKeys.workspaceId, wsId)).run();

      // Collections and their children
      const wsCollections = db.select().from(schema.collections).where(eq(schema.collections.workspaceId, wsId)).all();
      for (const col of wsCollections) {
        db.delete(schema.commits).where(eq(schema.commits.collectionId, col.id)).run();
        db.delete(schema.analyses).where(eq(schema.analyses.collectionId, col.id)).run();
        db.delete(schema.reports).where(eq(schema.reports.collectionId, col.id)).run();
      }
      db.delete(schema.collections).where(eq(schema.collections.workspaceId, wsId)).run();

      // Repositories
      db.delete(schema.repositories).where(eq(schema.repositories.workspaceId, wsId)).run();

      // LLM providers
      db.delete(schema.llmProviders).where(eq(schema.llmProviders.workspaceId, wsId)).run();

      // Report templates
      db.delete(schema.reportTemplates).where(eq(schema.reportTemplates.workspaceId, wsId)).run();

      // Workspace members for this workspace
      db.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, wsId)).run();

      // The workspace itself
      db.delete(schema.workspaces).where(eq(schema.workspaces.id, wsId)).run();
    }

    // 4. For workspaces where user is NOT owner, just remove the membership
    const memberOnlyIds = memberships.filter(m => m.role !== "owner").map(m => m.workspaceId);
    for (const wsId of memberOnlyIds) {
      db.delete(schema.workspaceMembers)
        .where(and(eq(schema.workspaceMembers.workspaceId, wsId), eq(schema.workspaceMembers.userId, ctx.user.id)))
        .run();
    }

    // 5. Finally delete the user
    db.delete(schema.users).where(eq(schema.users.id, ctx.user.id)).run();

    return c.json({ success: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.errors[0].message }, 400);
    }
    return c.json({ error: err.message || "Account deletion failed" }, 500);
  }
});

// Change password
router.post("/change-password", async (c) => {
  try {
    const ctx = requireAuth(c);

    const body = await c.req.json();
    const parsed = z.object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z.string().min(6, "New password must be at least 6 characters").max(100),
    }).parse(body);

    // Fetch user with password hash
    const user = db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id)).get();
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify current password
    const valid = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Current password is incorrect" }, 403);
    }

    // Hash and update new password
    const newHash = await bcrypt.hash(parsed.newPassword, 10);
    db.update(schema.users)
      .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
      .where(eq(schema.users.id, ctx.user.id))
      .run();

    return c.json({ success: true, message: "Password changed successfully." });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.errors[0].message }, 400);
    }
    return c.json({ error: err.message || "Failed to change password" }, 500);
  }
});

export { router as authRouter };
