import { z } from "zod";

/**
 * Information widgets. They are stored as regular library items (kind "widget")
 * so playlists, schedules and the player treat them like any other content.
 * Nothing is downloaded or re-hosted: the player reads open data at runtime,
 * which keeps us clear of any licence issue.
 */
export type WidgetType = "clock" | "weather" | "currency" | "news";

export const WIDGET_TYPES = ["clock", "weather", "currency", "news"] as const;

export const CURRENCY_OPTIONS = [
  { id: "USD-BRL", label: "Dólar (USD)" },
  { id: "EUR-BRL", label: "Euro (EUR)" },
  { id: "GBP-BRL", label: "Libra (GBP)" },
  { id: "BTC-BRL", label: "Bitcoin (BTC)" },
  { id: "ARS-BRL", label: "Peso argentino (ARS)" },
] as const;

export const CURRENCY_IDS = CURRENCY_OPTIONS.map((option) => option.id);

/**
 * Allow-list of feeds. Keeping it closed prevents the player from being used to
 * fetch arbitrary URLs, and every entry here is free to redistribute headlines.
 */
export const NEWS_FEEDS = [
  {
    id: "agencia-brasil",
    label: "Agência Brasil (CC BY 3.0)",
    url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
    credit: "Agência Brasil · CC BY 3.0",
  },
  {
    id: "g1-brasil",
    label: "G1 — Brasil",
    url: "https://g1.globo.com/rss/g1/brasil/",
    credit: "G1",
  },
  {
    id: "g1-economia",
    label: "G1 — Economia",
    url: "https://g1.globo.com/rss/g1/economia/",
    credit: "G1",
  },
  {
    id: "g1-tecnologia",
    label: "G1 — Tecnologia",
    url: "https://g1.globo.com/rss/g1/tecnologia/",
    credit: "G1",
  },
  {
    id: "ge-esportes",
    label: "ge — Esportes",
    url: "https://ge.globo.com/rss/ge/",
    credit: "ge.globo",
  },
] as const;

export const NEWS_FEED_IDS = NEWS_FEEDS.map((feed) => feed.id);

export function getNewsFeed(id: string) {
  return NEWS_FEEDS.find((feed) => feed.id === id) ?? NEWS_FEEDS[0];
}

/** A few Brazilian capitals so the customer does not need coordinates. */
export const WEATHER_CITIES = [
  { id: "belo-horizonte", label: "Belo Horizonte / MG", latitude: -19.92, longitude: -43.94 },
  { id: "sao-paulo", label: "São Paulo / SP", latitude: -23.55, longitude: -46.63 },
  { id: "rio-de-janeiro", label: "Rio de Janeiro / RJ", latitude: -22.91, longitude: -43.17 },
  { id: "brasilia", label: "Brasília / DF", latitude: -15.79, longitude: -47.88 },
  { id: "curitiba", label: "Curitiba / PR", latitude: -25.43, longitude: -49.27 },
  { id: "porto-alegre", label: "Porto Alegre / RS", latitude: -30.03, longitude: -51.23 },
  { id: "salvador", label: "Salvador / BA", latitude: -12.97, longitude: -38.5 },
  { id: "recife", label: "Recife / PE", latitude: -8.05, longitude: -34.9 },
  { id: "fortaleza", label: "Fortaleza / CE", latitude: -3.73, longitude: -38.52 },
  { id: "manaus", label: "Manaus / AM", latitude: -3.12, longitude: -60.02 },
  { id: "goiania", label: "Goiânia / GO", latitude: -16.68, longitude: -49.25 },
  { id: "vitoria", label: "Vitória / ES", latitude: -20.32, longitude: -40.34 },
] as const;

export const WEATHER_CITY_IDS = WEATHER_CITIES.map((city) => city.id);

export function getWeatherCity(id: string) {
  return WEATHER_CITIES.find((city) => city.id === id) ?? WEATHER_CITIES[0];
}

export const widgetConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("clock"),
    timezone: z.string().trim().max(64).default("America/Sao_Paulo"),
    showDate: z.boolean().default(true),
    showSeconds: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("weather"),
    cityId: z.enum(WEATHER_CITY_IDS as [string, ...string[]]),
  }),
  z.object({
    type: z.literal("currency"),
    pairs: z.array(z.enum(CURRENCY_IDS as [string, ...string[]])).min(1).max(5),
  }),
  z.object({
    type: z.literal("news"),
    feedId: z.enum(NEWS_FEED_IDS as [string, ...string[]]),
    headlines: z.number().int().min(1).max(10).default(5),
  }),
]);

export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export const WIDGET_CATALOG: {
  type: WidgetType;
  label: string;
  description: string;
  defaultDurationMs: number;
  defaultConfig: WidgetConfig;
}[] = [
  {
    type: "clock",
    label: "Relógio e data",
    description: "Hora grande com o dia da semana. Ideal entre um anúncio e outro.",
    defaultDurationMs: 10000,
    defaultConfig: {
      type: "clock",
      timezone: "America/Sao_Paulo",
      showDate: true,
      showSeconds: false,
    },
  },
  {
    type: "weather",
    label: "Clima",
    description: "Temperatura agora e previsão dos próximos dias (fonte Open-Meteo, CC BY).",
    defaultDurationMs: 12000,
    defaultConfig: { type: "weather", cityId: "belo-horizonte" },
  },
  {
    type: "currency",
    label: "Cotações",
    description: "Dólar, euro e bitcoin em tempo quase real.",
    defaultDurationMs: 12000,
    defaultConfig: { type: "currency", pairs: ["USD-BRL", "EUR-BRL", "BTC-BRL"] },
  },
  {
    type: "news",
    label: "Notícias",
    description: "Manchetes de feeds públicos, com crédito automático da fonte.",
    defaultDurationMs: 20000,
    defaultConfig: { type: "news", feedId: "agencia-brasil", headlines: 5 },
  },
];

export function getWidgetDefinition(type: string) {
  return WIDGET_CATALOG.find((entry) => entry.type === type) ?? WIDGET_CATALOG[0]!;
}