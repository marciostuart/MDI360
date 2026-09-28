import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/admin-auth.server";
import { getDb, schema } from "@/lib/db/index.server";
import { NEWS_FEED_IDS, widgetConfigSchema } from "@/lib/widgets/catalog";
import {
  PLATFORM_WIDGET_SETTINGS_KEY,
  PLATFORM_WIDGET_TAG,
  PLATFORM_WIDGET_TYPES,
  isPlatformWidgetType,
  mergePlatformWidgetConfig,
  platformWidgetDuration,
  readPlatformWidgetSettings,
  type PlatformWidgetSettings,
  type PlatformWidgetType,
} from "@/lib/widgets/platform-widgets.server";

const savePlatformWidgetSchema = z.object({
  type: z.enum(PLATFORM_WIDGET_TYPES),
  active: z.boolean(),
  name: z.string().trim().min(1).max(160),
  config: widgetConfigSchema,
  availableNewsFeedIds: z
    .array(z.enum(NEWS_FEED_IDS as [string, ...string[]]))
    .min(1)
    .max(NEWS_FEED_IDS.length)
    .optional(),
});

export const fetchPlatformWidgetsAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await requirePlatformAdmin();
  return readPlatformWidgetSettings();
});

export const savePlatformWidgetAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => savePlatformWidgetSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePlatformAdmin();
    if (data.config.type !== data.type || !isPlatformWidgetType(data.config.type)) {
      throw new Error("O tipo da configuração não corresponde ao widget selecionado.");
    }

    const db = getDb();
    const current = await readPlatformWidgetSettings();
    const updatedEntry =
      data.type === "news"
        ? {
            active: data.active,
            name: data.name,
            config: data.config,
            availableNewsFeedIds: data.availableNewsFeedIds ?? current.news.availableNewsFeedIds,
          }
        : { active: data.active, name: data.name, config: data.config };
    const next = {
      ...current,
      [data.type]: updatedEntry,
    } as PlatformWidgetSettings;

    const assets = await db
      .select({
        id: schema.mediaAssets.id,
        organizationId: schema.mediaAssets.organizationId,
        tags: schema.mediaAssets.tags,
        widgetConfig: schema.mediaAssets.widgetConfig,
      })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.widgetType, data.type));

    const organizationIds = [...new Set(assets.map((asset) => asset.organizationId))];
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.platformSettings)
        .values({ key: PLATFORM_WIDGET_SETTINGS_KEY, value: next, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.platformSettings.key,
          set: { value: next, updatedAt: new Date() },
        });

      for (const asset of assets) {
        const mergedConfig = mergePlatformWidgetConfig(
          data.type,
          next[data.type],
          asset.widgetConfig,
        );
        const durationMs = platformWidgetDuration(mergedConfig);
        await tx
          .update(schema.mediaAssets)
          .set({
            name: data.name,
            widgetConfig: mergedConfig,
            durationMs,
            tags: Array.from(new Set([...(asset.tags ?? []), PLATFORM_WIDGET_TAG])),
          })
          .where(eq(schema.mediaAssets.id, asset.id));
        if (durationMs) {
          await tx
            .update(schema.playlistItems)
            .set({ durationMs })
            .where(eq(schema.playlistItems.mediaAssetId, asset.id));
        }
      }

      if (assets.length) {
        const playlistRows = await tx
          .selectDistinct({ playlistId: schema.playlistItems.playlistId })
          .from(schema.playlistItems)
          .where(
            inArray(
              schema.playlistItems.mediaAssetId,
              assets.map((asset) => asset.id),
            ),
          );
        const playlistIds = playlistRows.map((row) => row.playlistId);
        if (playlistIds.length)
          await tx
            .update(schema.playlists)
            .set({ revision: sql`${schema.playlists.revision} + 1`, updatedAt: new Date() })
            .where(inArray(schema.playlists.id, playlistIds));
      }
    });

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    for (const organizationId of organizationIds) notifyOrganization(organizationId);
    return next[data.type as PlatformWidgetType];
  });
