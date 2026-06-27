import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and, lt } from "drizzle-orm";
import { hashToken, isSessionExpired } from "./crypto";
import { slugify } from "./string";

// Re-export for consumers that import from auth.ts
export { slugify };

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
}

export interface AuthSession {
  id: number;
  userId: number;
  token: string;
  expiresAt: string | null;
}

export interface AuthWorkspace {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  currentUserId: number;
}

export interface AuthContext {
  user: AuthUser;
  session: AuthSession;
  workspace: AuthWorkspace;
}



/**
 * Require authentication and return current user + session.
 * Does NOT require a workspace — use for endpoints that work across workspaces.
 * Tokens are hashed (SHA-256) before DB lookup. Expired sessions are deleted.
 */
export function requireUser(c: Context): { user: AuthUser; session: AuthSession } {
  const auth = c.req.header("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  const hashedToken = hashToken(token);
  const session = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, hashedToken))
    .get();

  if (!session) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  // Check session expiry
  if (isSessionExpired(session.expiresAt)) {
    db.delete(schema.sessions).where(eq(schema.sessions.id, session.id)).run();
    throw new HTTPException(401, { message: "Session expired" });
  }

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .get();

  if (!user) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  return {
    session: { id: session.id, userId: session.userId, token: session.token, expiresAt: session.expiresAt },
    user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
  };
}

/**
 * Get the active workspace for the current request.
 * Reads `X-Workspace-Id` header. Falls back to the user's first workspace.
 * Verifies user is a member of the requested workspace.
 * Throws 403 if not a member, 404 if workspace not found.
 */
export function getCurrentWorkspace(c: Context, userId: number): AuthWorkspace {
  const headerId = c.req.header("X-Workspace-Id");
  let workspaceId: number | null = null;

  if (headerId) {
    workspaceId = parseInt(headerId);
    if (isNaN(workspaceId)) {
      throw new HTTPException(400, { message: "Invalid X-Workspace-Id header" });
    }
  }

  // If no header, find user's first workspace
  if (!workspaceId) {
    const membership = db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, userId))
      .get();

    if (!membership) {
      throw new HTTPException(403, { message: "No workspace available" });
    }
    workspaceId = membership.workspaceId;
  }

  // Verify membership for the requested/fallback workspace
  const membership = db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .get();

  if (!membership) {
    throw new HTTPException(403, { message: "Access denied to this workspace" });
  }

  const workspace = db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .get();

  if (!workspace) {
    throw new HTTPException(404, { message: "Workspace not found" });
  }

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    currentUserId: membership.userId, // member who queried — for ownership checks, use workspaceMembers with role=owner
  };
}

/**
 * Require authentication AND workspace access.
 * This is the main auth helper used by most endpoints.
 */
export function requireAuth(c: Context): AuthContext {
  const { user, session } = requireUser(c);
  const workspace = getCurrentWorkspace(c, user.id);
  return { user, session, workspace };
}

/**
 * Throw 403 if the resource's workspace ID does not match the current workspace.
 */
export function assertOwnership(
  resource: { workspaceId?: number } | null | undefined,
  workspaceId: number,
  label = "Resource",
): asserts resource is NonNullable<typeof resource> {
  if (!resource) {
    throw new HTTPException(404, { message: `${label} not found` });
  }
  if (resource.workspaceId !== undefined && resource.workspaceId !== workspaceId) {
    throw new HTTPException(404, { message: `${label} not found` });
  }
return;
}
