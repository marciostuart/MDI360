import { useEffect, useMemo, useState } from "react";

import type { WidgetConfig } from "@/lib/widgets/catalog";
import { getWeatherCity } from "@/lib/widgets/catalog";

/**
 * Renders an information widget full screen. All data comes from the public
 * proxy at /api/public/widget-data, refreshed every 5 minutes, so the TV never
 * talks to third-party hosts directly and licences stay attributed on screen.
 */
export function WidgetView({
  config,
  accentColor,
}: {
  config: WidgetConfig;
  accentColor?: string | null;
}) {
  const accent = accentColor || "#ffffff";

  if (config.type === "clock") return <ClockWidget config={config} accent={accent} />;
  if (config.type === "weather") return <WeatherWidget config={config} accent={accent} />;
  if (config.type === "currency") return <CurrencyWidget config={config} accent={accent} />;
  return <NewsWidget config={config} accent={accent} />;
}

function Shell({
  children,
  credit,
  accent,
}: {
  children: React.ReactNode;
  credit?: string | null;
  accent: string;
}) {
  return (
    <div className="relative grid size-full min-h-full place-items-center bg-black px-[6%] py-[6%] text-white">
      <div className="w-full text-center">{children}</div>
      <div
        className="absolute inset-x-0 bottom-0 h-[0.6cqh]"
        style={{ backgroundColor: accent }}
      />
      {credit ? (
        <p className="absolute bottom-[2cqh] right-[3cqw] text-[1.1cqh] uppercase tracking-widest text-white/40">
          {credit}
        </p>
      ) : null}
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

function ClockWidget({
  config,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "clock" }>;
  accent: string;
}) {
  const [now, setNow] = useState(() => new Date());
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
    <Shell accent={accent}>
      <p className="font-display text-[22cqh] font-semibold leading-none tabular-nums">{time}</p>
      {config.showDate ? (
        <p className="mt-[3cqh] text-[4cqh] capitalize text-white/70">{date}</p>
      ) : null}
    </Shell>
  );
}

type WeatherPayload = {
  city: string;
  credit: string;
  current: { temperature: number | null; humidity: number | null; code: number | null };
  daily: { date: string; code: number | null; max: number | null; min: number | null }[];
};

const WEATHER_LABELS: { codes: number[]; label: string; icon: string }[] = [
  { codes: [0], label: "Céu limpo", icon: "☀️" },
  { codes: [1, 2], label: "Parcialmente nublado", icon: "🌤️" },
  { codes: [3], label: "Nublado", icon: "☁️" },
  { codes: [45, 48], label: "Nevoeiro", icon: "🌫️" },
  { codes: [51, 53, 55, 56, 57], label: "Garoa", icon: "🌦️" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: "Chuva", icon: "🌧️" },
  { codes: [95, 96, 99], label: "Tempestade", icon: "⛈️" },
];

function weatherLook(code: number | null) {
  const match = WEATHER_LABELS.find((entry) => code !== null && entry.codes.includes(code));
  return match ?? { label: "Tempo estável", icon: "🌡️" };
}

function WeatherWidget({
  config,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "weather" }>;
  accent: string;
}) {
  const city = getWeatherCity(config.cityId);
  const { data, failed } = useWidgetData<WeatherPayload>(
    `type=weather&cityId=${encodeURIComponent(config.cityId)}`,
  );

  const look = weatherLook(data?.current.code ?? null);

  return (
    <Shell accent={accent} credit={data?.credit ?? "Open-Meteo · CC BY 4.0"}>
      <p className="text-[4cqh] text-white/60">{data?.city ?? city.label}</p>
      {failed && !data ? (
        <p className="mt-[4cqh] text-[4cqh] text-white/50">Clima indisponível agora.</p>
      ) : (
        <>
          <p className="mt-[2cqh] text-[14cqh] leading-none">{look.icon}</p>
          <p className="font-display text-[16cqh] font-semibold leading-none tabular-nums">
            {data?.current.temperature != null ? `${Math.round(data.current.temperature)}°` : "--"}
          </p>
          <p className="mt-[1cqh] text-[3.5cqh] text-white/70">{look.label}</p>
          <div className="mt-[5cqh] flex justify-center gap-[4cqw]">
            {(data?.daily ?? []).slice(1, 3).map((day) => (
              <div key={day.date} className="text-[2.6cqh] text-white/60">
                <p className="capitalize">
                  {new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(
                    new Date(`${day.date}T12:00:00`),
                  )}
                </p>
                <p className="mt-[0.5cqh] text-white/90">
                  {day.min != null ? Math.round(day.min) : "--"}° /{" "}
                  {day.max != null ? Math.round(day.max) : "--"}°
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}

type CurrencyPayload = {
  credit: string;
  quotes: { code: string; name: string; value: number; changePct: number }[];
};

function CurrencyWidget({
  config,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "currency" }>;
  accent: string;
}) {
  const query = useMemo(
    () => `type=currency&pairs=${encodeURIComponent(config.pairs.join(","))}`,
    [config.pairs],
  );
  const { data, failed } = useWidgetData<CurrencyPayload>(query);

  return (
    <Shell accent={accent} credit={data?.credit ?? "AwesomeAPI"}>
      <p className="text-[3.5cqh] uppercase tracking-[0.3em] text-white/50">Cotações de hoje</p>
      {failed && !data ? (
        <p className="mt-[4cqh] text-[4cqh] text-white/50">Cotações indisponíveis agora.</p>
      ) : (
        <div className="mx-auto mt-[4cqh] w-full max-w-[80%] space-y-[2.5cqh]">
          {(data?.quotes ?? []).map((quote) => (
            <div
              key={quote.code}
              className="flex items-baseline justify-between border-b border-white/10 pb-[1.5cqh]"
            >
              <span className="text-[4.5cqh] text-white/80">{quote.name || quote.code}</span>
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

type NewsPayload = { source: string; credit: string; headlines: string[] };

function NewsWidget({
  config,
  accent,
}: {
  config: Extract<WidgetConfig, { type: "news" }>;
  accent: string;
}) {
  const { data, failed } = useWidgetData<NewsPayload>(
    `type=news&feedId=${encodeURIComponent(config.feedId)}`,
  );
  const headlines = (data?.headlines ?? []).slice(0, config.headlines);

  return (
    <Shell accent={accent} credit={data?.credit ?? null}>
      <p className="text-[3.5cqh] uppercase tracking-[0.3em] text-white/50">
        {data?.source ?? "Notícias"}
      </p>
      {failed && !data ? (
        <p className="mt-[4cqh] text-[4cqh] text-white/50">Notícias indisponíveis agora.</p>
      ) : (
        <ul className="mx-auto mt-[4cqh] w-full max-w-[85%] space-y-[2.5cqh] text-left">
          {headlines.map((headline, index) => (
            <li key={`${index}-${headline.slice(0, 12)}`} className="flex gap-[1.5cqw]">
              <span className="font-display text-[4cqh] font-semibold" style={{ color: accent }}>
                {index + 1}
              </span>
              <span className="text-[3.6cqh] leading-snug text-white/90">{headline}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}