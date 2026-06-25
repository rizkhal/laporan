import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

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
}

export interface AuthWorkspace {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  ownerId: number;
}

export interface AuthContext {
  user: AuthUser;
  session: AuthSession;
  workspace: AuthWorkspace;
}

// Role hierarchy for permission checking
const ROLE_HIERARCHY: Record<string, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? -1) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

/**
 * Require authentication and return current user + session.
 * Does NOT require a workspace — use for endpoints that work across workspaces.
 */
export function requireUser(c: Context): { user: AuthUser; session: AuthSession } {
  const auth = c.req.header("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  const session = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token))
    .get();

  if (!session) {
    throw new HTTPException(401, { message: "Not authenticated" });
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
    session: { id: session.id, userId: session.userId, token: session.token },
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
    ownerId: membership.userId, // member who queried — for ownership checks, use workspaceMembers with role=owner
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
}

/**
 * Assert the current user has at least the given role in the workspace.
 */
export function assertRole(
  c: Context,
  userId: number,
  workspaceId: number,
  minRole: "member" | "admin" | "owner",
): void {
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

  if (!membership || !hasMinRole(membership.role, minRole)) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
}

/**
 * Generate a URL-safe slug from a string.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "workspace";
}
