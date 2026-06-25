import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth } from "../lib/auth";

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
    db.insert(schema.workspaces).values({
      name: workspaceName,
      userId: user.id,
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

// Get current user
router.get("/me", (c) => {
  try {
    const ctx = requireAuth(c);
    return c.json(ctx.user);
  } catch {
    // Fallback to simple token lookup for backward compatibility
    const auth = c.req.header("Authorization");
    const token = auth?.replace("Bearer ", "");
    const user = getUserFromToken(token);
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    return c.json({ id: user.id, name: user.name, email: user.email, avatar: user.avatar });
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

export { router as authRouter };
