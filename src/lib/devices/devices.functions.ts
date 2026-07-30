import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CANVAS_PRESET_IDS } from "@/lib/media/presets";

/** A screen is considered online when it checked in within this window. */
export const DEVICE_ONLINE_WINDOW_MS = 90_000;

export type DeviceListItem = {
  id: string;
  name: string;
  status: "pending" | "active" | "blocked";
  canvasPreset: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  defaultPlaylistId: string | null;
  audioEnabled: boolean;
  appVersion: string | null;
  lastSeenAt: string | null;
  online: boolean;
  createdAt: string;
};

const nameSchema = z.string().trim().min(1, "Informe um nome").max(120);
const presetSchema = z.enum(CANVAS_PRESET_IDS as [string, ...string[]]);

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
        defaultPlaylistId: row.defaultPlaylistId,
        audioEnabled: row.audioEnabled,
        appVersion: row.appVersion,
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        online: row.lastSeenAt ? now - row.lastSeenAt.getTime() < DEVICE_ONLINE_WINDOW_MS : false,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
);

/**
 * Claims an activation code shown by a TV app and binds that screen to the
 * caller's organization. Only rows that are still unlinked can be claimed, so
 * one customer can never steal another customer's screen.
 */
export const linkDevice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z
          .string()
          .trim()
          .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .refine((value) => value.length === 6, "Informe o código de 6 caracteres"),
        name: nameSchema,
        canvasPreset: presetSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, isNull } = await import("drizzle-orm");
    const user = await requireUser();

    const updated = await getDb()
      .update(schema.devices)
      .set({
        organizationId: user.organizationId,
        name: data.name,
        canvasPreset: data.canvasPreset,
        status: "active",
        pairingExpiresAt: null,
      })
      .where(
        and(
          eq(schema.devices.pairingCode, data.code),
          isNull(schema.devices.organizationId),
        ),
      )
      .returning({ id: schema.devices.id, name: schema.devices.name });

    // Same generic message for unknown and already-claimed codes.
    if (!updated[0]) throw new Error("Código inválido ou já utilizado.");

    // Wakes the TV immediately: it leaves the activation screen in ~1 second.
    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(updated[0].id);

    return { id: updated[0].id, name: updated[0].name };
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

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);

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

    // Releases the screen's open connection so it wipes its cache right away.
    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);

    return { ok: true };
  });

/** Queues a remote command. Ownership is verified before anything is written. */
/**
 * Sets (or clears) the playlist a screen plays by default. Both the screen and
 * the playlist must belong to the caller's organization.
 */
export const setDevicePlaylist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        playlistId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    if (data.playlistId) {
      const owned = await db
        .select({ id: schema.playlists.id })
        .from(schema.playlists)
        .where(
          and(
            eq(schema.playlists.id, data.playlistId),
            eq(schema.playlists.organizationId, user.organizationId),
          ),
        )
        .limit(1);
      if (!owned[0]) throw new Error("Playlist não encontrada.");
    }

    const updated = await db
      .update(schema.devices)
      .set({ defaultPlaylistId: data.playlistId })
      .where(
        and(
          eq(schema.devices.id, data.deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      )
      .returning({ id: schema.devices.id });

    if (!updated[0]) throw new Error("Tela não encontrada.");

    // Tell the screen to pick up the new content on its next contact.
    await db.insert(schema.deviceCommands).values({
      deviceId: data.deviceId,
      kind: "sync_playlist",
      createdBy: user.id,
    });

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);

    return { ok: true };
  });

/**
 * Global audio switch of a screen. When disabled, the TV silences every video
 * regardless of the per-item audio setting in the playlist.
 */
export const setDeviceAudio = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ deviceId: z.string().uuid(), audioEnabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    const updated = await getDb()
      .update(schema.devices)
      .set({ audioEnabled: data.audioEnabled })
      .where(
        and(
          eq(schema.devices.id, data.deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      )
      .returning({ id: schema.devices.id });

    if (!updated[0]) throw new Error("Tela não encontrada.");

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);

    return { ok: true };
  });

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

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);

    return { ok: true };
  });