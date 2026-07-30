import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CANVAS_PRESET_IDS } from "@/lib/media/presets";

/** A screen is considered online when it checked in within this window. */
export const DEVICE_ONLINE_WINDOW_MS = 90_000;
const PAIRING_TTL_MS = 24 * 60 * 60 * 1000;

export type DeviceListItem = {
  id: string;
  name: string;
  status: "pending" | "active" | "blocked";
  canvasPreset: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  online: boolean;
  createdAt: string;
};

const nameSchema = z.string().trim().min(1, "Informe um nome").max(120);
const presetSchema = z.enum(CANVAS_PRESET_IDS as [string, ...string[]]);

/** 6-digit code, no ambiguity: only digits, shown on the TV during pairing. */
async function generatePairingCode() {
  const { randomInt } = await import("node:crypto");
  return String(randomInt(100000, 1000000));
}

/** Screens of the caller's organization only. Never returns another tenant's rows. */
export const listDevices = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; items: DeviceListItem[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { configured: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { desc, eq } = await import("drizzle-orm");
    const user = await requireUser();

    const rows = await getDb()
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.organizationId, user.organizationId))
      .orderBy(desc(schema.devices.createdAt))
      .limit(500);

    const now = Date.now();
    return {
      configured: true,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        canvasPreset: row.canvasPreset,
        pairingCode: row.status === "active" ? null : row.pairingCode,
        pairingExpiresAt: row.pairingExpiresAt ? row.pairingExpiresAt.toISOString() : null,
        appVersion: row.appVersion,
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        online: row.lastSeenAt ? now - row.lastSeenAt.getTime() < DEVICE_ONLINE_WINDOW_MS : false,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
);

export const createDevice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ name: nameSchema, canvasPreset: presetSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const user = await requireUser();
    const db = getDb();

    // The pairing code is globally unique; retry on the rare collision.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const pairingCode = await generatePairingCode();
      try {
        const inserted = await db
          .insert(schema.devices)
          .values({
            organizationId: user.organizationId,
            name: data.name,
            canvasPreset: data.canvasPreset,
            status: "pending",
            pairingCode,
            pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS),
          })
          .returning({ id: schema.devices.id });
        return { id: inserted[0]!.id, pairingCode };
      } catch (error) {
        if (attempt === 5) throw error;
      }
    }
    throw new Error("Não foi possível gerar o código de pareamento.");
  });

export const regeneratePairingCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ deviceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const pairingCode = await generatePairingCode();
      try {
        const updated = await db
          .update(schema.devices)
          .set({
            pairingCode,
            pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS),
            status: "pending",
            tokenHash: null,
          })
          .where(
            and(
              eq(schema.devices.id, data.deviceId),
              eq(schema.devices.organizationId, user.organizationId),
            ),
          )
          .returning({ id: schema.devices.id });
        if (!updated[0]) throw new Error("Tela não encontrada.");
        return { pairingCode };
      } catch (error) {
        if (attempt === 5) throw error;
      }
    }
    throw new Error("Não foi possível gerar o código de pareamento.");
  });

export const updateDevice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        name: nameSchema.optional(),
        canvasPreset: presetSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    const patch: { name?: string; canvasPreset?: string } = {};
    if (data.name) patch.name = data.name;
    if (data.canvasPreset) patch.canvasPreset = data.canvasPreset;
    if (Object.keys(patch).length === 0) return { ok: true };

    await getDb()
      .update(schema.devices)
      .set(patch)
      .where(
        and(
          eq(schema.devices.id, data.deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      );

    return { ok: true };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ deviceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .delete(schema.devices)
      .where(
        and(
          eq(schema.devices.id, data.deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      );

    return { ok: true };
  });

/** Queues a remote command. Ownership is verified before anything is written. */
export const sendDeviceCommand = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        kind: z.enum(["reload", "restart", "screenshot", "sync_playlist", "update_app"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const owned = await db
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.id, data.deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      )
      .limit(1);

    if (!owned[0]) throw new Error("Tela não encontrada.");

    await db.insert(schema.deviceCommands).values({
      deviceId: data.deviceId,
      kind: data.kind,
      createdBy: user.id,
    });

    return { ok: true };
  });