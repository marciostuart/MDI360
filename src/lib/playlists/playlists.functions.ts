import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { WidgetConfig } from "@/lib/widgets/catalog";
import type { ScheduleRule } from "@/lib/schedules/rules";

export type PlaylistListItem = {
  id: string;
  name: string;
  description: string | null;
  revision: number;
  itemCount: number;
  totalDurationMs: number;
  updatedAt: string;
};

export type PlaylistItemDetail = {
  id: string;
  mediaAssetId: string | null;
  nestedPlaylistId: string | null;
  scheduleRules: ScheduleRule[];
  position: number;
  durationMs: number;
  isMuted: boolean;
  name: string;
  kind: "image" | "video" | "web" | "widget" | "stream" | "playlist";
  canvasPreset: string | null;
  previewUrl: string | null;
  widgetType: string | null;
  widgetConfig: WidgetConfig | null;
};

const nameSchema = z.string().trim().min(1, "Informe um nome").max(120);
const playlistRuleSchema = z
  .object({
    type: z.enum([
      "date_time_range",
      "specific_date_time",
      "daily_time",
      "month_day",
      "weekdays",
      "month",
    ]),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    endMinute: z.number().int().min(1).max(1440).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
    day: z.number().int().min(1).max(31).optional(),
    month: z.number().int().min(1).max(12).optional(),
  })
  .superRefine((rule, ctx) => {
    if (
      ["daily_time", "weekdays", "specific_date_time"].includes(rule.type) &&
      (rule.startMinute === undefined || rule.endMinute === undefined)
    )
      ctx.addIssue({ code: "custom", message: "Informe o horário inicial e final da sublista." });
    if (rule.type === "weekdays" && !rule.weekdays?.length)
      ctx.addIssue({ code: "custom", message: "Escolha ao menos um dia da semana." });
    if (rule.type === "specific_date_time" && !rule.date)
      ctx.addIssue({ code: "custom", message: "Informe a data específica." });
    if (rule.type === "month_day" && !rule.day)
      ctx.addIssue({ code: "custom", message: "Informe o dia do mês." });
    if (rule.type === "month" && !rule.month)
      ctx.addIssue({ code: "custom", message: "Informe o mês." });
    if (rule.type === "date_time_range" && !rule.startAt && !rule.endAt)
      ctx.addIssue({ code: "custom", message: "Informe o início e/ou fim do período." });
    if (rule.startAt && rule.endAt && new Date(rule.startAt) >= new Date(rule.endAt))
      ctx.addIssue({ code: "custom", message: "O fim do período deve ser posterior ao início." });
  });

/** Playlists of the caller's organization only. */
export const listPlaylists = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; items: PlaylistListItem[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { configured: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { desc, eq, sql } = await import("drizzle-orm");
    const user = await requireUser();

    const rows = await getDb()
      .select({
        id: schema.playlists.id,
        name: schema.playlists.name,
        description: schema.playlists.description,
        revision: schema.playlists.revision,
        updatedAt: schema.playlists.updatedAt,
        itemCount: sql<number>`count(${schema.playlistItems.id})::int`,
        totalDurationMs: sql<number>`coalesce(sum(${schema.playlistItems.durationMs}), 0)::int`,
      })
      .from(schema.playlists)
      .leftJoin(schema.playlistItems, eq(schema.playlistItems.playlistId, schema.playlists.id))
      .where(eq(schema.playlists.organizationId, user.organizationId))
      .groupBy(schema.playlists.id)
      .orderBy(desc(schema.playlists.updatedAt))
      .limit(200);

    return {
      configured: true,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        revision: row.revision,
        itemCount: Number(row.itemCount ?? 0),
        totalDurationMs: Number(row.totalDurationMs ?? 0),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  },
);

export const getPlaylist = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ playlistId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ items: PlaylistItemDetail[] }> => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { isStorageConfigured, createDownloadUrl } = await import("@/lib/storage.server");
    const { and, asc, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    // Ownership check first: a playlist id from another tenant resolves to nothing.
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

    const rows = await db
      .select({
        id: schema.playlistItems.id,
        mediaAssetId: schema.playlistItems.mediaAssetId,
        nestedPlaylistId: schema.playlistItems.nestedPlaylistId,
        scheduleRules: schema.playlistItems.scheduleRules,
        position: schema.playlistItems.position,
        durationMs: schema.playlistItems.durationMs,
        isMuted: schema.playlistItems.isMuted,
        name: schema.mediaAssets.name,
        kind: schema.mediaAssets.kind,
        assetDurationMs: schema.mediaAssets.durationMs,
        canvasPreset: schema.mediaAssets.canvasPreset,
        storageKey: schema.mediaAssets.storageKey,
        widgetType: schema.mediaAssets.widgetType,
        widgetConfig: schema.mediaAssets.widgetConfig,
        nestedName: schema.playlists.name,
      })
      .from(schema.playlistItems)
      .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playlistItems.mediaAssetId))
      .leftJoin(schema.playlists, eq(schema.playlists.id, schema.playlistItems.nestedPlaylistId))
      .where(eq(schema.playlistItems.playlistId, data.playlistId))
      .orderBy(asc(schema.playlistItems.position));

    const storageReady = isStorageConfigured();
    const items = await Promise.all(
      rows.map(async (row) => {
        let previewUrl: string | null = null;
        if (storageReady && row.storageKey) {
          try {
            previewUrl = await createDownloadUrl(row.storageKey, 900);
          } catch {
            previewUrl = null;
          }
        }
        return {
          ...row,
          durationMs:
            row.kind === "video" && row.assetDurationMs
              ? row.assetDurationMs
              : row.durationMs,
          name: row.nestedName ?? row.name ?? "Lista de reprodução",
          kind: row.nestedPlaylistId ? ("playlist" as const) : row.kind!,
          scheduleRules: (row.scheduleRules as ScheduleRule[]) ?? [],
          widgetConfig: (row.widgetConfig as WidgetConfig | null) ?? null,
          previewUrl,
        } satisfies PlaylistItemDetail;
      }),
    );

    return { items };
  });

export const createPlaylist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ name: nameSchema, description: z.string().trim().max(400).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");
    const { requireUser } = await import("@/lib/auth/session.server");
    const user = await requireUser();

    const inserted = await getDb()
      .insert(schema.playlists)
      .values({
        organizationId: user.organizationId,
        name: data.name,
        description: data.description || null,
      })
      .returning({ id: schema.playlists.id });

    return { id: inserted[0]!.id };
  });

export const updatePlaylist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        playlistId: z.string().uuid(),
        name: nameSchema.optional(),
        description: z.string().trim().max(400).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, sql } = await import("drizzle-orm");
    const user = await requireUser();

    const patch: Record<string, unknown> = {
      // The player uses this revision to apply playlist changes at the next
      // item boundary, without interrupting the item currently on screen.
      revision: sql`${schema.playlists.revision} + 1`,
      updatedAt: new Date(),
    };
    if (data.name) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description || null;

    await getDb()
      .update(schema.playlists)
      .set(patch)
      .where(
        and(
          eq(schema.playlists.id, data.playlistId),
          eq(schema.playlists.organizationId, user.organizationId),
        ),
      );

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { ok: true };
  });

export const deletePlaylist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ playlistId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .delete(schema.playlists)
      .where(
        and(
          eq(schema.playlists.id, data.playlistId),
          eq(schema.playlists.organizationId, user.organizationId),
        ),
      );

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { ok: true };
  });

/**
 * Replaces the whole item list in one shot. Every referenced asset is checked
 * against the caller's organization, so nobody can smuggle another tenant's media
 * into their own playlist.
 */
export const setPlaylistItems = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        playlistId: z.string().uuid(),
        items: z
          .array(
            z
              .object({
                mediaAssetId: z.string().uuid().nullable(),
                nestedPlaylistId: z.string().uuid().nullable(),
                scheduleRules: z.array(playlistRuleSchema).max(10).default([]),
                durationMs: z
                  .number()
                  .int()
                  .min(1000)
                  .max(30 * 60 * 1000),
                isMuted: z.boolean().default(true),
              })
              .refine(
                (item) => Boolean(item.mediaAssetId) !== Boolean(item.nestedPlaylistId),
                "Escolha um arquivo ou uma sublista.",
              ),
          )
          .max(300),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, inArray } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

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

    const assetIds = [
      ...new Set(data.items.flatMap((item) => (item.mediaAssetId ? [item.mediaAssetId] : []))),
    ];
    if (assetIds.length > 0) {
      const assets = await db
        .select({ id: schema.mediaAssets.id })
        .from(schema.mediaAssets)
        .where(
          and(
            inArray(schema.mediaAssets.id, assetIds),
            eq(schema.mediaAssets.organizationId, user.organizationId),
          ),
        );
      if (assets.length !== assetIds.length) throw new Error("Conteúdo inválido na playlist.");
    }

    const videoDurations = new Map<string, number>();
    if (assetIds.length > 0) {
      const assetRows = await db
        .select({ id: schema.mediaAssets.id, kind: schema.mediaAssets.kind, durationMs: schema.mediaAssets.durationMs })
        .from(schema.mediaAssets)
        .where(
          and(
            inArray(schema.mediaAssets.id, assetIds),
            eq(schema.mediaAssets.organizationId, user.organizationId),
          ),
        );
      for (const asset of assetRows) {
        if (asset.kind === "video" && asset.durationMs) videoDurations.set(asset.id, asset.durationMs);
      }
    }

    const nestedIds = [
      ...new Set(
        data.items.flatMap((item) => (item.nestedPlaylistId ? [item.nestedPlaylistId] : [])),
      ),
    ];
    if (nestedIds.includes(data.playlistId))
      throw new Error("Uma lista não pode incluir a si mesma.");
    if (nestedIds.length > 0) {
      const nested = await db
        .select({ id: schema.playlists.id })
        .from(schema.playlists)
        .where(
          and(
            inArray(schema.playlists.id, nestedIds),
            eq(schema.playlists.organizationId, user.organizationId),
          ),
        );
      if (nested.length !== nestedIds.length) throw new Error("Sublista inválida.");
      const edges = await db
        .select({
          playlistId: schema.playlistItems.playlistId,
          nestedPlaylistId: schema.playlistItems.nestedPlaylistId,
        })
        .from(schema.playlistItems);
      const graph = new Map<string, string[]>();
      for (const edge of edges) {
        if (edge.nestedPlaylistId)
          graph.set(edge.playlistId, [
            ...(graph.get(edge.playlistId) ?? []),
            edge.nestedPlaylistId,
          ]);
      }
      const reachesCurrent = (id: string, seen = new Set<string>()): boolean => {
        if (id === data.playlistId) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return (graph.get(id) ?? []).some((next) => reachesCurrent(next, seen));
      };
      if (nestedIds.some((id) => reachesCurrent(id)))
        throw new Error("Esta sublista criaria um ciclo entre listas.");
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.playlistItems)
        .where(eq(schema.playlistItems.playlistId, data.playlistId));
      if (data.items.length > 0) {
        await tx.insert(schema.playlistItems).values(
          data.items.map((item, index) => ({
            playlistId: data.playlistId,
            mediaAssetId: item.mediaAssetId,
            nestedPlaylistId: item.nestedPlaylistId,
            scheduleRules: item.scheduleRules,
            position: index,
            durationMs: item.mediaAssetId && videoDurations.has(item.mediaAssetId)
              ? videoDurations.get(item.mediaAssetId)!
              : item.durationMs,
            isMuted: item.isMuted,
          })),
        );
      }
      // Bumping the revision is how paired players learn they must re-sync.
      const { sql } = await import("drizzle-orm");
      await tx
        .update(schema.playlists)
        .set({ revision: sql`${schema.playlists.revision} + 1`, updatedAt: new Date() })
        .where(eq(schema.playlists.id, data.playlistId));
    });

    // Broadcast: every TV of this customer re-syncs within ~1 second.
    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { ok: true };
  });
