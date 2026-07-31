import { createHash, randomBytes } from "node:crypto";

import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

/**
 * The queue panel has its own session cookie. It is deliberately isolated from
 * the Studio session so a queue operator can never reach the customer's
 * content, telas or billing — only the calls of their own screen.
 */
const COOKIE_NAME = "mdi_queue_session";
const SESSION_HOURS = 24;

export type QueuePanelSession = {
  panelId: string;
  organizationId: string;
  deviceId: string;
  deviceName: string;
  username: string;
  mode: string;
  prefix: string | null;
  displaySeconds: number;
  isEnabled: boolean;
};

export async function hashQueuePassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createQueueSession(panelId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await getDb().insert(schema.queueSessions).values({ id: hashToken(token), panelId, expiresAt });

  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroyQueueSession() {
  const token = getCookie(COOKIE_NAME);
  deleteCookie(COOKIE_NAME, { path: "/" });
  if (!token) return;
  await getDb().delete(schema.queueSessions).where(eq(schema.queueSessions.id, hashToken(token)));
}

/** Verifies the operator credentials. Same generic failure for user/password. */
export async function authenticateOperator(username: string, password: string) {
  const rows = await getDb()
    .select({
      id: schema.queuePanels.id,
      passwordHash: schema.queuePanels.passwordHash,
      isEnabled: schema.queuePanels.isEnabled,
    })
    .from(schema.queuePanels)
    .where(eq(schema.queuePanels.username, username))
    .limit(1);

  const panel = rows[0];
  if (!panel) return null;
  const ok = await bcrypt.compare(password, panel.passwordHash);
  if (!ok || !panel.isEnabled) return null;
  return panel.id;
}

/** Resolves the operator's panel from the cookie, or null. Never throws. */
export async function getQueueSession(): Promise<QueuePanelSession | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;

  const rows = await getDb()
    .select({
      panelId: schema.queuePanels.id,
      organizationId: schema.queuePanels.organizationId,
      deviceId: schema.queuePanels.deviceId,
      deviceName: schema.devices.name,
      username: schema.queuePanels.username,
      mode: schema.queuePanels.mode,
      prefix: schema.queuePanels.prefix,
      displaySeconds: schema.queuePanels.displaySeconds,
      isEnabled: schema.queuePanels.isEnabled,
    })
    .from(schema.queueSessions)
    .innerJoin(schema.queuePanels, eq(schema.queuePanels.id, schema.queueSessions.panelId))
    .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
    .where(
      and(
        eq(schema.queueSessions.id, hashToken(token)),
        gt(schema.queueSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.isEnabled) return null;
  return row;
}

export async function requireQueueSession(): Promise<QueuePanelSession> {
  const session = await getQueueSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

/** "Setor Caixa, senha A012" — the sentence the TV reads out loud. */
export function buildSpokenText(sectorName: string | null, label: string) {
  const spelled = label.split("").join(" ");
  if (sectorName) return `Senha ${spelled}. ${sectorName}.`;
  return `Senha ${spelled}.`;
}

/** "A" + 12 -> "A012" */
export function buildLabel(prefix: string | null, value: number) {
  const padded = String(value).padStart(3, "0");
  return prefix ? `${prefix}${padded}` : padded;
}
