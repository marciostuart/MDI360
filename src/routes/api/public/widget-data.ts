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

type NewsItem = { title: string; summary: string; image: string | null; publishedAt: string | null };

/** Pulls title, summary and (when present) the item image out of an RSS feed. */
function parseRssItems(xml: string, limit: number): NewsItem[] {
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  const items: NewsItem[] = [];
  for (const block of blocks) {
    const title = decodeEntities(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    if (!title) continue;
    const summary = decodeEntities(
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "",
    ).slice(0, 320);
    const image =
      block.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ??
      block.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] ??
      block.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1] ??
      block.match(/<img[^>]+src=(?:"|&quot;)([^"&]+)/i)?.[1] ??
      null;
    const publishedAt = decodeEntities(
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "",
    );
    items.push({
      title,
      summary,
      image: image && image.startsWith("https://") ? image : null,
      publishedAt: publishedAt || null,
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Fallback quotes when AwesomeAPI is rate limited: open FX rates + Coinbase. */
async function fallbackQuotes(pairs: string[]) {
  const fiat = pairs.filter((pair) => pair !== "BTC-BRL");
  const quotes: { code: string; name: string; value: number; changePct: number }[] = [];

  if (fiat.length > 0) {
    const response = await fetch("https://open.er-api.com/v6/latest/BRL");
    if (!response.ok) throw new Error("fx");
    const payload = (await response.json()) as { rates?: Record<string, number> };
    const labels: Record<string, string> = {
      "USD-BRL": "Dólar",
      "EUR-BRL": "Euro",
      "GBP-BRL": "Libra",
      "ARS-BRL": "Peso argentino",
    };
    for (const pair of fiat) {
      const code = pair.split("-")[0]!;
      const rate = payload.rates?.[code];
      if (!rate) continue;
      quotes.push({ code, name: labels[pair] ?? code, value: 1 / rate, changePct: 0 });
    }
  }

  if (pairs.includes("BTC-BRL")) {
    const response = await fetch("https://api.coinbase.com/v2/prices/BTC-BRL/spot");
    if (response.ok) {
      const payload = (await response.json()) as { data?: { amount?: string } };
      const value = Number(payload.data?.amount ?? 0);
      if (value > 0) quotes.push({ code: "BTC", name: "Bitcoin", value, changePct: 0 });
    }
  }

  if (quotes.length === 0) throw new Error("quotes");
  return quotes;
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
              .filter((pair) => (CURRENCY_IDS as readonly string[]).includes(pair))
              .slice(0, 5);
            if (pairs.length === 0) {
              return Response.json({ error: "Nenhuma moeda válida." }, { status: 400 });
            }
            const response = await fetch(
              `https://economia.awesomeapi.com.br/json/last/${pairs.join(",")}`,
            );
            if (response.ok) {
              const payload = (await response.json()) as Record<
                string,
                { code?: string; name?: string; bid?: string; pctChange?: string }
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
            // Provider quota reached: keep the screen useful with open sources.
            return Response.json(
              { credit: "ExchangeRate-API · Coinbase", quotes: await fallbackQuotes(pairs) },
              { headers: cacheHeaders },
            );
          }

          const feed = getNewsFeed(parsed.data.feedId);
          const response = await fetch(feed.url, {
            headers: { "user-agent": "MDI360-Player/1.0" },
          });
          if (!response.ok) throw new Error("news");
          const xml = await response.text();
          const items = parseRssItems(xml, 10);
          return Response.json(
            {
              source: feed.label,
              credit: feed.credit,
              items,
              // Kept for the Roku channel, which reads plain headlines.
              headlines: items.map((item) => item.title),
            },
            { headers: cacheHeaders },
          );
        } catch {
          return Response.json({ error: "Fonte indisponível no momento." }, { status: 502 });
        }
      },
    },
  },
});