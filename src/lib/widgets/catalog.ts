import { z } from "zod";

import { LOTTERY_GAME_IDS, type LotteryGameId } from "./lottery";
import { selectLotteryLayout } from "./lottery-layout";

/**
 * Information widgets. They are stored as regular library items (kind "widget")
 * so playlists, schedules and the player treat them like any other content.
 * External providers are always accessed through the server-side proxy. Data
 * that needs resilience (such as official lottery results) is centrally cached.
 */
export type WidgetType = "clock" | "weather" | "currency" | "news" | "lottery";

export const WIDGET_TYPES = ["clock", "weather", "currency", "news", "lottery"] as const;

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

export const WEATHER_VIDEO_CONDITIONS = [
  { id: "clear", label: "Céu limpo" },
  { id: "partlyCloudy", label: "Parcialmente nublado" },
  { id: "cloudy", label: "Nublado" },
  { id: "showers", label: "Pancadas de chuva" },
  { id: "rain", label: "Chuva" },
] as const;

export const WEATHER_VIDEO_CONDITION_IDS = WEATHER_VIDEO_CONDITIONS.map((item) => item.id);
export type WeatherVideoCondition = (typeof WEATHER_VIDEO_CONDITION_IDS)[number];

/** Maps Open-Meteo WMO codes to the five customer-configurable video groups. */
export function weatherVideoConditionForCode(code: number | null): WeatherVideoCondition {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partlyCloudy";
  if (code === 3 || code === 45 || code === 48) return "cloudy";
  if (code !== null && [51, 53, 55, 56, 57, 80, 81, 82].includes(code)) return "showers";
  return "rain";
}

/**
 * Look & feel shared by every widget. Optional so widgets saved before the
 * theming feature keep parsing — the player merges WIDGET_THEME_DEFAULTS.
 */
export const BACKGROUND_MODES = ["solid", "gradient", "image", "scene"] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB");

export const widgetThemeSchema = z.object({
  background: z.enum(BACKGROUND_MODES).default("gradient"),
  backgroundColor: hex.default("#0A0A0B"),
  gradientFrom: hex.default("#0F172A"),
  gradientTo: hex.default("#020617"),
  /** Public https image used as backdrop (optional). */
  backgroundImageUrl: z.string().trim().max(600).default(""),
  /** Dark veil over the image so text stays readable (0–90%). */
  overlay: z.number().int().min(0).max(90).default(45),
  textColor: hex.default("#FFFFFF"),
  /** Empty = follow the organization brand color. */
  accentColor: z.union([hex, z.literal("")]).default(""),
  /** Motion: weather scenes, ken-burns on images, news transitions. */
  animations: z.boolean().default(true),
  kenBurns: z.boolean().default(true),
});

export type WidgetTheme = z.infer<typeof widgetThemeSchema>;

export const WIDGET_THEME_DEFAULTS: WidgetTheme = widgetThemeSchema.parse({});

export function resolveWidgetTheme(theme?: Partial<WidgetTheme> | null): WidgetTheme {
  return { ...WIDGET_THEME_DEFAULTS, ...(theme ?? {}) };
}

/** Theme and numbered-placeholder colors for one lottery modality. */
export const lotteryGameThemeSchema = widgetThemeSchema.extend({
  /** Empty means transparent placeholders. */
  placeholderBackground: z.union([hex, z.literal("")]).default("#FFFFFF"),
  placeholderTextColor: hex.default("#020617"),
  /** Empty means no visible placeholder outline. */
  placeholderBorderColor: z.union([hex, z.literal("")]).default(""),
});

export const lotteryGameThemesSchema = z.record(z.string(), lotteryGameThemeSchema);
export type LotteryGameTheme = z.infer<typeof lotteryGameThemeSchema>;
export type LotteryGameThemes = z.infer<typeof lotteryGameThemesSchema>;

export function resolveLotteryGameTheme(
  gameId: string | null | undefined,
  sharedTheme?: Partial<WidgetTheme> | null,
  gameThemes?: LotteryGameThemes | null,
): LotteryGameTheme {
  return lotteryGameThemeSchema.parse({
    ...resolveWidgetTheme(sharedTheme),
    ...(gameId ? gameThemes?.[gameId] ?? {} : {}),
  });
}

/**
 * Free layout. Every visible piece of a widget is a "block" that the customer
 * can drag, resize (font size in cqh, so it scales with the screen), align or
 * hide. Saved widgets without a layout fall back to LAYOUT_PRESETS below, which
 * reproduce the original design pixel for pixel.
 */
export const widgetBlockSchema = z.object({
  /** Top-left corner, in % of the screen. */
  x: z.number().min(-10).max(100).default(6),
  y: z.number().min(-10).max(100).default(10),
  /** Box width, in % of the screen. */
  w: z.number().min(5).max(100).default(60),
  /** Font size in cqh (1cqh = 1% of the screen height). */
  size: z.number().min(0.8).max(40).default(4),
  align: z.enum(["left", "center", "right"]).default("left"),
  hidden: z.boolean().default(false),
  /** Optional per-item font color. Empty means inherit the widget color. */
  color: z.union([hex, z.literal("")]).default(""),
  /** Optional per-item background color. Empty means transparent. */
  backgroundColor: z.union([hex, z.literal("")]).default(""),
  /** Optional HTTPS image used only behind this item. */
  backgroundImageUrl: z.string().trim().max(600).default(""),
});

export type WidgetBlock = z.infer<typeof widgetBlockSchema>;

export const widgetLayoutSchema = z.record(z.string(), widgetBlockSchema);

export type WidgetLayout = z.infer<typeof widgetLayoutSchema>;

export const lotteryGameLayoutsSchema = z.record(z.string(), widgetLayoutSchema);

export type LotteryGameLayouts = z.infer<typeof lotteryGameLayoutsSchema>;

export const WIDGET_BLOCKS: Record<WidgetType, { id: string; label: string }[]> = {
  clock: [
    { id: "time", label: "Hora" },
    { id: "date", label: "Data" },
  ],
  weather: [
    { id: "city", label: "Cidade" },
    { id: "temp", label: "Temperatura" },
    { id: "condition", label: "Condição" },
    { id: "humidity", label: "Umidade" },
    { id: "icon", label: "Ícone do tempo" },
    { id: "forecast", label: "Previsão dos dias" },
  ],
  currency: [
    { id: "title", label: "Título" },
    { id: "quotes", label: "Lista de cotações" },
  ],
  news: [
    { id: "source", label: "Etiqueta da fonte" },
    { id: "image", label: "Imagem da manchete" },
    { id: "headline", label: "Manchete" },
    { id: "summary", label: "Resumo" },
    { id: "progress", label: "Barra de tempo" },
  ],
  lottery: [
    { id: "game", label: "Modalidade" },
    { id: "contest", label: "Concurso e data" },
    { id: "result", label: "Resultado" },
    { id: "details", label: "Informações complementares" },
    { id: "status", label: "Situação e próximo prêmio" },
    { id: "source", label: "Fonte oficial" },
  ],
};

export const LAYOUT_PRESETS: Record<WidgetType, WidgetLayout> = {
  clock: {
    time: { x: 8, y: 24, w: 84, size: 22, align: "center", hidden: false },
    date: { x: 8, y: 62, w: 84, size: 4, align: "center", hidden: false },
  },
  weather: {
    city: { x: 6, y: 12, w: 52, size: 3.4, align: "left", hidden: false },
    temp: { x: 6, y: 19, w: 52, size: 26, align: "left", hidden: false },
    condition: { x: 6, y: 55, w: 52, size: 4.6, align: "left", hidden: false },
    humidity: { x: 6, y: 64, w: 52, size: 2.8, align: "left", hidden: false },
    icon: { x: 64, y: 10, w: 30, size: 13, align: "right", hidden: false },
    forecast: { x: 62, y: 34, w: 32, size: 2.6, align: "right", hidden: false },
  },
  currency: {
    title: { x: 8, y: 10, w: 84, size: 3.2, align: "center", hidden: false },
    quotes: { x: 12, y: 22, w: 76, size: 4.2, align: "left", hidden: false },
  },
  news: {
    source: { x: 6, y: 10, w: 60, size: 2.2, align: "left", hidden: false },
    image: { x: 66, y: 22, w: 28, size: 1, align: "center", hidden: true },
    headline: { x: 6, y: 22, w: 84, size: 7.4, align: "left", hidden: false },
    summary: { x: 6, y: 58, w: 72, size: 3.6, align: "left", hidden: false },
    progress: { x: 6, y: 84, w: 36, size: 2, align: "left", hidden: false },
  },
  lottery: {
    game: { x: 6, y: 8, w: 60, size: 5.8, align: "left", hidden: false },
    contest: { x: 6, y: 18, w: 60, size: 2.4, align: "left", hidden: false },
    result: { x: 6, y: 29, w: 88, size: 6, align: "center", hidden: false },
    details: { x: 8, y: 55, w: 84, size: 2.7, align: "center", hidden: false },
    status: { x: 8, y: 75, w: 84, size: 2.5, align: "center", hidden: false },
    source: { x: 6, y: 89, w: 88, size: 1.6, align: "left", hidden: false },
  },
};

const lotteryTemplate = (
  overrides: Partial<Record<(typeof WIDGET_BLOCKS.lottery)[number]["id"], Partial<WidgetBlock>>>,
): WidgetLayout => {
  const base = LAYOUT_PRESETS.lottery;
  return Object.fromEntries(
    Object.entries(base).map(([id, block]) => [id, { ...block, ...(overrides[id] ?? {}) }]),
  );
};

/**
 * Readability-first defaults for a 16:9 TV viewed from a queue. Modalities with
 * many values use more compact result areas; short draws and Federal prioritize
 * large numbers. Every template remains fully editable in the master panel.
 */
export const LOTTERY_LAYOUT_PRESETS: Record<LotteryGameId, WidgetLayout> = {
  megasena: lotteryTemplate({
    game: { x: 5, y: 6, w: 90, size: 6.4, align: "center" },
    contest: { x: 5, y: 17, w: 90, size: 2.7, align: "center" },
    result: { x: 5, y: 31, w: 90, size: 9.5, align: "center" },
    details: { hidden: true },
    status: { x: 7, y: 70, w: 86, size: 3.1, align: "center" },
  }),
  lotofacil: lotteryTemplate({
    game: { x: 5, y: 5, w: 90, size: 5.8, align: "center" },
    contest: { x: 5, y: 15, w: 90, size: 2.6, align: "center" },
    result: { x: 7, y: 27, w: 86, size: 6.8, align: "center" },
    details: { hidden: true },
    status: { x: 7, y: 73, w: 86, size: 2.9, align: "center" },
  }),
  quina: lotteryTemplate({
    game: { x: 5, y: 6, w: 90, size: 6.4, align: "center" },
    contest: { x: 5, y: 17, w: 90, size: 2.7, align: "center" },
    result: { x: 5, y: 31, w: 90, size: 10.5, align: "center" },
    details: { hidden: true },
    status: { x: 7, y: 70, w: 86, size: 3.1, align: "center" },
  }),
  lotomania: lotteryTemplate({
    game: { x: 5, y: 4, w: 90, size: 5.6, align: "center" },
    contest: { x: 5, y: 14, w: 90, size: 2.5, align: "center" },
    result: { x: 7, y: 24, w: 86, size: 5.8, align: "center" },
    details: { hidden: true },
    status: { x: 7, y: 75, w: 86, size: 2.8, align: "center" },
  }),
  timemania: lotteryTemplate({
    game: { x: 5, y: 5, w: 90, size: 5.8, align: "center" },
    contest: { x: 5, y: 15, w: 90, size: 2.6, align: "center" },
    result: { x: 5, y: 28, w: 90, size: 8.2, align: "center" },
    details: { x: 8, y: 57, w: 84, size: 3.5, align: "center" },
    status: { x: 7, y: 72, w: 86, size: 2.9, align: "center" },
  }),
  duplasena: lotteryTemplate({
    game: { x: 5, y: 3, w: 90, size: 5.4, align: "center" },
    contest: { x: 5, y: 12, w: 90, size: 2.4, align: "center" },
    result: { x: 6, y: 21, w: 88, size: 6.4, align: "center" },
    details: { hidden: true },
    status: { x: 7, y: 78, w: 86, size: 2.7, align: "center" },
  }),
  federal: lotteryTemplate({
    game: { x: 5, y: 8, w: 38, size: 7.2, align: "left" },
    contest: { x: 5, y: 24, w: 38, size: 2.8, align: "left" },
    result: { x: 47, y: 7, w: 48, size: 5.6, align: "left" },
    details: { hidden: true },
    status: { x: 5, y: 51, w: 36, size: 3.2, align: "left" },
    source: { x: 5, y: 90, w: 90, size: 1.7, align: "left" },
  }),
  loteca: lotteryTemplate({
    game: { x: 5, y: 3, w: 90, size: 5.2, align: "center" },
    contest: { x: 5, y: 12, w: 90, size: 2.3, align: "center" },
    result: { x: 5, y: 21, w: 90, size: 4.8, align: "center" },
    details: { hidden: true },
    status: { x: 7, y: 81, w: 86, size: 2.5, align: "center" },
    source: { x: 5, y: 91, w: 90, size: 1.5, align: "left" },
  }),
  diadesorte: lotteryTemplate({
    game: { x: 5, y: 5, w: 90, size: 5.8, align: "center" },
    contest: { x: 5, y: 15, w: 90, size: 2.6, align: "center" },
    result: { x: 5, y: 28, w: 90, size: 8.2, align: "center" },
    details: { x: 8, y: 57, w: 84, size: 3.5, align: "center" },
    status: { x: 7, y: 72, w: 86, size: 2.9, align: "center" },
  }),
  supersete: lotteryTemplate({
    game: { x: 5, y: 5, w: 90, size: 5.8, align: "center" },
    contest: { x: 5, y: 15, w: 90, size: 2.6, align: "center" },
    result: { x: 5, y: 28, w: 90, size: 8.2, align: "center" },
    details: { hidden: true },
    status: { x: 7, y: 70, w: 86, size: 3, align: "center" },
  }),
  maismilionaria: lotteryTemplate({
    game: { x: 5, y: 4, w: 90, size: 5.6, align: "center" },
    contest: { x: 5, y: 14, w: 90, size: 2.5, align: "center" },
    result: { x: 5, y: 25, w: 90, size: 7.5, align: "center" },
    details: { x: 8, y: 56, w: 84, size: 3.3, align: "center" },
    status: { x: 7, y: 72, w: 86, size: 2.9, align: "center" },
  }),
};

export function getLotteryLayoutPreset(gameId: string): WidgetLayout {
  return LOTTERY_LAYOUT_PRESETS[gameId as LotteryGameId] ?? LAYOUT_PRESETS.lottery;
}

/** Merges the saved layout with the preset so new blocks always have a place. */
export function resolveWidgetLayout(
  type: WidgetType,
  layout?: WidgetLayout | null,
): Required<WidgetLayout> {
  const preset = LAYOUT_PRESETS[type];
  const merged: WidgetLayout = {};
  for (const [id, block] of Object.entries(preset)) {
    merged[id] = widgetBlockSchema.parse({ ...block, ...(layout?.[id] ?? {}) });
  }
  return merged;
}

/** Resolve one lottery modality while preserving the old shared layout as fallback. */
export function resolveLotteryWidgetLayout(
  gameId: string | null | undefined,
  gameLayouts?: LotteryGameLayouts | null,
  legacyLayout?: WidgetLayout | null,
): Required<WidgetLayout> {
  const preset = getLotteryLayoutPreset(gameId ?? "");
  const selected = selectLotteryLayout(gameId, gameLayouts, legacyLayout);
  const merged: WidgetLayout = {};
  for (const [id, block] of Object.entries(preset)) {
    merged[id] = widgetBlockSchema.parse({ ...block, ...(selected?.[id] ?? {}) });
  }
  return merged;
}

export const widgetConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("clock"),
    timezone: z.string().trim().max(64).default("America/Sao_Paulo"),
    showDate: z.boolean().default(true),
    showSeconds: z.boolean().default(false),
    theme: widgetThemeSchema.optional(),
    layout: widgetLayoutSchema.optional(),
  }),
  z.object({
    type: z.literal("weather"),
    cityId: z.enum(WEATHER_CITY_IDS as [string, ...string[]]),
    /** CEP consultado pelo lojista (apenas informativo/rastreio). */
    cep: z.string().trim().max(9).optional(),
    /** Cidade encontrada pelo CEP; quando presente, tem prioridade. */
    placeLabel: z.string().trim().max(80).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    /** Procedural scene keeps the legacy behavior; interactiveVideo uses Torre videos. */
    backgroundMode: z.enum(["procedural", "interactiveVideo"]).default("procedural"),
    theme: widgetThemeSchema.optional(),
    layout: widgetLayoutSchema.optional(),
  }),
  z.object({
    type: z.literal("currency"),
    pairs: z
      .array(z.enum(CURRENCY_IDS as [string, ...string[]]))
      .min(1)
      .max(5),
    theme: widgetThemeSchema.optional(),
    layout: widgetLayoutSchema.optional(),
  }),
  z.object({
    type: z.literal("news"),
    // Built-in feeds are controlled by the platform, while customer-owned
    // RSS feeds use their organization-scoped UUID as the identifier.
    feedId: z.string().trim().min(1).max(160),
    headlines: z.number().int().min(1).max(10).default(5),
    /** One headline at a time, rotating — much easier to read on a TV. */
    oneAtATime: z.boolean().default(true),
    rotateSeconds: z.number().int().min(3).max(30).default(7),
    showSummary: z.boolean().default(true),
    /** Maximum article-summary length rendered on screen. */
    summaryMaxChars: z.number().int().min(60).max(600).default(240),
    showImage: z.boolean().default(true),
    /** Article image can remain a backdrop or become a freely positioned block. */
    imageMode: z.enum(["background", "block", "hidden"]).default("background"),
    theme: widgetThemeSchema.optional(),
    layout: widgetLayoutSchema.optional(),
  }),
  z.object({
    type: z.literal("lottery"),
    gameIds: z
      .array(z.enum(LOTTERY_GAME_IDS as [string, ...string[]]))
      .min(1)
      .max(11)
      .refine((items) => new Set(items).size === items.length, "Não repita modalidades"),
    rotateSeconds: z.number().int().min(5).max(30).default(10),
    federalStyle: z.enum(["list", "receipt"]).default("list"),
    theme: widgetThemeSchema.optional(),
    /** Independent visual template for each lottery modality. */
    gameLayouts: lotteryGameLayoutsSchema.optional(),
    /** Independent theme and placeholder colors per modality. */
    gameThemes: lotteryGameThemesSchema.optional(),
    /** Legacy shared layout retained as fallback for existing widgets. */
    layout: widgetLayoutSchema.optional(),
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
    defaultConfig: {
      type: "news",
      feedId: "agencia-brasil",
      headlines: 5,
      oneAtATime: true,
      rotateSeconds: 7,
      showSummary: true,
      summaryMaxChars: 240,
      showImage: true,
      imageMode: "background",
    },
  },
  {
    type: "lottery",
    label: "Resultados das Loterias CAIXA",
    description: "Últimos resultados oficiais confirmados, com atualização automática.",
    defaultDurationMs: LOTTERY_GAME_IDS.length * 10_000,
    defaultConfig: {
      type: "lottery",
      gameIds: [...LOTTERY_GAME_IDS],
      rotateSeconds: 10,
      federalStyle: "list",
      gameLayouts: LOTTERY_LAYOUT_PRESETS,
    },
  },
];

export function getWidgetDefinition(type: string) {
  return WIDGET_CATALOG.find((entry) => entry.type === type) ?? WIDGET_CATALOG[0]!;
}
