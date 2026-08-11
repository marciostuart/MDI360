import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  CURRENCY_IDS,
  NEWS_FEED_IDS,
  WEATHER_CITY_IDS,
  getWeatherCity,
} from "@/lib/widgets/catalog";
import { LOTTERY_GAME_IDS, lotteryGameIdSchema } from "@/lib/widgets/lottery";

/**
 * Read-only proxy the TVs use to fetch open data (weather, quotes, headlines).
 * Every upstream URL comes from a closed allow-list in the catalog, so a client
 * can never point this endpoint at an arbitrary host. No PII is involved and no
 * writes happen here.
 */
const querySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("weather"),
    cityId: z.enum(WEATHER_CITY_IDS as [string, ...string[]]),
    /** Coordenadas opcionais (cidade encontrada por CEP). */
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    label: z.string().trim().max(80).optional(),
  }),
  z.object({
    type: z.literal("cep"),
    cep: z
      .string()
      .trim()
      .regex(/^\d{5}-?\d{3}$/),
  }),
  z.object({ type: z.literal("currency"), pairs: z.string().trim().max(60) }),
  z.object({ type: z.literal("news"), feedId: z.enum(NEWS_FEED_IDS as [string, ...string[]]) }),
  z.object({ type: z.literal("lottery"), games: z.string().trim().max(180) }),
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

type NewsItem = {
  title: string;
  summary: string;
  image: string | null;
  publishedAt: string | null;
};

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
          if (parsed.data.type === "lottery") {
            const gameIds = parsed.data.games
              .split(",")
              .map((game) => game.trim())
              .filter(Boolean)
              .flatMap((game) => {
                const valid = lotteryGameIdSchema.safeParse(game);
                return valid.success ? [valid.data] : [];
              });
            const uniqueGameIds = [...new Set(gameIds)].slice(0, LOTTERY_GAME_IDS.length);
            if (uniqueGameIds.length === 0) {
              return Response.json({ error: "Nenhuma modalidade válida." }, { status: 400 });
            }
            const { readLotteryResults, syncOfficialLotteryResults } =
              await import("@/lib/widgets/lottery-sync.server");
            let payload = await readLotteryResults(uniqueGameIds);
            if (payload.results.length === 0) {
              await syncOfficialLotteryResults();
              payload = await readLotteryResults(uniqueGameIds);
            } else {
              void syncOfficialLotteryResults().catch((error) =>
                console.error("[lottery-sync] falha na revalidação", error),
              );
            }
            return Response.json(payload, {
              status: payload.results.length > 0 ? 200 : 503,
              headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
            });
          }

          if (parsed.data.type === "cep") {
            const cep = parsed.data.cep.replace(/\D/g, "");
            const viaCep = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!viaCep.ok) throw new Error("cep");
            const address = (await viaCep.json()) as {
              erro?: boolean | string;
              localidade?: string;
              uf?: string;
            };
            if (address.erro || !address.localidade) {
              return Response.json({ error: "CEP não encontrado." }, { status: 404 });
            }
            const geo = await fetch(
              "https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&country=BR" +
                `&name=${encodeURIComponent(address.localidade)}`,
            );
            if (!geo.ok) throw new Error("geo");
            const place = (
              (await geo.json()) as {
                results?: { latitude: number; longitude: number; admin1?: string }[];
              }
            ).results?.[0];
            if (!place) {
              return Response.json({ error: "Não achamos a cidade deste CEP." }, { status: 404 });
            }
            return Response.json(
              {
                cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
                label: `${address.localidade} / ${address.uf ?? ""}`.trim().replace(/\/$/, ""),
                latitude: place.latitude,
                longitude: place.longitude,
              },
              { headers: cacheHeaders },
            );
          }

          if (parsed.data.type === "weather") {
            const city = getWeatherCity(parsed.data.cityId);
            const latitude = parsed.data.lat ?? city.latitude;
            const longitude = parsed.data.lon ?? city.longitude;
            const label = parsed.data.label?.trim() || city.label;
            const endpoint =
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}` +
              `&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code` +
              `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3` +
              `&timezone=America%2FSao_Paulo`;
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error("weather");
            const payload = (await response.json()) as {
              current?: {
                temperature_2m?: number;
                relative_humidity_2m?: number;
                weather_code?: number;
              };
              daily?: {
                time?: string[];
                weather_code?: number[];
                temperature_2m_max?: number[];
                temperature_2m_min?: number[];
              };
            };
            return Response.json(
              {
                city: label,
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

          const { getConfiguredNewsFeed } = await import("@/lib/widgets/data-sources.server");
          const feed = await getConfiguredNewsFeed(parsed.data.feedId);
          if (!feed.enabled) {
            return Response.json({ error: "Fonte de notícias desativada." }, { status: 404 });
          }
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
