import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { CURRENCY_IDS, NEWS_FEED_IDS } from "@/lib/widgets/catalog";
import { LOTTERY_GAME_IDS } from "@/lib/widgets/lottery";
import {
  mergePlatformWidgetConfig,
  platformWidgetDuration,
  readPlatformWidgetSettings,
} from "@/lib/widgets/platform-widgets.server";

const preferenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("currency"),
    assetId: z.string().uuid(),
    pairs: z
      .array(z.enum(CURRENCY_IDS as [string, ...string[]]))
      .min(1)
      .max(5),
  }),
  z.object({
    type: z.literal("news"),
    assetId: z.string().uuid(),
    feedId: z.enum(NEWS_FEED_IDS as [string, ...string[]]),
  }),
  z.object({
    type: z.literal("lottery"),
    assetId: z.string().uuid(),
    gameIds: z
      .array(z.enum(LOTTERY_GAME_IDS as [string, ...string[]]))
      .min(1)
      .max(11),
  }),
]);

export const fetchPlatformWidgetAvailability = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireUser } = await import("@/lib/auth/session.server");
    await requireUser();
    const settings = await readPlatformWidgetSettings();
    return {
      currencyPairs:
        settings.currency.config.type === "currency" ? settings.currency.config.pairs : [],
      newsFeedIds: settings.news.availableNewsFeedIds,
      lotteryGameIds:
        settings.lottery.config.type === "lottery" ? settings.lottery.config.gameIds : [],
    };
  },
);

export const savePlatformWidgetPreferences = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => preferenceSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { getDb, schema } = await import("@/lib/db/index.server");
    const user = await requireUser();
    const db = getDb();
    const [asset] = await db
      .select({ id: schema.mediaAssets.id, widgetType: schema.mediaAssets.widgetType })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
          eq(schema.mediaAssets.kind, "widget"),
        ),
      )
      .limit(1);
    if (!asset || asset.widgetType !== data.type) throw new Error("Widget não encontrado.");

    const settings = await readPlatformWidgetSettings();
    const desired = settings[data.type];
    if (!desired.active) throw new Error("Este widget não está disponível no momento.");

    let requested;
    if (data.type === "currency" && desired.config.type === "currency") {
      const pairs = data.pairs.filter(
        (pair) => desired.config.type === "currency" && desired.config.pairs.includes(pair),
      );
      if (!pairs.length) throw new Error("Selecione ao menos uma cotação disponível.");
      requested = { ...desired.config, pairs };
    } else if (data.type === "lottery" && desired.config.type === "lottery") {
      const gameIds = data.gameIds.filter(
        (gameId) => desired.config.type === "lottery" && desired.config.gameIds.includes(gameId),
      );
      if (!gameIds.length) throw new Error("Selecione ao menos uma modalidade disponível.");
      requested = { ...desired.config, gameIds };
    } else if (data.type === "news" && desired.config.type === "news") {
      if (!settings.news.availableNewsFeedIds.includes(data.feedId)) {
        throw new Error("Esta fonte de notícias não está disponível.");
      }
      requested = { ...desired.config, feedId: data.feedId };
    } else {
      throw new Error("Configuração de widget inválida.");
    }

    const config = mergePlatformWidgetConfig(data.type, desired, requested);
    const durationMs = platformWidgetDuration(config);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.mediaAssets)
        .set({ widgetConfig: config, ...(durationMs ? { durationMs } : {}) })
        .where(eq(schema.mediaAssets.id, asset.id));
      if (durationMs) {
        await tx
          .update(schema.playlistItems)
          .set({ durationMs })
          .where(eq(schema.playlistItems.mediaAssetId, asset.id));
      }
      const rows = await tx
        .selectDistinct({ playlistId: schema.playlistItems.playlistId })
        .from(schema.playlistItems)
        .where(eq(schema.playlistItems.mediaAssetId, asset.id));
      const playlistIds = rows.map((row) => row.playlistId);
      if (playlistIds.length) {
        await tx
          .update(schema.playlists)
          .set({ revision: sql`${schema.playlists.revision} + 1`, updatedAt: new Date() })
          .where(inArray(schema.playlists.id, playlistIds));
      }
    });

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);
    return { ok: true };
  });
