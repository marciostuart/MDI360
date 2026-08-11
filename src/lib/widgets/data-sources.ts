import { z } from "zod";

import { NEWS_FEEDS, NEWS_FEED_IDS } from "./catalog";

export type NewsFeedId = (typeof NEWS_FEED_IDS)[number];

export const newsSourceSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(120),
  url: z
    .string()
    .url()
    .max(1000)
    .refine((value) => value.startsWith("https://"), "Use HTTPS."),
  credit: z.string().trim().min(1).max(160),
});

export const dataSourcesInputSchema = z.object({
  lotteryRelay: z.object({
    enabled: z.boolean(),
    url: z
      .string()
      .trim()
      .max(1000)
      .refine((value) => !value || value.startsWith("https://"), "Use HTTPS."),
    token: z.string().max(500).optional().default(""),
    clearToken: z.boolean().optional().default(false),
  }),
  news: z.record(z.string(), newsSourceSchema),
});

export type DataSourcesInput = z.infer<typeof dataSourcesInputSchema>;

export const DEFAULT_NEWS_SOURCES = Object.fromEntries(
  NEWS_FEEDS.map((feed) => [feed.id, { enabled: true, ...feed }]),
) as Record<
  NewsFeedId,
  { enabled: boolean; id: NewsFeedId; label: string; url: string; credit: string }
>;

export function isSafeNewsUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || hostname === "localhost" || hostname.endsWith(".local")) {
      return false;
    }
    if (/^(127|10|0)\./.test(hostname) || /^192\.168\./.test(hostname)) return false;
    const private172 = hostname.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}
