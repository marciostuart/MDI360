import { useEffect, useMemo, useState } from "react";

import type { WidgetBlock, WidgetConfig, WidgetLayout, WidgetTheme } from "@/lib/widgets/catalog";
import { getWeatherCity, resolveWidgetLayout, resolveWidgetTheme } from "@/lib/widgets/catalog";

/**
 * Renders an information widget full screen. All data comes from the public
 * proxy at /api/public/widget-data, refreshed every 5 minutes, so the TV never
 * talks to third-party hosts directly and licences stay attributed on screen.
 *
 * Every widget shares the same themed Shell: solid / gradient / image backdrop,
 * or an animated weather scene. Sizing uses container queries (cqh/cqw), so the
 * exact same markup fills a 1080p TV and the small preview in the Studio.
 */
export function WidgetView({
  config,
  accentColor,
}: {
  config: WidgetConfig;
  accentColor?: string | null;
}) {
  const theme = resolveWidgetTheme(config.theme);
  const accent = theme.accentColor || accentColor || "#38BDF8";

  if (config.type === "clock") return <ClockWidget config={config} theme={theme} accent={accent} />;
  if (config.type === "weather")
    return <WeatherWidget config={config} theme={theme} accent={accent} />;
  if (config.type === "currency")
    return <CurrencyWidget config={config} theme={theme} accent={accent} />;
  return <NewsWidget config={config} theme={theme} accent={accent} />;
}

/* ------------------------------------------------------------------ shell */

function Backdrop({
  theme,
  scene,
}: {
  theme: WidgetTheme;
  /** Weather scene rendered when the widget asks for it. */
  scene?: React.ReactNode;
}) {
  const hasImage = theme.backgroundImageUrl.length > 0;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            theme.background === "solid"
              ? theme.backgroundColor
              : `linear-gradient(160deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        }}
      />
      {theme.background === "scene" && scene ? scene : null}
      {theme.background === "image" && hasImage ? (
        <>
          <img
            src={theme.backgroundImageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            style={
              theme.animations && theme.kenBurns
                ? { animation: "mdi-kenburns 28s ease-in-out infinite alternate" }
                : undefined
            }
          />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `rgba(0,0,0,${theme.overlay / 100})` }}
          />
        </>
      ) : null}
      {/* Bottom scrim keeps credits and small text legible on any backdrop. */}
      <div className="absolute inset-x-0 bottom-0 h-[28cqh] bg-gradient-to-t from-black/55 to-transparent" />
    </div>
  );
}

function Shell({
  children,
  credit,
  accent,
  theme,
  scene,
}: {
  children: React.ReactNode;
  credit?: string | null;
  accent: string;
  theme: WidgetTheme;
  scene?: React.ReactNode;
}) {
  return (
    <div
      className="relative size-full min-h-full overflow-hidden"
      style={{ containerType: "size", color: theme.textColor }}
    >
      <Backdrop theme={theme} scene={scene} />
      <div className="absolute inset-0">{children}</div>
      <div className="absolute inset-x-0 bottom-0 h-[0.7cqh]" style={{ backgroundColor: accent }} />
      {credit ? (
        <p
          className="absolute bottom-[2.2cqh] right-[3cqw] text-[1.2cqh] uppercase tracking-[0.25em] opacity-45"
          style={{ color: theme.textColor }}
        >
          {credit}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One freely positioned piece of a widget. Position and width are % of the
 * screen and the font size is in cqh, so the same numbers chosen in the Studio
 * look identical on a 1080p TV, on a vertical totem and in the small preview.
 */
function Block({
  block,
  children,
  className,
  style,
}: {
  block: WidgetBlock | undefined;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!block || block.hidden) return null;
  return (
    <div
      className={`absolute ${className ?? ""}`}
      style={{
        left: `${block.x}%`,
        top: `${block.y}%`,
        width: `${block.w}%`,
        fontSize: `${block.size}cqh`,
        textAlign: block.align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function useWidgetData<T>(query: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/public/widget-data?${query}`);
        if (!response.ok) throw new Error("widget-data");
        const payload = (await response.json()) as T;
        if (!cancelled) {
          setData(payload);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [query]);

  return { data, failed };
}

/* ------------------------------------------------------------------ clock */

function ClockWidget({
  config,
  theme,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "clock" }>;
  theme: WidgetTheme;
  accent: string;
}) {
  const [now, setNow] = useState(() => new Date());
  const layout = resolveWidgetLayout("clock", config.layout as WidgetLayout | undefined);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    ...(config.showSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: config.timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <Shell accent={accent} theme={theme} scene={<ClearScene accent={accent} theme={theme} />}>
      <Block
        block={layout.time}
        className="font-display font-semibold leading-none tabular-nums"
        style={{ textShadow: "0 0.6cqh 3cqh rgba(0,0,0,0.45)" }}
      >
        {time}
      </Block>
      {config.showDate ? (
        <Block block={layout.date} className="capitalize opacity-75">
          {date}
        </Block>
      ) : null}
    </Shell>
  );
}

/* ---------------------------------------------------------------- weather */

type WeatherPayload = {
  city: string;
  credit: string;
  current: { temperature: number | null; humidity: number | null; code: number | null };
  daily: { date: string; code: number | null; max: number | null; min: number | null }[];
};

type SceneKind = "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow";

const WEATHER_LABELS: { codes: number[]; label: string; icon: string; scene: SceneKind }[] = [
  { codes: [0], label: "Céu limpo", icon: "☀️", scene: "clear" },
  { codes: [1, 2], label: "Parcialmente nublado", icon: "🌤️", scene: "cloudy" },
  { codes: [3], label: "Nublado", icon: "☁️", scene: "cloudy" },
  { codes: [45, 48], label: "Nevoeiro", icon: "🌫️", scene: "fog" },
  { codes: [51, 53, 55, 56, 57], label: "Garoa", icon: "🌦️", scene: "rain" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: "Chuva", icon: "🌧️", scene: "rain" },
  { codes: [71, 73, 75, 77, 85, 86], label: "Neve", icon: "🌨️", scene: "snow" },
  { codes: [95, 96, 99], label: "Tempestade", icon: "⛈️", scene: "storm" },
];

function weatherLook(code: number | null) {
  const match = WEATHER_LABELS.find((entry) => code !== null && entry.codes.includes(code));
  return match ?? { label: "Tempo estável", icon: "🌡️", scene: "cloudy" as SceneKind };
}

/** Deterministic pseudo-random so drops/flakes never re-shuffle on re-render. */
function spread(count: number, seed: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin((index + 1) * seed) * 10000;
    return value - Math.floor(value);
  });
}

function ClearScene({ accent, theme }: { accent: string; theme: WidgetTheme }) {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute left-[62%] top-[-14cqh] size-[46cqh] rounded-full blur-[2cqh]"
        style={{
          background: `radial-gradient(circle, ${accent}cc 0%, transparent 68%)`,
          animation: theme.animations ? "mdi-sun-pulse 7s ease-in-out infinite" : undefined,
        }}
      />
      <div
        className="absolute left-[68%] top-[-4cqh] size-[26cqh] rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(255,255,255,0.35), transparent 22%, rgba(255,255,255,0.28) 50%, transparent 74%, rgba(255,255,255,0.3))",
          animation: theme.animations ? "mdi-sun-spin 40s linear infinite" : undefined,
        }}
      />
    </div>
  );
}

function CloudLayer({ animated, count = 4 }: { animated: boolean; count?: number }) {
  return (
    <div className="absolute inset-0">
      {spread(count, 12.9898).map((offset, index) => (
        <div
          key={index}
          className="absolute rounded-full bg-white/12 blur-[1.6cqh]"
          style={{
            width: `${26 + offset * 26}cqh`,
            height: `${11 + offset * 8}cqh`,
            top: `${4 + offset * 52}cqh`,
            left: "-20%",
            animation: animated
              ? `mdi-cloud-drift ${46 + index * 13}s linear ${index * -9}s infinite`
              : undefined,
            transform: animated ? undefined : `translateX(${30 + index * 90}%)`,
          }}
        />
      ))}
    </div>
  );
}

function RainLayer({ animated, heavy }: { animated: boolean; heavy?: boolean }) {
  const drops = spread(heavy ? 70 : 42, 78.233);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {drops.map((offset, index) => (
        <div
          key={index}
          className="absolute top-0 w-[0.18cqh] rounded-full bg-white/45"
          style={{
            height: `${heavy ? 9 : 6}cqh`,
            left: `${offset * 100}%`,
            opacity: 0.25 + offset * 0.5,
            animation: animated
              ? `mdi-rain-fall ${(heavy ? 0.55 : 0.95) + offset * 0.5}s linear ${offset * -1.4}s infinite`
              : undefined,
            transform: animated ? undefined : `translateY(${offset * 100}%)`,
          }}
        />
      ))}
    </div>
  );
}

function SnowLayer({ animated }: { animated: boolean }) {
  const flakes = spread(48, 43.7712);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {flakes.map((offset, index) => (
        <div
          key={index}
          className="absolute top-0 rounded-full bg-white/70 blur-[0.1cqh]"
          style={{
            width: `${0.5 + offset}cqh`,
            height: `${0.5 + offset}cqh`,
            left: `${offset * 100}%`,
            animation: animated
              ? `mdi-snow-fall ${5 + offset * 7}s linear ${offset * -6}s infinite`
              : undefined,
            transform: animated ? undefined : `translateY(${offset * 100}%)`,
          }}
        />
      ))}
    </div>
  );
}

function FogLayer({ animated }: { animated: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="absolute inset-x-[-15%] bg-white/12 blur-[3cqh]"
          style={{
            height: `${16 + index * 6}cqh`,
            top: `${20 + index * 26}cqh`,
            animation: animated
              ? `mdi-fog-drift ${16 + index * 7}s ease-in-out ${index * -5}s infinite`
              : undefined,
          }}
        />
      ))}
    </div>
  );
}

function WeatherScene({
  kind,
  theme,
  accent,
}: {
  kind: SceneKind;
  theme: WidgetTheme;
  accent: string;
}) {
  const animated = theme.animations;
  const gradients: Record<SceneKind, string> = {
    clear: "linear-gradient(165deg, #0B4F8A 0%, #0A2540 55%, #04101F 100%)",
    cloudy: "linear-gradient(165deg, #3A4A5C 0%, #1D2731 60%, #0C1116 100%)",
    fog: "linear-gradient(165deg, #4A5560 0%, #262E36 60%, #10151A 100%)",
    rain: "linear-gradient(165deg, #1F3A56 0%, #14212F 60%, #070C12 100%)",
    storm: "linear-gradient(165deg, #1A2233 0%, #10141F 60%, #04060A 100%)",
    snow: "linear-gradient(165deg, #5B6F82 0%, #2C3A47 60%, #131A21 100%)",
  };

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0" style={{ background: gradients[kind] }} />
      {kind === "clear" ? <ClearScene accent={accent} theme={theme} /> : null}
      {kind === "cloudy" ? <CloudLayer animated={animated} /> : null}
      {kind === "fog" ? <FogLayer animated={animated} /> : null}
      {kind === "rain" ? (
        <>
          <CloudLayer animated={animated} count={3} />
          <RainLayer animated={animated} />
        </>
      ) : null}
      {kind === "storm" ? (
        <>
          <CloudLayer animated={animated} count={3} />
          <RainLayer animated={animated} heavy />
          <div
            className="absolute inset-0 bg-white"
            style={{ animation: animated ? "mdi-flash 9s linear infinite" : undefined, opacity: 0 }}
          />
        </>
      ) : null}
      {kind === "snow" ? (
        <>
          <CloudLayer animated={animated} count={3} />
          <SnowLayer animated={animated} />
        </>
      ) : null}
    </div>
  );
}

function WeatherWidget({
  config,
  theme,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "weather" }>;
  theme: WidgetTheme;
  accent: string;
}) {
  const city = getWeatherCity(config.cityId);
  const { data, failed } = useWidgetData<WeatherPayload>(
    `type=weather&cityId=${encodeURIComponent(config.cityId)}`,
  );
  const layout = resolveWidgetLayout("weather", config.layout as WidgetLayout | undefined);

  const look = weatherLook(data?.current.code ?? null);

  return (
    <Shell
      accent={accent}
      theme={theme}
      credit={data?.credit ?? "Open-Meteo · CC BY 4.0"}
      scene={<WeatherScene kind={look.scene} theme={theme} accent={accent} />}
    >
      {failed && !data ? (
        <p className="absolute left-[6%] top-[46%] text-[4cqh] opacity-60">
          Clima indisponível agora.
        </p>
      ) : (
        <>
          <Block block={layout.city} className="uppercase tracking-[0.28em] opacity-70">
            {data?.city ?? city.label}
          </Block>
          <Block
            block={layout.temp}
            className="font-display font-semibold leading-[0.9] tabular-nums"
            style={{ textShadow: "0 0.8cqh 3cqh rgba(0,0,0,0.45)" }}
          >
            {data?.current.temperature != null ? `${Math.round(data.current.temperature)}°` : "--"}
          </Block>
          <Block block={layout.condition} className="font-medium">
            {look.label}
          </Block>
          {data?.current.humidity != null ? (
            <Block block={layout.humidity} className="opacity-65">
              Umidade {Math.round(data.current.humidity)}%
            </Block>
          ) : null}
          <Block block={layout.icon} className="leading-none">
            {look.icon}
          </Block>
          <Block block={layout.forecast}>
            <div className="space-y-[0.5em]">
              {(data?.daily ?? []).slice(1, 4).map((day) => {
                const dayLook = weatherLook(day.code);
                return (
                  <div
                    key={day.date}
                    className="flex items-center justify-end gap-[0.5em] rounded-[0.5em] bg-black/25 px-[0.6em] py-[0.35em]"
                  >
                    <span className="capitalize opacity-70">
                      {new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(
                        new Date(`${day.date}T12:00:00`),
                      )}
                    </span>
                    <span>{dayLook.icon}</span>
                    <span className="tabular-nums">
                      {day.min != null ? Math.round(day.min) : "--"}° /{" "}
                      {day.max != null ? Math.round(day.max) : "--"}°
                    </span>
                  </div>
                );
              })}
            </div>
          </Block>
        </>
      )}
    </Shell>
  );
}

/* --------------------------------------------------------------- currency */

type CurrencyPayload = {
  credit: string;
  quotes: { code: string; name: string; value: number; changePct: number }[];
};

function CurrencyWidget({
  config,
  theme,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "currency" }>;
  theme: WidgetTheme;
  accent: string;
}) {
  const query = useMemo(
    () => `type=currency&pairs=${encodeURIComponent(config.pairs.join(","))}`,
    [config.pairs],
  );
  const { data, failed } = useWidgetData<CurrencyPayload>(query);

  return (
    <Shell
      accent={accent}
      theme={theme}
      credit={data?.credit ?? "AwesomeAPI"}
      scene={<WeatherScene kind="cloudy" theme={theme} accent={accent} />}
    >
      <p className="text-[3.2cqh] uppercase tracking-[0.32em] opacity-60">Cotações de hoje</p>
      {failed && !data ? (
        <p className="mt-[4cqh] text-[4cqh] opacity-60">Cotações indisponíveis agora.</p>
      ) : (
        <div className="mx-auto mt-[4cqh] w-full max-w-[82%] space-y-[2cqh]">
          {(data?.quotes ?? []).map((quote) => (
            <div
              key={quote.code}
              className="flex items-baseline justify-between rounded-[1.6cqh] bg-black/30 px-[2.4cqw] py-[1.6cqh]"
            >
              <span className="text-[4.2cqh] opacity-85">{quote.name || quote.code}</span>
              <span className="font-display text-[6cqh] font-semibold tabular-nums">
                R$ {quote.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
              <span
                className="text-[3.2cqh] tabular-nums"
                style={{ color: quote.changePct >= 0 ? "#4ade80" : "#f87171" }}
              >
                {quote.changePct >= 0 ? "▲" : "▼"} {Math.abs(quote.changePct).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------- news */

type NewsPayload = {
  source: string;
  credit: string;
  items?: { title: string; summary: string; image: string | null; publishedAt: string | null }[];
  headlines?: string[];
};

function NewsWidget({
  config,
  theme,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "news" }>;
  theme: WidgetTheme;
  accent: string;
}) {
  const { data, failed } = useWidgetData<NewsPayload>(
    `type=news&feedId=${encodeURIComponent(config.feedId)}`,
  );

  const items = useMemo(() => {
    const list =
      data?.items && data.items.length > 0
        ? data.items
        : (data?.headlines ?? []).map((title) => ({
            title,
            summary: "",
            image: null,
            publishedAt: null,
          }));
    return list.slice(0, config.headlines);
  }, [data, config.headlines]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [config.feedId, config.oneAtATime]);

  useEffect(() => {
    if (!config.oneAtATime || items.length <= 1) return;
    const interval = window.setInterval(
      () => setIndex((current) => (current + 1) % items.length),
      config.rotateSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [config.oneAtATime, config.rotateSeconds, items.length]);

  const current = items[Math.min(index, Math.max(items.length - 1, 0))];
  const heroImage = config.showImage && current?.image ? current.image : null;

  // One at a time: the headline itself is the hero, with the article photo used
  // as the backdrop so it stays readable from across the room.
  const sceneForNews =
    heroImage && theme.background !== "image" ? (
      <div className="absolute inset-0">
        <img
          key={heroImage}
          src={heroImage}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={
            theme.animations && theme.kenBurns
              ? { animation: "mdi-kenburns 24s ease-in-out infinite alternate" }
              : undefined
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/65 to-black/35" />
      </div>
    ) : (
      <WeatherScene kind="cloudy" theme={theme} accent={accent} />
    );

  return (
    <Shell
      accent={accent}
      theme={theme}
      credit={data?.credit ?? null}
      scene={sceneForNews}
      align="left"
    >
      <div className="flex items-center gap-[1.6cqw]">
        <span
          className="rounded-full px-[1.6cqw] py-[0.8cqh] text-[2.2cqh] font-semibold uppercase tracking-[0.24em]"
          style={{ backgroundColor: accent, color: "#06080B" }}
        >
          {data?.source ?? "Notícias"}
        </span>
        {config.oneAtATime && items.length > 1 ? (
          <span className="text-[2.2cqh] tabular-nums opacity-55">
            {index + 1}/{items.length}
          </span>
        ) : null}
      </div>

      {failed && !data ? (
        <p className="mt-[4cqh] text-[4cqh] opacity-60">Notícias indisponíveis agora.</p>
      ) : config.oneAtATime ? (
        <div key={`${index}-${current?.title ?? ""}`} className="mt-[3.5cqh]">
          <h2
            className="font-display text-[7.4cqh] font-semibold leading-[1.12]"
            style={{
              textShadow: "0 0.6cqh 2.4cqh rgba(0,0,0,0.6)",
              animation: theme.animations ? "mdi-news-in 0.6s ease-out both" : undefined,
            }}
          >
            {current?.title ?? "Sem manchetes agora."}
          </h2>
          {config.showSummary && current?.summary ? (
            <p
              className="mt-[2.4cqh] max-w-[84%] text-[3.6cqh] leading-[1.4] opacity-80"
              style={{
                animation: theme.animations ? "mdi-news-in 0.7s ease-out 0.12s both" : undefined,
              }}
            >
              {current.summary}
            </p>
          ) : null}
          {items.length > 1 ? (
            <div className="mt-[4cqh] h-[0.5cqh] w-[40%] overflow-hidden rounded-full bg-white/20">
              <div
                key={index}
                className="h-full origin-left rounded-full"
                style={{
                  backgroundColor: accent,
                  animation: theme.animations
                    ? `mdi-bar-fill ${config.rotateSeconds}s linear forwards`
                    : undefined,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="mt-[3.5cqh] w-full space-y-[2.2cqh]">
          {items.map((item, position) => (
            <li key={`${position}-${item.title.slice(0, 12)}`} className="flex gap-[1.5cqw]">
              <span className="font-display text-[4cqh] font-semibold" style={{ color: accent }}>
                {position + 1}
              </span>
              <span className="text-[3.6cqh] leading-snug opacity-90">{item.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
