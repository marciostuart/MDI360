import { useQuery } from "@tanstack/react-query";
import { Activity, Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLiveTraffic, fetchTrafficSeries } from "@/lib/admin/platform.functions";
import { formatBytes } from "@/lib/admin/format";

/** Poll rates offered for the live chart. 1s is effectively real time. */
const RATES = [
  { ms: 1_000, label: "1s" },
  { ms: 2_000, label: "2s" },
  { ms: 5_000, label: "5s" },
  { ms: 15_000, label: "15s" },
  { ms: 0, label: "Pausado" },
];

const WINDOWS = [
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 48, label: "48h" },
  { hours: 168, label: "7d" },
];

/** Keeps the last ~4 minutes of samples on screen at 1s resolution. */
const MAX_POINTS = 240;

type LivePoint = { t: string; rps: number; kbps: number };

export function TrafficMonitor() {
  const [rateMs, setRateMs] = useState(2_000);
  const [hours, setHours] = useState(24);
  const [points, setPoints] = useState<LivePoint[]>([]);
  const previous = useRef<{ at: number; requests: number; bytes: number } | null>(null);

  const live = useQuery({
    queryKey: ["platform-traffic-live"],
    queryFn: () => fetchLiveTraffic(),
    refetchInterval: rateMs === 0 ? false : rateMs,
    refetchIntervalInBackground: false,
  });

  const history = useQuery({
    queryKey: ["platform-traffic", hours],
    queryFn: () => fetchTrafficSeries({ data: { hours } }),
    refetchInterval: 60_000,
  });

  // Each sample is a cumulative counter; the delta between two samples is the
  // real rate, which gives per-second resolution without any extra DB load.
  useEffect(() => {
    const sample = live.data;
    if (!sample) return;
    const last = previous.current;
    previous.current = { at: sample.at, requests: sample.requests, bytes: sample.bytes };
    if (!last || sample.at <= last.at) return;
    // Server restarted (counters went backwards): drop the stale baseline.
    if (sample.requests < last.requests || sample.bytes < last.bytes) return;
    const seconds = (sample.at - last.at) / 1000;
    const point: LivePoint = {
      t: new Date(sample.at).toLocaleTimeString("pt-BR", { hour12: false }),
      rps: Number(((sample.requests - last.requests) / seconds).toFixed(2)),
      kbps: Number(((sample.bytes - last.bytes) / seconds / 1024).toFixed(1)),
    };
    setPoints((current) => [...current, point].slice(-MAX_POINTS));
  }, [live.data]);

  const latest = points[points.length - 1];
  const peak = points.reduce((max, point) => Math.max(max, point.rps), 0);

  const historyData = (history.data ?? []).map((point) => ({
    hora: new Date(point.bucket).toLocaleString("pt-BR", { day: "2-digit", hour: "2-digit" }),
    requisicoes: point.requests,
    trafegoMb: Number(((point.bytesIn + point.bytesOut) / 1024 / 1024).toFixed(2)),
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                Carga ao vivo
              </CardTitle>
              <CardDescription>
                Medição direta na memória do servidor — nenhuma consulta ao banco, então pode ficar
                em 1 segundo sem aumentar a carga.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RATES.map((rate) => (
                <Button
                  key={rate.ms}
                  size="sm"
                  variant={rateMs === rate.ms ? "default" : "outline"}
                  onClick={() => setRateMs(rate.ms)}
                >
                  {rate.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <span className="tabular-nums">
              <strong className="font-display text-2xl">{latest?.rps.toFixed(2) ?? "—"}</strong>{" "}
              <span className="text-muted-foreground">req/s</span>
            </span>
            <span className="tabular-nums">
              <strong className="font-display text-2xl">
                {latest ? formatBytes(latest.kbps * 1024) : "—"}
              </strong>{" "}
              <span className="text-muted-foreground">/s</span>
            </span>
            <span className="text-muted-foreground tabular-nums">pico {peak.toFixed(2)} req/s</span>
          </div>
        </CardHeader>
        <CardContent className="h-64">
          {points.length < 2 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              {rateMs === 0 ? "Monitoramento pausado." : "Coletando amostras…"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rps"
                  name="req/s"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="kbps"
                  name="KB/s"
                  stroke="var(--color-chart-2, #22c55e)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="size-4 text-primary" />
                Histórico por hora
              </CardTitle>
              <CardDescription>
                Requisições e volume trafegado — use para decidir a hora de escalar a VPS.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WINDOWS.map((window) => (
                <Button
                  key={window.hours}
                  size="sm"
                  variant={hours === window.hours ? "default" : "outline"}
                  onClick={() => setHours(window.hours)}
                >
                  {window.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-64">
          {historyData.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Coletando as primeiras medições…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="req" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="hora" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="requisicoes"
                  stroke="var(--color-primary)"
                  fill="url(#req)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="trafegoMb"
                  stroke="var(--color-chart-2, #22c55e)"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
