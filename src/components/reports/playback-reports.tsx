import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileDown, Loader2, Radio, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getNowPlaying,
  queryPlaybackReport,
  type ReportGroup,
  type ReportRow,
} from "@/lib/reports/reports.functions";

const PAGE_SIZE = 25;

/** Valor para <input type="datetime-local">, no fuso local do lojista. */
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  const reportFn = useServerFn(queryPlaybackReport);
  const nowFn = useServerFn(getNowPlaying);

  // Formulário: o relatório só é buscado quando o lojista clica em Buscar.
  const defaults = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    return { from: toLocalInput(start), to: toLocalInput(now) };
  }, []);
  const [group, setGroup] = useState<ReportGroup>("device");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<{
    group: ReportGroup;
    from: string;
    to: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  const report = useQuery({
    queryKey: ["playback-report", search, page],
    enabled: search !== null,
    queryFn: () =>
      reportFn({
        data: {
          group: search!.group,
          from: new Date(search!.from).toISOString(),
          to: new Date(search!.to).toISOString(),
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const runSearch = () => {
    if (!from || !to) {
      toast.error("Informe a data e hora inicial e final.");
      return;
    }
    if (new Date(from).getTime() >= new Date(to).getTime()) {
      toast.error("A data final deve ser posterior à inicial.");
      return;
    }
    setPage(1);
    setSearch({ group, from, to });
  };

  const groupLabel = (value: ReportGroup) => (value === "device" ? "TV" : "Arquivo");

  /** Exporta o período inteiro (não apenas a página em tela) para PDF. */
  const exportPdf = async () => {
    if (!search) return;
    setExporting(true);
    try {
      const full = await reportFn({
        data: {
          group: search.group,
          from: new Date(search.from).toISOString(),
          to: new Date(search.to).toISOString(),
          page: 1,
          pageSize: 200,
        },
      });

      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const period = `${new Date(search.from).toLocaleString("pt-BR")} a ${new Date(search.to).toLocaleString("pt-BR")}`;

      doc.setFontSize(16);
      doc.text("Relatório de exibição — MDI 360", 40, 46);
      doc.setFontSize(10);
      doc.text(`Agrupado por: ${groupLabel(search.group)}`, 40, 66);
      doc.text(`Período: ${period}`, 40, 82);
      doc.text(
        `Total: ${full.totalPlays} exibições · ${formatDuration(full.totalSeconds)} em tela`,
        40,
        98,
      );

      autoTable(doc, {
        startY: 116,
        head: [[groupLabel(search.group), "Exibições", "Tempo em tela"]],
        body: full.rows.map((row) => [row.label, String(row.plays), formatDuration(row.seconds)]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      });

      doc.save(`relatorio-exibicao-${search.group}.pdf`);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((report.data?.totalRows ?? 0) / PAGE_SIZE));

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
        <CardHeader>
          <CardTitle className="text-base">Relatório de exibição</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[200px_1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label>Relatório</Label>
              <Select value={group} onValueChange={(value) => setGroup(value as ReportGroup)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="device">Por TV</SelectItem>
                  <SelectItem value="media">Por arquivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-from">Início</Label>
              <Input
                id="report-from"
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-to">Fim</Label>
              <Input
                id="report-to"
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <Button onClick={runSearch} disabled={report.isFetching}>
              {report.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Buscar
            </Button>
          </div>

          {!search ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Escolha o tipo de relatório e o período, depois clique em Buscar.
            </p>
          ) : report.isPending ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : report.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {report.error instanceof Error ? report.error.message : "Falha ao buscar."}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {report.data?.totalRows ?? 0}{" "}
                  {search.group === "device" ? "telas" : "arquivos"} no período
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void exportPdf()}
                  disabled={exporting || (report.data?.totalRows ?? 0) === 0}
                >
                  {exporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileDown className="size-4" />
                  )}
                  Exportar PDF
                </Button>
              </div>

              <ReportTable
                rows={report.data?.rows ?? []}
                header={search.group === "device" ? "Tela" : "Arquivo"}
              />

              {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || report.isFetching}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || report.isFetching}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
