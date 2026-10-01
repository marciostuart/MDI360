import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  CURRENCY_IDS,
  NEWS_FEED_IDS,
  lotteryGameLayoutsSchema,
  widgetConfigSchema,
  widgetLayoutSchema,
  widgetThemeSchema,
} from "@/lib/widgets/catalog";
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
    layout: widgetLayoutSchema.optional(),
    theme: widgetThemeSchema.optional(),
  }),
  z.object({
    type: z.literal("news"),
    assetId: z.string().uuid(),
    feedId: z.string().trim().min(1).max(160),
    headlines: z.number().int().min(1).max(10).default(5),
    oneAtATime: z.boolean().default(true),
    rotateSeconds: z.number().int().min(3).max(30).default(7),
    showSummary: z.boolean().default(true),
    summaryMaxChars: z.number().int().min(60).max(600).default(240),
    showImage: z.boolean().default(true),
    imageMode: z.enum(["background", "block", "hidden"]).default("background"),
    layout: widgetLayoutSchema.optional(),
  }),
  z.object({
    type: z.literal("lottery"),
    assetId: z.string().uuid(),
    gameIds: z
      .array(z.enum(LOTTERY_GAME_IDS as [string, ...string[]]))
      .min(1)
      .max(11),
    rotateSeconds: z.number().int().min(5).max(30).default(10),
    federalStyle: z.enum(["list", "receipt"]).default("list"),
    gameLayouts: lotteryGameLayoutsSchema.optional(),
    layout: widgetLayoutSchema.optional(),
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
      .select({
        id: schema.mediaAssets.id,
        widgetType: schema.mediaAssets.widgetType,
        widgetConfig: schema.mediaAssets.widgetConfig,
      })
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
      const currentConfig = widgetConfigSchema.safeParse(asset.widgetConfig);
      const base =
        currentConfig.success && currentConfig.data.type === "currency"
          ? currentConfig.data
          : desired.config;
      requested = {
        ...desired.config,
        ...base,
        pairs,
        ...(data.layout ? { layout: data.layout } : {}),
        ...(data.theme ? { theme: data.theme } : {}),
      };
    } else if (data.type === "lottery" && desired.config.type === "lottery") {
      const gameIds = data.gameIds.filter(
        (gameId) => desired.config.type === "lottery" && desired.config.gameIds.includes(gameId),
      );
      if (!gameIds.length) throw new Error("Selecione ao menos uma modalidade disponível.");
      const currentConfig = widgetConfigSchema.safeParse(asset.widgetConfig);
      const base =
        currentConfig.success && currentConfig.data.type === "lottery"
          ? currentConfig.data
          : desired.config;
      requested = {
        ...desired.config,
        ...base,
        gameIds,
        rotateSeconds: data.rotateSeconds,
        federalStyle: data.federalStyle,
        ...(data.gameLayouts ? { gameLayouts: data.gameLayouts } : {}),
        ...(data.layout ? { layout: data.layout } : {}),
      };
    } else if (data.type === "news" && desired.config.type === "news") {
      const isBuiltIn = NEWS_FEED_IDS.includes(data.feedId as (typeof NEWS_FEED_IDS)[number]);
      if (!isBuiltIn) {
        const { readOrganizationNewsSources } =
          await import("@/lib/widgets/organization-news-sources.functions");
        const customSources = await readOrganizationNewsSources(user.organizationId);
        if (!customSources.some((source) => source.id === data.feedId && source.enabled)) {
          throw new Error("Esta fonte de notícias não está disponível.");
        }
      } else if (
        !settings.news.availableNewsFeedIds.includes(data.feedId as (typeof NEWS_FEED_IDS)[number])
      ) {
        throw new Error("Esta fonte de notícias não está disponível.");
      }
      const currentConfig = widgetConfigSchema.safeParse(asset.widgetConfig);
      const base =
        currentConfig.success && currentConfig.data.type === "news"
          ? currentConfig.data
          : desired.config;
      requested = {
        ...desired.config,
        ...base,
        feedId: data.feedId,
        headlines: data.headlines,
        oneAtATime: data.oneAtATime,
        rotateSeconds: data.rotateSeconds,
        showSummary: data.showSummary,
        summaryMaxChars: data.summaryMaxChars,
        showImage: data.showImage,
        imageMode: data.imageMode,
        ...(data.layout ? { layout: data.layout } : {}),
      };
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
