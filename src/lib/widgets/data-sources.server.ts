import { and, asc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import {
  DEFAULT_NEWS_SOURCES,
  defaultWeatherVideoSettings,
  isSafeNewsUrl,
  newsSourceSchema,
  weatherVideoSettingsSchema,
  type WeatherVideoSettings,
} from "./data-sources";
import { NEWS_FEED_IDS, getNewsFeed } from "./catalog";

export async function readRawDataSources() {
  const [row] = await getDb()
    .select({ value: schema.platformSettings.value })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, "data-sources"))
    .limit(1);
  return row?.value && typeof row.value === "object" && !Array.isArray(row.value)
    ? (row.value as Record<string, unknown>)
    : {};
}

export async function getWeatherInteractiveVideos(): Promise<WeatherVideoSettings> {
  const root = await readRawDataSources();
  const parsed = weatherVideoSettingsSchema.safeParse(root.weatherVideos);
  return parsed.success ? parsed.data : defaultWeatherVideoSettings();
}

export async function getConfiguredNewsFeed(id: string, organizationId?: string) {
  const isBuiltIn = NEWS_FEED_IDS.includes(id as (typeof NEWS_FEED_IDS)[number]);
  if (organizationId) {
    try {
      const [custom] = await getDb()
        .select({
          id: schema.organizationNewsSources.id,
          label: schema.organizationNewsSources.label,
          url: schema.organizationNewsSources.url,
          credit: schema.organizationNewsSources.credit,
          enabled: schema.organizationNewsSources.enabled,
          refreshMinutes: schema.organizationNewsSources.refreshMinutes,
        })
        .from(schema.organizationNewsSources)
        .where(
          and(
            eq(schema.organizationNewsSources.id, id),
            eq(schema.organizationNewsSources.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (custom) return custom;
    } catch (error) {
      console.error("[widget-news] custom source lookup failed", {
        organizationId,
        feedId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!isBuiltIn) throw error;
    }
  }

  const root = await readRawDataSources();
  const news = root.news;
  const saved =
    news && typeof news === "object" && !Array.isArray(news)
      ? (news as Record<string, unknown>)[id]
      : null;

  if (!isBuiltIn) {
    const parsed = newsSourceSchema.safeParse(saved);
    if (!parsed.success || !isSafeNewsUrl(parsed.data.url)) {
      throw new Error("Fonte de notícias não encontrada.");
    }
    return { id, ...parsed.data };
  }

  const fallback = getNewsFeed(id);
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    return { enabled: true, refreshMinutes: 30, ...fallback };
  const source = saved as Record<string, unknown>;
  const url = String(source.url ?? fallback.url).trim();
  return {
    id: fallback.id,
    enabled: source.enabled !== false,
    refreshMinutes: Math.min(1440, Math.max(5, Number(source.refreshMinutes ?? 30) || 30)),
    label: String(source.label ?? fallback.label).trim() || fallback.label,
    url: isSafeNewsUrl(url) ? url : fallback.url,
    credit: String(source.credit ?? fallback.credit).trim() || fallback.credit,
  };
}

export async function getPublicNewsSources(organizationId?: string) {
  const builtIn = await Promise.all(
    Object.keys(DEFAULT_NEWS_SOURCES).map((id) => getConfiguredNewsFeed(id, organizationId)),
  );
  const root = await readRawDataSources();
  const configuredNews =
    root.news && typeof root.news === "object" && !Array.isArray(root.news)
      ? (root.news as Record<string, unknown>)
      : {};
  const globalCustom = await Promise.all(
    Object.keys(configuredNews)
      .filter((id) => !Object.prototype.hasOwnProperty.call(DEFAULT_NEWS_SOURCES, id))
      .map((id) => getConfiguredNewsFeed(id, organizationId).catch(() => null)),
  );
  const available = [...builtIn, ...globalCustom.filter((source): source is NonNullable<typeof source> => source !== null)];
  if (!organizationId) return available;

  try {
    const custom = await getDb()
      .select({
        id: schema.organizationNewsSources.id,
        label: schema.organizationNewsSources.label,
        url: schema.organizationNewsSources.url,
        credit: schema.organizationNewsSources.credit,
        enabled: schema.organizationNewsSources.enabled,
        refreshMinutes: schema.organizationNewsSources.refreshMinutes,
      })
      .from(schema.organizationNewsSources)
      .where(eq(schema.organizationNewsSources.organizationId, organizationId))
      .orderBy(asc(schema.organizationNewsSources.createdAt));
    return [...available, ...custom];
  } catch (error) {
    console.error("[widget-news] custom source list failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return builtIn;
  }
}
