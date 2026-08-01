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
  operatorId: string;
  operatorName: string;
  /** Guichê/mesa deste operador ("Guichê 01") ou null. */
  deskLabel: string | null;
  numberingScope: string;
  priorityPolicy: string;
  priorityPrefix: string | null;
  lastCalledKind: string;
  /** Setores que este operador pode chamar. Vazio = todos. */
  allowedSectorIds: string[];
};

export async function hashQueuePassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createQueueSession(panelId: string, operatorId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await getDb()
    .insert(schema.queueSessions)
    .values({ id: hashToken(token), panelId, operatorId, expiresAt });

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
export async function authenticateOperator(
  username: string,
  password: string,
): Promise<{ panelId: string; operatorId: string } | null> {
  const rows = await getDb()
    .select({
      operatorId: schema.queueOperators.id,
      panelId: schema.queueOperators.panelId,
      passwordHash: schema.queueOperators.passwordHash,
      operatorEnabled: schema.queueOperators.isEnabled,
      panelEnabled: schema.queuePanels.isEnabled,
    })
    .from(schema.queueOperators)
    .innerJoin(schema.queuePanels, eq(schema.queuePanels.id, schema.queueOperators.panelId))
    .where(eq(schema.queueOperators.username, username))
    .limit(1);

  const operator = rows[0];
  if (!operator) return null;
  const ok = await bcrypt.compare(password, operator.passwordHash);
  if (!ok || !operator.operatorEnabled || !operator.panelEnabled) return null;
  return { panelId: operator.panelId, operatorId: operator.operatorId };
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
      mode: schema.queuePanels.mode,
      prefix: schema.queuePanels.prefix,
      displaySeconds: schema.queuePanels.displaySeconds,
      isEnabled: schema.queuePanels.isEnabled,
      numberingScope: schema.queuePanels.numberingScope,
      priorityPolicy: schema.queuePanels.priorityPolicy,
      priorityPrefix: schema.queuePanels.priorityPrefix,
      lastCalledKind: schema.queuePanels.lastCalledKind,
      operatorId: schema.queueOperators.id,
      operatorName: schema.queueOperators.name,
      deskLabel: schema.queueOperators.deskLabel,
      username: schema.queueOperators.username,
      operatorEnabled: schema.queueOperators.isEnabled,
    })
    .from(schema.queueSessions)
    .innerJoin(schema.queuePanels, eq(schema.queuePanels.id, schema.queueSessions.panelId))
    .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
    .innerJoin(schema.queueOperators, eq(schema.queueOperators.id, schema.queueSessions.operatorId))
    .where(
      and(
        eq(schema.queueSessions.id, hashToken(token)),
        gt(schema.queueSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.isEnabled || !row.operatorEnabled) return null;

  const allowed = await getDb()
    .select({ sectorId: schema.queueOperatorSectors.sectorId })
    .from(schema.queueOperatorSectors)
    .where(eq(schema.queueOperatorSectors.operatorId, row.operatorId));

  return { ...row, allowedSectorIds: allowed.map((a) => a.sectorId) };
}

export async function requireQueueSession(): Promise<QueuePanelSession> {
  const session = await getQueueSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

/**
 * Ticket as it should be *spoken*: leading zeros are dropped and the number is
 * read as a number, so "001" becomes "senha um", "012" "senha doze" and "104"
 * "senha cento e quatro". A letter prefix is still spelled out ("A 12").
 */
export function spokenLabel(label: string) {
  const match = /^([A-Za-z]*)\s*0*(\d+)$/.exec(label.trim());
  if (!match) return label.split("").join(" ");
  const prefix = (match[1] ?? "").toUpperCase();
  const number = String(Number(match[2]));
  return prefix ? `${prefix.split("").join(" ")} ${number}` : number;
}

/**
 * Sector name as it should be *spoken*: any number inside the name loses its
 * leading zeros so "Guichê 01" is read "Guichê um" and "Guichê 103"
 * "Guichê cento e três".
 */
export function spokenSectorName(sectorName: string) {
  return sectorName
    .trim()
    .replace(/\d+/g, (digits) => String(Number(digits)));
}

/** "Senha doze. Caixa 2." — ticket first, then the sector, as requested. */
export function buildSpokenText(sectorName: string | null, label: string, kind = "normal") {
  const spoken = spokenLabel(label);
  const head = kind === "priority" ? `Senha preferencial ${spoken}` : `Senha ${spoken}`;
  if (sectorName) return `${head}. ${spokenSectorName(sectorName)}.`;
  return `${head}.`;
}

/** "A" + 12 -> "A012" */
export function buildLabel(prefix: string | null, value: number) {
  const padded = String(value).padStart(3, "0");
  return prefix ? `${prefix}${padded}` : padded;
}
