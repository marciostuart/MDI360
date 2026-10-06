import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { LocalWidgetData } from "./local-widget-data";

import type {
  WeatherVideoCondition,
  WidgetBlock,
  WidgetConfig,
  WidgetLayout,
  WidgetTheme,
  LotteryGameTheme,
} from "@/lib/widgets/catalog";
import {
  getWeatherCity,
  resolveLotteryGameTheme,
  resolveLotteryWidgetLayout,
  resolveWidgetLayout,
  resolveWidgetTheme,
} from "@/lib/widgets/catalog";
import type { NormalizedLotteryResult } from "@/lib/widgets/lottery";

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
  onReady,
  deviceToken,
}: {
  config: WidgetConfig;
  accentColor?: string | null;
  onReady?: () => void;
  deviceToken?: string | null;
}) {
  const theme = resolveWidgetTheme(config.theme);
  const accent = theme.accentColor || accentColor || "#38BDF8";

  if (config.type === "clock") return <ClockWidget config={config} theme={theme} accent={accent} />;
  if (config.type === "weather")
    return <WeatherWidget config={config} theme={theme} accent={accent} />;
  if (config.type === "currency")
    return <CurrencyWidget config={config} theme={theme} accent={accent} />;
  if (config.type === "lottery")
    return <LotteryWidget config={config} theme={theme} accent={accent} onReady={onReady} />;
  return (
    <NewsWidget
      config={config}
      theme={theme}
      accent={accent}
      onReady={onReady}
      deviceToken={deviceToken}
    />
  );
}

/* ------------------------------------------------------------------ shell */

function withOpacity(color: string, opacity: number) {
  const clean = color.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return color;
  const value = Number.parseInt(clean, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(100, Math.max(0, opacity)) / 100})`;
}

function gradient(
  angle: number,
  from: string,
  fromOpacity: number,
  to: string,
  toOpacity: number,
) {
  return `linear-gradient(${angle}deg, ${withOpacity(from, fromOpacity)}, ${withOpacity(to, toOpacity)})`;
}

function imageOverlay(theme: Pick<WidgetTheme, "imageOverlayMode" | "imageOverlayColor" | "imageOverlayOpacity" | "imageOverlayGradientFrom" | "imageOverlayGradientFromOpacity" | "imageOverlayGradientTo" | "imageOverlayGradientToOpacity" | "imageOverlayGradientAngle">) {
  if (theme.imageOverlayMode === "none") return "";
  if (theme.imageOverlayMode === "gradient") {
    return gradient(
      theme.imageOverlayGradientAngle,
      theme.imageOverlayGradientFrom,
      theme.imageOverlayGradientFromOpacity,
      theme.imageOverlayGradientTo,
      theme.imageOverlayGradientToOpacity,
    );
  }
  return withOpacity(theme.imageOverlayColor, theme.imageOverlayOpacity);
}

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
              ? withOpacity(theme.backgroundColor, theme.backgroundColorOpacity)
              : gradient(
                  theme.gradientAngle,
                  theme.gradientFrom,
                  theme.gradientFromOpacity,
                  theme.gradientTo,
                  theme.gradientToOpacity,
                ),
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
            style={{ background: imageOverlay(theme) }}
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
  // Infer the mode for layouts saved before per-item background modes existed.
  const backgroundMode =
    block.backgroundMode === "transparent" && block.backgroundImageUrl
      ? "image"
      : block.backgroundMode === "transparent" && block.backgroundColor
        ? "solid"
        : block.backgroundMode;
  const itemBackground =
    backgroundMode === "image" && block.backgroundImageUrl
      ? {
          backgroundImage: [imageOverlay(block), `url(${JSON.stringify(block.backgroundImageUrl)})`]
            .filter(Boolean)
            .join(", "),
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }
      : backgroundMode === "gradient"
        ? {
            backgroundImage: gradient(
              block.backgroundGradientAngle,
              block.backgroundGradientFrom,
              block.backgroundGradientFromOpacity,
              block.backgroundGradientTo,
              block.backgroundGradientToOpacity,
            ),
          }
        : backgroundMode === "solid" && block.backgroundColor
          ? { backgroundColor: withOpacity(block.backgroundColor, block.backgroundColorOpacity) }
          : {};
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
        ...(block.color ? { color: withOpacity(block.color, block.colorOpacity) } : {}),
        ...itemBackground,
      }}
    >
      {children}
    </div>
  );
}

function useWidgetData<T>(query: string | null, authorization?: string) {
  const local = useContext(LocalWidgetData);
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!query || local) return;
    let cancelled = false;
    const controllers = new Set<AbortController>();
    const load = async () => {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch("/api/public/widget-data?" + query, {
          ...(authorization ? { headers: { authorization: "Bearer " + authorization } } : {}),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("widget-data");
        const payload = (await response.json()) as T;
        if (!cancelled) {
          setData(payload);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
        controllers.delete(controller);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      for (const controller of controllers) controller.abort();
      window.clearInterval(interval);
    };
  }, [query, authorization, local]);

  return local ? { data: local.payload as T | null, failed: local.payload === null } : { data, failed };
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
  const localClock = useContext(LocalWidgetData)?.now;
  const [now, setNow] = useState(() => new Date(localClock?.() ?? Date.now()));
  const layout = resolveWidgetLayout("clock", config.layout as WidgetLayout | undefined);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date(localClock?.() ?? Date.now())), 1000);
    return () => window.clearInterval(interval);
  }, [localClock]);

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
  interactiveBackground?: {
    condition: WeatherVideoCondition;
    isDay: boolean;
    videoUrl: string;
  };
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
  videoUrl,
}: {
  kind: SceneKind;
  theme: WidgetTheme;
  accent: string;
  videoUrl?: string;
}) {
  const animated = theme.animations;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const gradients: Record<SceneKind, string> = {
    clear: "linear-gradient(165deg, #0B4F8A 0%, #0A2540 55%, #04101F 100%)",
    cloudy: "linear-gradient(165deg, #3A4A5C 0%, #1D2731 60%, #0C1116 100%)",
    fog: "linear-gradient(165deg, #4A5560 0%, #262E36 60%, #10151A 100%)",
    rain: "linear-gradient(165deg, #1F3A56 0%, #14212F 60%, #070C12 100%)",
    storm: "linear-gradient(165deg, #1A2233 0%, #10141F 60%, #04060A 100%)",
    snow: "linear-gradient(165deg, #5B6F82 0%, #2C3A47 60%, #131A21 100%)",
  };

  useEffect(() => {
    setVideoReady(false);
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;

    // Android WebView can ignore the autoplay attribute when the element is
    // created after a widget refresh. Set both muted flags and explicitly
    // request playback; until it really starts the video remains invisible,
    // so its native play artwork can never appear on the TV.
    video.muted = true;
    video.defaultMuted = true;
    const attemptPlayback = () => {
      video.muted = true;
      void video
        .play()
        .then(() => setVideoReady(true))
        .catch(() => setVideoReady(false));
    };
    video.addEventListener("loadeddata", attemptPlayback);
    video.addEventListener("canplay", attemptPlayback);
    attemptPlayback();
    return () => {
      video.removeEventListener("loadeddata", attemptPlayback);
      video.removeEventListener("canplay", attemptPlayback);
      video.pause();
    };
  }, [videoUrl]);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0" style={{ background: gradients[kind] }} />
      {(!videoUrl || !videoReady) && (
        <>
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
                style={{
                  animation: animated ? "mdi-flash 9s linear infinite" : undefined,
                  opacity: 0,
                }}
              />
            </>
          ) : null}
          {kind === "snow" ? (
            <>
              <CloudLayer animated={animated} />
              <SnowLayer animated={animated} />
            </>
          ) : null}
        </>
      )}
      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            key={videoUrl}
            className="absolute inset-0 size-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            preload="auto"
            onPlaying={() => setVideoReady(true)}
            onError={() => setVideoReady(false)}
            style={{
              opacity: videoReady ? 1 : 0,
              pointerEvents: "none",
              transition: "opacity 220ms ease-out",
            }}
          >
            <source src={videoUrl} />
          </video>
          {videoReady ? <div className="absolute inset-0 bg-black/20" /> : null}
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
  const place = config.placeLabel?.trim() ? config.placeLabel.trim() : city.label;
  const coords =
    typeof config.latitude === "number" && typeof config.longitude === "number"
      ? `&lat=${config.latitude}&lon=${config.longitude}&label=${encodeURIComponent(place)}`
      : "";
  const { data, failed } = useWidgetData<WeatherPayload>(
    `type=weather&cityId=${encodeURIComponent(config.cityId)}${coords}`,
  );
  const layout = resolveWidgetLayout("weather", config.layout as WidgetLayout | undefined);

  const look = weatherLook(data?.current.code ?? null);
  const interactiveVideo =
    config.backgroundMode === "interactiveVideo" ? data?.interactiveBackground?.videoUrl : "";
  const weatherTheme = interactiveVideo ? { ...theme, background: "scene" as const } : theme;

  return (
    <Shell
      accent={accent}
      theme={weatherTheme}
      credit={data?.credit ?? "Open-Meteo · CC BY 4.0"}
      scene={
        <WeatherScene
          kind={look.scene}
          theme={weatherTheme}
          accent={accent}
          videoUrl={interactiveVideo}
        />
      }
    >
      {failed && !data ? (
        <p className="absolute left-[6%] top-[46%] text-[4cqh] opacity-60">
          Clima indisponível agora.
        </p>
      ) : (
        <>
          <Block block={layout.city} className="uppercase tracking-[0.28em] opacity-70">
            {data?.city ?? place}
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
  const layout = resolveWidgetLayout("currency", config.layout as WidgetLayout | undefined);

  return (
    <Shell
      accent={accent}
      theme={theme}
      credit={data?.credit ?? "AwesomeAPI"}
      scene={<WeatherScene kind="cloudy" theme={theme} accent={accent} />}
    >
      <Block block={layout.title} className="uppercase tracking-[0.32em] opacity-60">
        Cotações de hoje
      </Block>
      {failed && !data ? (
        <p className="absolute left-[10%] top-[45%] text-[4cqh] opacity-60">
          Cotações indisponíveis agora.
        </p>
      ) : (
        <Block block={layout.quotes}>
          <div className="space-y-[0.5em]">
            {(data?.quotes ?? []).map((quote) => (
              <div
                key={quote.code}
                className="flex items-baseline justify-between rounded-[0.4em] bg-black/30 px-[0.7em] py-[0.4em]"
              >
                <span className="opacity-85">{quote.name || quote.code}</span>
                <span className="font-display text-[1.4em] font-semibold tabular-nums">
                  R$ {quote.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span
                  className="text-[0.76em] tabular-nums"
                  style={{ color: quote.changePct >= 0 ? "#4ade80" : "#f87171" }}
                >
                  {quote.changePct >= 0 ? "▲" : "▼"} {Math.abs(quote.changePct).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </Block>
      )}
    </Shell>
  );
}

/* --------------------------------------------------------------- lottery */

type LotteryPayload = {
  source: string;
  sourceUrl: string;
  lastCheckedAt: string | null;
  stale: boolean;
  results: NormalizedLotteryResult[];
};

function money(value: number | null) {
  if (value == null || value <= 0) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function LotteryBalls({
  values,
  accent,
  placeholder,
}: {
  values: string[];
  accent: string;
  placeholder: LotteryGameTheme;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.35em",
      }}
    >
      {values.map((value, index) => (
        <span
          key={String(value) + "-" + index}
          style={{
            display: "inline-flex",
            width: "1.55em",
            height: "1.55em",
            minWidth: "1.55em",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "9999px",
            padding: "0.08em",
            color: withOpacity(placeholder.placeholderTextColor, placeholder.placeholderTextOpacity),
            WebkitTextFillColor: withOpacity(placeholder.placeholderTextColor, placeholder.placeholderTextOpacity),
            backgroundColor: placeholder.placeholderBackground
              ? withOpacity(placeholder.placeholderBackground, placeholder.placeholderBackgroundOpacity)
              : "transparent",
            border: placeholder.placeholderBorderColor
              ? `0.08em solid ${withOpacity(placeholder.placeholderBorderColor, placeholder.placeholderBorderOpacity)}`
              : "none",
            fontFamily: "Arial, sans-serif",
            fontSize: "0.82em",
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: "0 0.15em 0.65em " + accent + "44",
          }}
        >
          {String(value)}
        </span>
      ))}
    </div>
  );
}
function LotteryResultBody({
  result,
  accent,
  placeholder,
  federalStyle = "list",
}: {
  result: NormalizedLotteryResult;
  accent: string;
  placeholder: LotteryGameTheme;
  federalStyle?: "list" | "receipt";
}) {
  if (result.gameId === "federal") {
    if (federalStyle === "receipt") {
      return (
        <div className="mx-auto max-w-[96%] overflow-hidden rounded-[0.18em] bg-[#fffdf4] text-[#14213d] shadow-[0_0.35em_1.2em_rgba(0,0,0,0.38)]">
          <div className="flex items-center justify-between border-b-[0.08em] border-[#1677bd] bg-white px-[0.45em] py-[0.28em]">
            <div className="font-display text-[0.5em] font-black tracking-[-0.04em] text-[#1677bd]">
              LOTERIAS <span className="text-[#ef7d00]">CAIXA</span>
            </div>
            <div className="text-right font-mono text-[0.2em] font-bold uppercase tracking-[0.12em]">
              Resultado Federal
              <span className="block font-normal opacity-60">Concurso {result.contestNumber}</span>
            </div>
          </div>
          <div className="space-y-[0.12em] px-[0.45em] py-[0.28em] font-mono">
            {result.federalPrizes.map((prize) => (
              <div
                key={prize.ticket}
                className="grid grid-cols-[4.4em_1fr_auto] items-baseline gap-[0.28em] border-b border-dashed border-[#14213d]/25 py-[0.11em] last:border-0"
              >
                <span className="text-[0.28em] font-bold uppercase">{prize.label}</span>
                <strong className="text-[0.78em] tracking-[0.08em]">{prize.ticket}</strong>
                <span className="text-[0.25em] font-bold text-[#1677bd]">{money(prize.value)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-[#14213d]/15 bg-[#f4f0df] px-[0.7em] py-[0.22em] font-mono text-[0.17em] uppercase tracking-[0.08em]">
            <span>{result.drawDate}</span>
            <strong>Resultado informativo • não é comprovante de aposta</strong>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-[0.22em] text-left leading-none">
        {result.federalPrizes.map((prize) => (
          <div
            key={prize.ticket}
            className="grid w-full grid-cols-[minmax(3.8em,0.85fr)_minmax(0,1.15fr)] items-center gap-[0.32em] rounded-[0.22em] border border-white/10 bg-black/25 px-[0.38em] py-[0.22em]"
          >
            <div className="flex min-w-0 flex-col items-center justify-center gap-[0.16em] self-stretch text-center">
              <div
                className="text-[0.34em] font-semibold uppercase"
                style={{
                  color: placeholder.prizeLabelColor
                    ? withOpacity(placeholder.prizeLabelColor, placeholder.prizeLabelOpacity)
                    : undefined,
                  opacity: placeholder.prizeLabelColor ? undefined : 0.75,
                }}
              >
                {prize.label}
              </div>
              <div
                className="whitespace-nowrap text-[0.3em] font-semibold leading-none"
                style={{
                  color: withOpacity(
                    placeholder.prizeValueColor || accent,
                    placeholder.prizeValueColor ? placeholder.prizeValueOpacity : 100,
                  ),
                }}
              >
                {money(prize.value)}
              </div>
            </div>
            <div className="min-w-0 self-center text-center font-display text-[1.05em] font-bold tracking-[0.04em]">
              {prize.ticket}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (result.gameId === "loteca") {
    return (
      <div className="grid grid-cols-2 gap-x-[1em] gap-y-[0.18em] text-left text-[0.48em] leading-tight">
        {result.matches.map((match) => (
          <div
            key={match.order}
            className="flex items-center gap-[0.35em] border-b border-white/10 py-[0.18em]"
          >
            <strong className="w-[1.6em]" style={{ color: accent }}>
              {match.order}
            </strong>
            <span className="min-w-0 flex-1 truncate text-right">{match.home}</span>
            <strong>
              {match.homeScore} × {match.awayScore}
            </strong>
            <span className="min-w-0 flex-1 truncate">{match.away}</span>
          </div>
        ))}
      </div>
    );
  }
  if (result.gameId === "duplasena") {
    return (
      <div className="space-y-[0.55em] text-[0.75em]">
        <div>
          <span className="mb-[0.25em] block text-[0.35em] uppercase tracking-[0.2em] opacity-65">
            1º sorteio
          </span>
          <LotteryBalls values={result.numbers} accent={accent} placeholder={placeholder} />
        </div>
        <div>
          <span className="mb-[0.25em] block text-[0.35em] uppercase tracking-[0.2em] opacity-65">
            2º sorteio
          </span>
          <LotteryBalls values={result.secondDraw} accent={accent} placeholder={placeholder} />
        </div>
      </div>
    );
  }
  if (result.gameId === "supersete") {
    return (
      <div className="flex justify-center gap-[0.25em]">
        {result.numbers.map((value, index) => (
          <div key={index} className="rounded-[0.3em] bg-white/10 px-[0.34em] py-[0.25em]">
            <span className="block text-[0.25em] uppercase opacity-55">Col. {index + 1}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    );
  }
  return <LotteryBalls values={result.numbers} accent={accent} placeholder={placeholder} />;
}

function LotteryWidget({
  config,
  theme,
  accent,
  onReady,
}: {
  config: Extract<WidgetConfig, { type: "lottery" }>;
  theme: WidgetTheme;
  accent: string;
  onReady?: () => void;
}) {
  const query = useMemo(
    () => `type=lottery&games=${encodeURIComponent(config.gameIds.join(","))}`,
    [config.gameIds],
  );
  const { data, failed } = useWidgetData<LotteryPayload>(query);
  const [index, setIndex] = useState(0);
  const results = data?.results ?? [];

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    if (results.length > 0 || failed) onReady?.();
  }, [failed, onReady, results.length]);
  useEffect(() => {
    if (results.length <= 1) return;
    const interval = window.setInterval(
      () => setIndex((current) => (current + 1) % results.length),
      config.rotateSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [config.rotateSeconds, results.length]);

  const result = results[Math.min(index, Math.max(0, results.length - 1))];
  const layout = resolveLotteryWidgetLayout(result?.gameId, config.gameLayouts, config.layout);
  const resultTheme = resolveLotteryGameTheme(result?.gameId, theme, config.gameThemes);
  const resultAccent = resultTheme.accentColor || accent;
  const specialDetails = result
    ? [
        result.luckyMonth ? `Mês da Sorte: ${result.luckyMonth}` : null,
        result.heartTeam ? `Time do Coração: ${result.heartTeam}` : null,
        result.clovers.length ? `Trevos: ${result.clovers.join(" • ")}` : null,
      ].filter(Boolean)
    : [];
  const estimate = result ? money(result.nextEstimate) : null;
  const lastCheckedLabel = data?.lastCheckedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(data.lastCheckedAt),
      )
    : result?.drawDate;

  return (
    <Shell
      accent={resultAccent}
      theme={resultTheme}
      scene={<ClearScene accent={resultAccent} theme={resultTheme} />}
    >
      {!result ? (
        <p className="absolute inset-x-[8%] top-[45%] text-center text-[4cqh] opacity-65">
          {failed ? "Resultados temporariamente indisponíveis." : "Carregando resultados oficiais…"}
        </p>
      ) : (
        <>
          <Block block={layout.game} className="font-display font-bold">
            {result.gameName}
          </Block>
          <Block block={layout.contest} className="uppercase tracking-[0.18em] opacity-70">
            Concurso {result.contestNumber} • {result.drawDate}
          </Block>
          <Block block={layout.result} className="font-display leading-tight">
            <LotteryResultBody
              result={result}
              accent={resultAccent}
              placeholder={resultTheme}
              federalStyle={config.federalStyle}
            />
          </Block>
          <Block block={layout.details}>
            {specialDetails.length ? specialDetails.join("  •  ") : null}
          </Block>
          <Block block={layout.status}>
            <div className="flex flex-wrap items-center justify-center gap-[0.7em]">
              {result.accumulated ? (
                <strong>ACUMULOU</strong>
              ) : (
                <span>Resultado confirmado</span>
              )}
              {estimate ? (
                <span>
                  Próximo prêmio estimado: <strong>{estimate}</strong>
                </span>
              ) : null}
              {result.nextDate ? <span>Próximo concurso: {result.nextDate}</span> : null}
            </div>
          </Block>
          <Block block={layout.source} className="uppercase tracking-[0.18em] opacity-55">
            Resultados oficiais — fonte: Loterias CAIXA
            {data?.stale ? (
              <span className="ml-[1em] normal-case tracking-normal">
                Atualização temporariamente indisponível — último resultado confirmado em{" "}
                {lastCheckedLabel}.
              </span>
            ) : null}
          </Block>
        </>
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
  onReady,
  deviceToken,
}: {
  config: Extract<WidgetConfig, { type: "news" }>;
  theme: WidgetTheme;
  accent: string;
  onReady?: () => void;
  deviceToken?: string | null;
}) {
  const { data, failed } = useWidgetData<NewsPayload>(
    "type=news&feedId=" + encodeURIComponent(config.feedId),
    deviceToken ?? undefined,
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
    return list;
  }, [data]);

  const [index, setIndex] = useState(0);
  const [batchStart, setBatchStart] = useState(0);
  const localSnapshot = useContext(LocalWidgetData);
  const [imageStates, setImageStates] = useState<Record<string, "ready" | "failed">>(() =>
    localSnapshot?.imagesReady ? Object.fromEntries(items.filter((item) => item.image).map((item) => [item.image!, "ready"])) : {});
  const cursorKey = `mdi-news-cursor:${config.feedId}:${config.headlines}`;
  const initializedItemsKey = useRef("");

  // Do not put an article into rotation until every image it uses is ready.
  useEffect(() => {
    if (localSnapshot?.imagesReady) {
      setImageStates(Object.fromEntries(items.filter((item) => item.image).map((item) => [item.image!, "ready"])));
      return;
    }
    const urls = [
      ...new Set(items.map((item) => item.image).filter((url): url is string => Boolean(url))),
    ];
    setImageStates({});
    if (!urls.length) return;
    let cancelled = false;
    for (const url of urls) {
      const image = new window.Image();
      image.onload = () => {
        if (!cancelled) setImageStates((current) => ({ ...current, [url]: "ready" }));
      };
      image.onerror = () => {
        if (!cancelled) setImageStates((current) => ({ ...current, [url]: "failed" }));
      };
      image.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [items, localSnapshot?.imagesReady]);

  const renderableItems = useMemo(
    () => items.filter((item) => !item.image || imageStates[item.image] === "ready"),
    [imageStates, items],
  );
  const imagesPending = items.some((item) => Boolean(item.image && !imageStates[item.image]));
  const imagesUnavailable = items.length > 0 && !imagesPending && renderableItems.length === 0;

  useEffect(() => {
    if (renderableItems.length > 0 || failed || imagesUnavailable) onReady?.();
  }, [failed, imagesUnavailable, onReady, renderableItems.length]);

  useEffect(() => {
    setIndex(0);
    setBatchStart(0);
    initializedItemsKey.current = "";
  }, [config.feedId, config.headlines]);

  const itemsKey = renderableItems
    .map((item) => `${item.title}|${item.image ?? ""}`)
    .join("\u0001");
  useEffect(() => {
    if (!renderableItems.length || initializedItemsKey.current === itemsKey) return;
    initializedItemsKey.current = itemsKey;
    let stored = 0;
    try {
      stored = Number(window.localStorage.getItem(cursorKey) ?? 0);
    } catch {
      stored = 0;
    }
    const start = Number.isFinite(stored)
      ? ((Math.max(0, Math.trunc(stored)) % renderableItems.length) + renderableItems.length) %
        renderableItems.length
      : 0;
    setBatchStart(start);
    setIndex(0);
    try {
      window.localStorage.setItem(
        cursorKey,
        String((start + Math.max(1, config.headlines)) % renderableItems.length),
      );
    } catch {
      // Private browsing or a restricted WebView may reject localStorage.
    }
  }, [config.headlines, cursorKey, itemsKey, renderableItems.length]);

  const batchItems = useMemo(() => {
    if (!renderableItems.length) return [];
    return Array.from(
      { length: Math.min(config.headlines, renderableItems.length) },
      (_, offset) => renderableItems[(batchStart + offset) % renderableItems.length]!,
    );
  }, [batchStart, config.headlines, renderableItems]);

  useEffect(() => {
    if (!config.oneAtATime || batchItems.length <= 1) return;
    const interval = window.setInterval(
      () => setIndex((current) => Math.min(current + 1, batchItems.length - 1)),
      config.rotateSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [batchItems.length, config.oneAtATime, config.rotateSeconds]);

  const current = batchItems[Math.min(index, Math.max(batchItems.length - 1, 0))];
  const layout = resolveWidgetLayout("news", config.layout as WidgetLayout | undefined);
  const imageMode = !config.showImage ? "hidden" : (config.imageMode ?? "background");
  const heroImage = imageMode === "background" ? (current?.image ?? null) : null;

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
    <Shell accent={accent} theme={theme} credit={data?.credit ?? null} scene={sceneForNews}>
      <Block block={layout.source}>
        <div className="flex items-center gap-[0.6em]">
          <span
            className="rounded-full px-[0.8em] py-[0.35em] font-semibold uppercase tracking-[0.24em]"
            style={{ backgroundColor: accent, color: "#06080B" }}
          >
            {data?.source ?? "Notícias"}
          </span>
          {config.oneAtATime && renderableItems.length > 1 ? (
            <span className="tabular-nums opacity-55">
              {((batchStart + index) % renderableItems.length) + 1}/{renderableItems.length}
            </span>
          ) : null}
        </div>
      </Block>

      {failed && !data ? (
        <p className="absolute left-[6%] top-[45%] text-[4cqh] opacity-60">
          Notícias indisponíveis agora.
        </p>
      ) : imagesPending && renderableItems.length === 0 ? (
        <p className="absolute inset-x-[6%] top-[45%] text-center text-[4cqh] opacity-60">
          Carregando imagens das notícias…
        </p>
      ) : imagesUnavailable ? (
        <p className="absolute inset-x-[6%] top-[45%] text-center text-[4cqh] opacity-60">
          Notícias sem imagem disponível no momento.
        </p>
      ) : config.oneAtATime ? (
        <>
          {imageMode === "block" && current?.image ? (
            <Block block={layout.image} key={`image-${current.image}`}>
              <img
                src={current.image}
                alt=""
                className="size-full rounded-[1cqh] object-cover"
                style={
                  theme.animations && theme.kenBurns
                    ? { animation: "mdi-kenburns 24s ease-in-out infinite alternate" }
                    : undefined
                }
              />
            </Block>
          ) : null}
          <Block
            block={layout.headline}
            className="font-display font-semibold leading-[1.12]"
            style={{
              textShadow: "0 0.6cqh 2.4cqh rgba(0,0,0,0.6)",
              animation: theme.animations ? "mdi-news-in 0.6s ease-out both" : undefined,
            }}
            key={`headline-${index}-${current?.title ?? ""}`}
          >
            {current?.title ?? "Sem manchetes agora."}
          </Block>
          {config.showSummary && current?.summary ? (
            <Block
              block={layout.summary}
              className="leading-[1.4] opacity-80"
              style={{
                animation: theme.animations ? "mdi-news-in 0.7s ease-out 0.12s both" : undefined,
              }}
              key={`summary-${index}`}
            >
              {current.summary.slice(0, config.summaryMaxChars ?? 240)}
            </Block>
          ) : null}
          {batchItems.length > 1 ? (
            <Block block={layout.progress}>
              <div className="h-[0.25em] w-full overflow-hidden rounded-full bg-white/20">
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
            </Block>
          ) : null}
        </>
      ) : (
        <Block
          block={layout.headline}
          style={{ fontSize: `${(layout.summary?.size ?? 3.6) * 1.05}cqh` }}
        >
          <ul className="space-y-[0.5em]">
            {batchItems.map((item, position) => (
              <li key={`${position}-${item.title.slice(0, 12)}`} className="flex gap-[0.5em]">
                <span className="font-display font-semibold" style={{ color: accent }}>
                  {position + 1}
                </span>
                <span className="leading-snug opacity-90">{item.title}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </Shell>
  );
}
