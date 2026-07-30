import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  CURRENCY_IDS,
  NEWS_FEED_IDS,
  WEATHER_CITY_IDS,
  getNewsFeed,
  getWeatherCity,
} from "@/lib/widgets/catalog";

/**
 * Read-only proxy the TVs use to fetch open data (weather, quotes, headlines).
 * Every upstream URL comes from a closed allow-list in the catalog, so a client
 * can never point this endpoint at an arbitrary host. No PII is involved and no
 * writes happen here.
 */
const querySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("weather"), cityId: z.enum(WEATHER_CITY_IDS as [string, ...string[]]) }),
  z.object({ type: z.literal("currency"), pairs: z.string().trim().max(60) }),
  z.object({ type: z.literal("news"), feedId: z.enum(NEWS_FEED_IDS as [string, ...string[]]) }),
]);

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseRssTitles(xml: string, limit: number) {
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  const titles: string[] = [];
  for (const block of blocks) {
    const match = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) continue;
    const title = decodeEntities(match[1] ?? "");
    if (title) titles.push(title);
    if (titles.length >= limit) break;
  }
  return titles;
}

export const Route = createFileRoute("/api/public/widget-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: "Parâmetros inválidos." }, { status: 400 });
        }

        const cacheHeaders = { "cache-control": "public, max-age=120" };

        try {
          if (parsed.data.type === "weather") {
            const city = getWeatherCity(parsed.data.cityId);
            const endpoint =
              `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}` +
              `&longitude=${city.longitude}&current=temperature_2m,relative_humidity_2m,weather_code` +
              `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3` +
              `&timezone=America%2FSao_Paulo`;
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error("weather");
            const payload = (await response.json()) as {
              current?: { temperature_2m?: number; relative_humidity_2m?: number; weather_code?: number };
              daily?: {
                time?: string[];
                weather_code?: number[];
                temperature_2m_max?: number[];
                temperature_2m_min?: number[];
              };
            };
            return Response.json(
              {
                city: city.label,
                credit: "Open-Meteo · CC BY 4.0",
                current: {
                  temperature: payload.current?.temperature_2m ?? null,
                  humidity: payload.current?.relative_humidity_2m ?? null,
                  code: payload.current?.weather_code ?? null,
                },
                daily: (payload.daily?.time ?? []).map((date, index) => ({
                  date,
                  code: payload.daily?.weather_code?.[index] ?? null,
                  max: payload.daily?.temperature_2m_max?.[index] ?? null,
                  min: payload.daily?.temperature_2m_min?.[index] ?? null,
                })),
              },
              { headers: cacheHeaders },
            );
          }

          if (parsed.data.type === "currency") {
            const pairs = parsed.data.pairs
              .split(",")
              .map((pair) => pair.trim())
              .filter((pair) => CURRENCY_IDS.includes(pair))
              .slice(0, 5);
            if (pairs.length === 0) {
              return Response.json({ error: "Nenhuma moeda válida." }, { status: 400 });
            }
            const response = await fetch(
              `https://economia.awesomeapi.com.br/json/last/${pairs.join(",")}`,
            );
            if (!response.ok) throw new Error("currency");
            const payload = (await response.json()) as Record<
              string,
              { code?: string; codein?: string; name?: string; bid?: string; pctChange?: string }
            >;
            return Response.json(
              {
                credit: "AwesomeAPI",
                quotes: Object.values(payload).map((quote) => ({
                  code: quote.code ?? "",
                  name: (quote.name ?? "").split("/")[0] ?? "",
                  value: Number(quote.bid ?? 0),
                  changePct: Number(quote.pctChange ?? 0),
                })),
              },
              { headers: cacheHeaders },
            );
          }

          const feed = getNewsFeed(parsed.data.feedId);
          const response = await fetch(feed.url, {
            headers: { "user-agent": "MDI360-Player/1.0" },
          });
          if (!response.ok) throw new Error("news");
          const xml = await response.text();
          return Response.json(
            { source: feed.label, credit: feed.credit, headlines: parseRssTitles(xml, 10) },
            { headers: cacheHeaders },
          );
        } catch {
          return Response.json({ error: "Fonte indisponível no momento." }, { status: 502 });
        }
      },
    },
  },
});