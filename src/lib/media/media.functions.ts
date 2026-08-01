import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { WidgetConfig } from "@/lib/widgets/catalog";

import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  CANVAS_PRESET_IDS,
  MAX_OPTIMIZED_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
} from "./presets";

const ticketSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome").max(160),
    kind: z.enum(["image", "video"]),
    mimeType: z.string().trim().max(120),
    extension: z.enum(["webp", "jpg", "png", "mp4", "webm"]),
    byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
    originalByteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    durationMs: z.number().int().min(0).max(MAX_VIDEO_DURATION_MS).nullable(),
    canvasPreset: z.enum(CANVAS_PRESET_IDS as [string, ...string[]]),
  })
  .superRefine((value, ctx) => {
    const allowed = value.kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    if (!allowed.includes(value.mimeType)) {
      ctx.addIssue({ code: "custom", message: "Tipo de arquivo não permitido." });
    }
    const limit = value.kind === "image" ? MAX_OPTIMIZED_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (value.byteSize > limit) {
      ctx.addIssue({ code: "custom", message: "Arquivo acima do limite permitido." });
    }
  });

export type MediaListItem = {
  id: string;
  name: string;
  kind: "image" | "video" | "web" | "widget" | "stream";
  status: "uploading" | "ready" | "failed";
  canvasPreset: string;
  mimeType: string | null;
  byteSize: number | null;
  originalByteSize: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  previewUrl: string | null;
  widgetType: string | null;
  widgetConfig: WidgetConfig | null;
  /** Origem externa (link do YouTube importado), quando houver. */
  sourceUrl: string | null;
  /** Free-form labels used by the library filter. */
  tags: string[];
  /** Optional airing window (ISO strings) — file only plays inside it. */
  airStartAt: string | null;
  airEndAt: string | null;
};

/** Library of the caller's organization. Never returns another tenant's rows. */
export const listMediaAssets = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ storageReady: boolean; items: MediaListItem[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    const { isStorageConfigured, createDownloadUrl } = await import("@/lib/storage.server");
    if (!isDatabaseConfigured()) return { storageReady: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { desc, eq } = await import("drizzle-orm");
    const user = await requireUser();

    const rows = await getDb()
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.organizationId, user.organizationId))
      .orderBy(desc(schema.mediaAssets.createdAt))
      .limit(200);

    const storageReady = isStorageConfigured();

    const items = await Promise.all(
      rows.map(async (row) => {
        let previewUrl: string | null = null;
        if (storageReady && row.storageKey && row.status === "ready") {
          try {
            previewUrl = await createDownloadUrl(row.storageKey, 900);
          } catch {
            previewUrl = null;
          }
        }
        return {
          id: row.id,
          name: row.name,
          kind: row.kind,
          status: row.status,
          canvasPreset: row.canvasPreset,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
          originalByteSize: row.originalByteSize,
          durationMs: row.durationMs,
          width: row.width,
          height: row.height,
          createdAt: row.createdAt.toISOString(),
          previewUrl,
          widgetType: row.widgetType,
          widgetConfig: (row.widgetConfig as WidgetConfig | null) ?? null,
          sourceUrl: row.sourceUrl,
          tags: row.tags ?? [],
          airStartAt: row.airStartAt ? row.airStartAt.toISOString() : null,
          airEndAt: row.airEndAt ? row.airEndAt.toISOString() : null,
        } satisfies MediaListItem;
      }),
    );

    return { storageReady, items };
  },
);

/**
 * Creates the pending row and a short-lived signed PUT URL. The storage key is
 * generated server-side and namespaced per organization, so a client can never
 * choose where its file lands or overwrite someone else's object.
 */
export const createMediaUploadTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ticketSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");

    const { isStorageConfigured, createUploadUrl } = await import("@/lib/storage.server");
    if (!isStorageConfigured()) throw new Error("Armazenamento (MinIO) não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const { randomUUID } = await import("node:crypto");
    const user = await requireUser();

    const assetId = randomUUID();
    const storageKey = `org/${user.organizationId}/media/${assetId}.${data.extension}`;

    const { getOrgLimits } = await import("@/lib/admin/limits.server");
    const limits = await getOrgLimits(user.organizationId);
    if (limits.expired || limits.subscriptionStatus === "suspended") {
      throw new Error("Assinatura inativa. Fale com o suporte para reativar sua conta.");
    }
    const quotaBytes = limits.maxStorageMb * 1024 * 1024;

    // Atomic reservation: the row (and therefore the quota consumption) is only
    // created if the declared size still fits. Two parallel uploads can no
    // longer both pass a read-then-write check and overshoot the plan.
    const { sql } = await import("drizzle-orm");
    const inserted = await getDb().execute(sql`
      insert into media_assets
        (id, organization_id, name, kind, status, canvas_preset, storage_key,
         mime_type, byte_size, original_byte_size, duration_ms, width, height, created_by)
      select ${assetId}::uuid, ${user.organizationId}::uuid, ${data.name}, ${data.kind}::media_kind,
             'uploading'::media_status, ${data.canvasPreset}, ${storageKey},
             ${data.mimeType}, ${data.byteSize}, ${data.originalByteSize},
             ${data.durationMs ?? null}, ${data.width}, ${data.height}, ${user.id}::uuid
      where (
        select coalesce(sum(byte_size), 0) from media_assets
        where organization_id = ${user.organizationId}::uuid
      ) + ${data.byteSize} <= ${quotaBytes}
      returning id
    `);

    const rowCount = Array.isArray(inserted)
      ? inserted.length
      : ((inserted as { rowCount?: number; rows?: unknown[] }).rowCount ??
        (inserted as { rows?: unknown[] }).rows?.length ??
        0);

    if (!rowCount) {
      throw new Error(
        `Espaço esgotado: seu plano tem ${limits.maxStorageMb} MB. Remova arquivos ou faça upgrade.`,
      );
    }

    const uploadUrl = await createUploadUrl(storageKey, data.mimeType, 900);
    return { assetId, uploadUrl };
  });

export const confirmMediaUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ assetId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .update(schema.mediaAssets)
      .set({ status: "ready" })
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      );

    return { ok: true };
  });

const airWindowSchema = z
  .object({
    assetId: z.string().uuid(),
    airStartAt: z.string().datetime({ offset: true }).nullable(),
    airEndAt: z.string().datetime({ offset: true }).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.airStartAt && value.airEndAt && value.airEndAt <= value.airStartAt) {
      ctx.addIssue({ code: "custom", message: "O fim precisa ser depois do início." });
    }
  });

/**
 * Sets (or clears) the airing window of a single file. Applies everywhere the
 * file is used: playlists keep the item, but the players skip it outside the
 * window.
 */
export const setMediaAirWindow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => airWindowSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .update(schema.mediaAssets)
      .set({
        airStartAt: data.airStartAt ? new Date(data.airStartAt) : null,
        airEndAt: data.airEndAt ? new Date(data.airEndAt) : null,
      })
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      );

    // Screens re-sync immediately so the window takes effect right away.
    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { ok: true };
  });

const tagsSchema = z.object({
  assetId: z.string().uuid(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
});

/** Renames one file. Playlists reference it by id, so nothing else changes. */
export const renameMediaAsset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ assetId: z.string().uuid(), name: z.string().trim().min(1).max(160) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .update(schema.mediaAssets)
      .set({ name: data.name })
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      );

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);
    return { ok: true };
  });

export type MediaUsageRow = { id: string; name: string; position: number };
export type MediaStatsRow = { id: string; label: string; plays: number; seconds: number };
export type MediaDetails = {
  usage: MediaUsageRow[];
  totalPlays: number;
  totalSeconds: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
  byDevice: MediaStatsRow[];
  byPlaylist: MediaStatsRow[];
  /** Últimos 14 dias (data ISO + exibições) para o mini-histórico. */
  daily: { day: string; plays: number }[];
};

/** Where the file is used + proof-of-play numbers for a single file. */
export const getMediaAssetDetails = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ assetId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<MediaDetails> => {
    const empty: MediaDetails = {
      usage: [],
      totalPlays: 0,
      totalSeconds: 0,
      firstPlayedAt: null,
      lastPlayedAt: null,
      byDevice: [],
      byPlaylist: [],
      daily: [],
    };
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return empty;

    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, sql } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const owned = await db
      .select({ id: schema.mediaAssets.id })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!owned[0]) return empty;

    const usage = await db
      .select({
        id: schema.playlists.id,
        name: schema.playlists.name,
        position: schema.playlistItems.position,
      })
      .from(schema.playlistItems)
      .innerJoin(schema.playlists, eq(schema.playlists.id, schema.playlistItems.playlistId))
      .where(eq(schema.playlistItems.mediaAssetId, data.assetId))
      .orderBy(schema.playlists.name)
      .limit(200);

    const plays = sql<number>`count(*)::int`;
    const seconds = sql<number>`(coalesce(sum(${schema.playbackEvents.durationMs}), 0) / 1000)::int`;
    const scope = and(
      eq(schema.playbackEvents.organizationId, user.organizationId),
      eq(schema.playbackEvents.mediaAssetId, data.assetId),
    );

    const totals = await db
      .select({
        plays,
        seconds,
        first: sql<string | null>`min(${schema.playbackEvents.startedAt})`,
        last: sql<string | null>`max(${schema.playbackEvents.startedAt})`,
      })
      .from(schema.playbackEvents)
      .where(scope);

    const byDevice = await db
      .select({ id: schema.devices.id, label: schema.devices.name, plays, seconds })
      .from(schema.playbackEvents)
      .innerJoin(schema.devices, eq(schema.devices.id, schema.playbackEvents.deviceId))
      .where(scope)
      .groupBy(schema.devices.id, schema.devices.name)
      .orderBy(sql`count(*) desc`)
      .limit(50);

    const byPlaylist = await db
      .select({ id: schema.playlists.id, label: schema.playlists.name, plays, seconds })
      .from(schema.playbackEvents)
      .innerJoin(schema.playlists, eq(schema.playlists.id, schema.playbackEvents.playlistId))
      .where(scope)
      .groupBy(schema.playlists.id, schema.playlists.name)
      .orderBy(sql`count(*) desc`)
      .limit(50);

    const dailyRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.playbackEvents.startedAt}), 'YYYY-MM-DD')`,
        plays,
      })
      .from(schema.playbackEvents)
      .where(and(scope, sql`${schema.playbackEvents.startedAt} > now() - interval '14 days'`))
      .groupBy(sql`date_trunc('day', ${schema.playbackEvents.startedAt})`)
      .orderBy(sql`date_trunc('day', ${schema.playbackEvents.startedAt}) asc`);

    const total = totals[0];
    const toIso = (value: string | Date | null | undefined) =>
      value ? new Date(value).toISOString() : null;

    return {
      usage,
      totalPlays: total?.plays ?? 0,
      totalSeconds: total?.seconds ?? 0,
      firstPlayedAt: toIso(total?.first ?? null),
      lastPlayedAt: toIso(total?.last ?? null),
      byDevice,
      byPlaylist,
      daily: dailyRows,
    };
  });

/** Replaces the tag list of one file. Tags are normalized (lowercase, unique). */
export const setMediaTags = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tagsSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    const tags = Array.from(
      new Set(data.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    );

    await getDb()
      .update(schema.mediaAssets)
      .set({ tags })
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      );

    return { tags };
  });

export const deleteMediaAsset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ assetId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { deleteObject, isStorageConfigured } = await import("@/lib/storage.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const rows = await db
      .select({ storageKey: schema.mediaAssets.storageKey })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return { ok: true };

    await db
      .delete(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      );

    if (row.storageKey && isStorageConfigured()) {
      try {
        await deleteObject(row.storageKey);
      } catch (error) {
        console.error("failed to delete object", error);
      }
    }

    // Push the change right away: every screen re-syncs and drops the file
    // from its local cache instead of waiting for the periodic sync.
    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { ok: true };
  });
