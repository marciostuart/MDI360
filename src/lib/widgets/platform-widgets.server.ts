import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/lib/db/index.server";
import {
  NEWS_FEED_IDS,
  getWidgetDefinition,
  widgetConfigSchema,
  type WidgetConfig,
} from "@/lib/widgets/catalog";
import { lotteryDurationMs } from "@/lib/widgets/lottery";
import {
  PLATFORM_WIDGET_SETTINGS_KEY,
  PLATFORM_WIDGET_TAG,
  PLATFORM_WIDGET_TYPES,
} from "@/lib/widgets/platform-widgets";

export {
  PLATFORM_WIDGET_SETTINGS_KEY,
  PLATFORM_WIDGET_TAG,
  PLATFORM_WIDGET_TYPES,
  isPlatformWidgetType,
  type PlatformWidgetType,
} from "@/lib/widgets/platform-widgets";

const platformWidgetEntrySchema = z.object({
  active: z.boolean(),
  name: z.string().trim().min(1).max(160),
  config: widgetConfigSchema,
});

const platformNewsWidgetEntrySchema = platformWidgetEntrySchema.extend({
  availableNewsFeedIds: z
    .array(z.enum(NEWS_FEED_IDS as [string, ...string[]]))
    .min(1)
    .max(NEWS_FEED_IDS.length)
    .default([...NEWS_FEED_IDS]),
});

export const platformWidgetSettingsSchema = z.object({
  currency: platformWidgetEntrySchema.refine((entry) => entry.config.type === "currency"),
  news: platformNewsWidgetEntrySchema.refine((entry) => entry.config.type === "news"),
  lottery: platformWidgetEntrySchema.refine((entry) => entry.config.type === "lottery"),
});

export type PlatformWidgetSettings = z.infer<typeof platformWidgetSettingsSchema>;

export function defaultPlatformWidgetSettings(): PlatformWidgetSettings {
  return {
    currency: {
      active: true,
      name: getWidgetDefinition("currency").label,
      config: getWidgetDefinition("currency").defaultConfig,
    },
    news: {
      active: true,
      name: getWidgetDefinition("news").label,
      config: getWidgetDefinition("news").defaultConfig,
      availableNewsFeedIds: [...NEWS_FEED_IDS],
    },
    lottery: {
      active: true,
      name: getWidgetDefinition("lottery").label,
      config: getWidgetDefinition("lottery").defaultConfig,
    },
  };
}

export function platformWidgetDuration(config: WidgetConfig): number | null {
  if (config.type === "lottery") return lotteryDurationMs(config);
  if (config.type === "news" && config.oneAtATime) {
    return config.headlines * config.rotateSeconds * 1000;
  }
  return null;
}

export function mergePlatformWidgetConfig(
  type: (typeof PLATFORM_WIDGET_TYPES)[number],
  desired: PlatformWidgetSettings[(typeof PLATFORM_WIDGET_TYPES)[number]],
  current: unknown,
): WidgetConfig {
  const local = widgetConfigSchema.safeParse(current);
  if (type === "currency" && desired.config.type === "currency") {
    const selected =
      local.success && local.data.type === "currency"
        ? local.data.pairs.filter(
            (pair) => desired.config.type === "currency" && desired.config.pairs.includes(pair),
          )
        : [];
    return { ...desired.config, pairs: selected.length ? selected : desired.config.pairs };
  }
  if (type === "lottery" && desired.config.type === "lottery") {
    const selected =
      local.success && local.data.type === "lottery"
        ? local.data.gameIds.filter(
            (gameId) =>
              desired.config.type === "lottery" && desired.config.gameIds.includes(gameId),
          )
        : [];
    return { ...desired.config, gameIds: selected.length ? selected : desired.config.gameIds };
  }
  if (type === "news" && desired.config.type === "news") {
    const available =
      "availableNewsFeedIds" in desired ? desired.availableNewsFeedIds : [...NEWS_FEED_IDS];
    const feedId =
      local.success && local.data.type === "news" && available.includes(local.data.feedId)
        ? local.data.feedId
        : desired.config.feedId;
    return { ...desired.config, feedId };
  }
  return desired.config;
}

export async function readPlatformWidgetSettings(): Promise<PlatformWidgetSettings> {
  const [row] = await getDb()
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, PLATFORM_WIDGET_SETTINGS_KEY))
    .limit(1);
  const parsed = platformWidgetSettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : defaultPlatformWidgetSettings();
}

/**
 * Materializes the active global widgets inside an organization so the current
 * playlist/media foreign keys remain tenant-scoped. Existing widgets of these
 * types are adopted instead of deleted, preserving every playlist reference.
 */
export async function synchronizePlatformWidgetsForOrganization(organizationId: string) {
  const db = getDb();
  const settings = await readPlatformWidgetSettings();
  const existing = await db
    .select({
      id: schema.mediaAssets.id,
      name: schema.mediaAssets.name,
      widgetType: schema.mediaAssets.widgetType,
      widgetConfig: schema.mediaAssets.widgetConfig,
      durationMs: schema.mediaAssets.durationMs,
      tags: schema.mediaAssets.tags,
    })
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.organizationId, organizationId),
        eq(schema.mediaAssets.kind, "widget"),
        inArray(schema.mediaAssets.widgetType, [...PLATFORM_WIDGET_TYPES]),
      ),
    );

  for (const type of PLATFORM_WIDGET_TYPES) {
    const desired = settings[type];
    const rows = existing.filter((row) => row.widgetType === type);
    if (desired.active && rows.length === 0) {
      await db.insert(schema.mediaAssets).values({
        organizationId,
        name: desired.name,
        kind: "widget",
        status: "ready",
        widgetType: type,
        widgetConfig: desired.config,
        durationMs: platformWidgetDuration(desired.config),
        tags: [PLATFORM_WIDGET_TAG],
      });
      continue;
    }

    for (const row of rows) {
      const mergedConfig = mergePlatformWidgetConfig(type, desired, row.widgetConfig);
      const durationMs = platformWidgetDuration(mergedConfig);
      const tags = Array.from(new Set([...(row.tags ?? []), PLATFORM_WIDGET_TAG]));
      const changed =
        row.name !== desired.name ||
        JSON.stringify(row.widgetConfig) !== JSON.stringify(mergedConfig) ||
        row.durationMs !== durationMs ||
        !(row.tags ?? []).includes(PLATFORM_WIDGET_TAG);
      if (!changed) continue;
      await db.transaction(async (tx) => {
        await tx
          .update(schema.mediaAssets)
          .set({
            name: desired.name,
            widgetConfig: mergedConfig,
            durationMs,
            tags,
          })
          .where(eq(schema.mediaAssets.id, row.id));
        if (durationMs) {
          const affected = await tx
            .update(schema.playlistItems)
            .set({ durationMs })
            .where(eq(schema.playlistItems.mediaAssetId, row.id))
            .returning({ playlistId: schema.playlistItems.playlistId });
          const playlistIds = [...new Set(affected.map((item) => item.playlistId))];
          if (playlistIds.length) {
            await tx
              .update(schema.playlists)
              .set({ revision: sql`${schema.playlists.revision} + 1`, updatedAt: new Date() })
              .where(inArray(schema.playlists.id, playlistIds));
          }
        } else {
          const affected = await tx
            .selectDistinct({ playlistId: schema.playlistItems.playlistId })
            .from(schema.playlistItems)
            .where(eq(schema.playlistItems.mediaAssetId, row.id));
          const playlistIds = affected.map((item) => item.playlistId);
          if (playlistIds.length) {
            await tx
              .update(schema.playlists)
              .set({ revision: sql`${schema.playlists.revision} + 1`, updatedAt: new Date() })
              .where(inArray(schema.playlists.id, playlistIds));
          }
        }
      });
    }
  }
  return settings;
}
