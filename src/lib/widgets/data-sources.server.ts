import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { DEFAULT_NEWS_SOURCES, isSafeNewsUrl } from "./data-sources";
import { getNewsFeed } from "./catalog";

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

export async function getConfiguredNewsFeed(id: string) {
  const fallback = getNewsFeed(id);
  const root = await readRawDataSources();
  const news = root.news;
  const saved =
    news && typeof news === "object" && !Array.isArray(news)
      ? (news as Record<string, unknown>)[id]
      : null;
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    return { enabled: true, ...fallback };
  const source = saved as Record<string, unknown>;
  const url = String(source.url ?? fallback.url).trim();
  return {
    id: fallback.id,
    enabled: source.enabled !== false,
    label: String(source.label ?? fallback.label).trim() || fallback.label,
    url: isSafeNewsUrl(url) ? url : fallback.url,
    credit: String(source.credit ?? fallback.credit).trim() || fallback.credit,
  };
}

export async function getPublicNewsSources() {
  return Promise.all(Object.keys(DEFAULT_NEWS_SOURCES).map((id) => getConfiguredNewsFeed(id)));
}
