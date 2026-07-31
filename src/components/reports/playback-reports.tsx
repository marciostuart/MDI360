import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Radio } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getNowPlaying, getPlaybackReport, type ReportRow } from "@/lib/reports/reports.functions";

const RANGES = [
  { days: 1, label: "24 horas" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
];

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}

function ReportTable({ rows, header }: { rows: ReportRow[]; header: string }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma exibição registrada neste período.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{header}</TableHead>
          <TableHead className="w-32 text-right">Exibições</TableHead>
          <TableHead className="w-40 text-right">Tempo em tela</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">{row.plays}</TableCell>
            <TableCell className="text-right tabular-nums">{formatDuration(row.seconds)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function PlaybackReports() {
  const [days, setDays] = useState(7);
  const reportFn = useServerFn(getPlaybackReport);
  const nowFn = useServerFn(getNowPlaying);

  const report = useQuery({
    queryKey: ["playback-report", days],
    queryFn: () => reportFn({ data: { days } }),
  });

  const now = useQuery({
    queryKey: ["now-playing"],
    queryFn: () => nowFn({}),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4 text-primary" />
            No ar agora
          </CardTitle>
          {now.isFetching ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </CardHeader>
        <CardContent>
          {(now.data?.items.length ?? 0) === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma tela vinculada ainda.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {now.data?.items.map((item) => (
                <div key={item.deviceId} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{item.deviceName}</p>
                    <Badge variant={item.online ? "default" : "secondary"}>
                      {item.online ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <p className="mt-2 truncate text-sm">
                    {item.mediaName ?? "Sem exibição registrada"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.playlistName ? `Playlist: ${item.playlistName}` : "Sem playlist ativa"}
                    {item.startedAt
                      ? ` · desde ${new Date(item.startedAt).toLocaleTimeString("pt-BR")}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Relatório de exibição</CardTitle>
          <div className="flex gap-2">
            {RANGES.map((range) => (
              <Button
                key={range.days}
                size="sm"
                variant={days === range.days ? "default" : "outline"}
                onClick={() => setDays(range.days)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {report.isPending ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Exibições</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {report.data?.totalPlays ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tempo total em tela
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatDuration(report.data?.totalSeconds ?? 0)}
                  </p>
                </div>
              </div>

              <Tabs defaultValue="device">
                <TabsList>
                  <TabsTrigger value="device">Por TV</TabsTrigger>
                  <TabsTrigger value="playlist">Por playlist</TabsTrigger>
                  <TabsTrigger value="media">Por arquivo</TabsTrigger>
                </TabsList>
                <TabsContent value="device" className="mt-4">
                  <ReportTable rows={report.data?.byDevice ?? []} header="Tela" />
                </TabsContent>
                <TabsContent value="playlist" className="mt-4">
                  <ReportTable rows={report.data?.byPlaylist ?? []} header="Playlist" />
                </TabsContent>
                <TabsContent value="media" className="mt-4">
                  <ReportTable rows={report.data?.byMedia ?? []} header="Arquivo" />
                </TabsContent>
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
