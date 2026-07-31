import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

export function newDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type PlayerDevice = {
  id: string;
  organizationId: string | null;
  name: string;
  canvasPreset: string;
  status: "pending" | "active" | "blocked";
  audioEnabled: boolean;
  transitionEffect: string;
};

/** Resolves the device row for a token, whatever its status (may be unlinked). */
export async function resolveDeviceByToken(request: Request): Promise<
  (PlayerDevice & { pairingCode: string | null }) | null
> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length < 20) return null;

  const rows = await getDb()
    .select({
      id: schema.devices.id,
      organizationId: schema.devices.organizationId,
      name: schema.devices.name,
      canvasPreset: schema.devices.canvasPreset,
      status: schema.devices.status,
      pairingCode: schema.devices.pairingCode,
      audioEnabled: schema.devices.audioEnabled,
      transitionEffect: schema.devices.transitionEffect,
    })
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.tokenHash, hashDeviceToken(token)),
        isNotNull(schema.devices.tokenHash),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Resolves the device behind a `Authorization: Bearer <deviceToken>` header.
 * Only hashes are stored, so a database dump cannot be replayed as a device.
 */
export async function authenticateDevice(request: Request): Promise<PlayerDevice | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length < 20) return null;

  const rows = await getDb()
    .select({
      id: schema.devices.id,
      organizationId: schema.devices.organizationId,
      name: schema.devices.name,
      canvasPreset: schema.devices.canvasPreset,
      status: schema.devices.status,
      audioEnabled: schema.devices.audioEnabled,
      transitionEffect: schema.devices.transitionEffect,
    })
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.tokenHash, hashDeviceToken(token)),
        isNotNull(schema.devices.tokenHash),
      ),
    )
    .limit(1);

  const device = rows[0];
  if (!device || device.status !== "active" || !device.organizationId) return null;
  return device;
}