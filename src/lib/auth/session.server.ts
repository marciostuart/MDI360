import { randomBytes, createHash } from "node:crypto";

import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import type { AppRole } from "@/lib/db/schema";

const COOKIE_NAME = "signage_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  roles: AppRole[];
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** Opaque random token. Stored hashed so a database leak can't resume sessions. */
function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const db = getDb();
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });

  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const token = getCookie(COOKIE_NAME);
  deleteCookie(COOKIE_NAME, { path: "/" });
  if (!token) return;
  const db = getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
}

/** Resolves the signed-in user, or null. Never throws on a missing session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;

  const db = getDb();
  const rows = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isActive: schema.users.isActive,
      organizationId: schema.organizations.id,
      organizationName: schema.organizations.name,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.users.organizationId))
    .where(
      and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  const roleRows = await db
    .select({ role: schema.userRoles.role })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, row.userId));

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    roles: roleRows.map((r) => r.role),
  };
}

/** Use in any handler that must not run for anonymous visitors. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireRole(...allowed: AppRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.some((role) => user.roles.includes(role))) throw new Error("FORBIDDEN");
  return user;
}