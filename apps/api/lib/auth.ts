import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

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
  userId: number;
}

export interface AuthContext {
  user: AuthUser;
  session: AuthSession;
  workspace: AuthWorkspace;
}

/**
 * Require authentication and return current user, session, and workspace.
 * Throws 401 if not authenticated, 500 if no workspace found.
 */
export function requireAuth(c: Context): AuthContext {
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

  // Get the user's default workspace
  const workspace = db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.userId, user.id))
    .get();

  if (!workspace) {
    throw new HTTPException(500, { message: "No workspace found for user" });
  }

  return {
    user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
    session,
    workspace: { id: workspace.id, name: workspace.name, userId: workspace.userId },
  };
}

/**
 * Throw 404 if the resource's workspace ID does not match the current user's workspace.
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
