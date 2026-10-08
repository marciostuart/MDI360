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
  getReportBranding,
  getNowPlaying,
  listReportMediaAssets,
  queryPlaybackDailyReport,
  queryPlaybackReport,
  type ReportGroup,
  type ReportRow,
} from "@/lib/reports/reports.functions";

const PAGE_SIZE = 25;

function hexToRgb(value: string | null | undefined): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value ?? "");
  if (!match) return [132, 230, 72];
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function reportCode() {
  const time = Date.now().toString(36).toUpperCase().slice(-6);
  const random = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `MDI-${time}-${random}`;
}

function formatPdfDay(value: string) {
  const [, month = "", day = ""] = value.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${Number(day)}\n${months[Number(month) - 1] ?? month}`;
}

async function rasterizeLogo(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível para processar a logo.");
  context.drawImage(image, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

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
  const dailyReportFn = useServerFn(queryPlaybackDailyReport);
  const nowFn = useServerFn(getNowPlaying);
  const mediaOptionsFn = useServerFn(listReportMediaAssets);
  const reportBrandingFn = useServerFn(getReportBranding);

  // Formulário: o relatório só é buscado quando o lojista clica em Buscar.
  const defaults = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    return { from: toLocalInput(start), to: toLocalInput(now) };
  }, []);
  const [group, setGroup] = useState<ReportGroup>("device");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [mediaAssetId, setMediaAssetId] = useState("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<{
    group: ReportGroup;
    from: string;
    to: string;
    mediaAssetId: string | null;
    mediaLabel: string | null;
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
          mediaAssetId: search!.mediaAssetId,
        },
      }),
  });

  const mediaOptions = useQuery({
    queryKey: ["report-media-options"],
    queryFn: () => mediaOptionsFn({}),
    enabled: group === "media",
    staleTime: 60_000,
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
    const selectedMedia =
      group === "media" && mediaAssetId !== "all"
        ? (mediaOptions.data?.find((item) => item.id === mediaAssetId) ?? null)
        : null;
    setSearch({
      group,
      from,
      to,
      mediaAssetId: selectedMedia?.id ?? null,
      mediaLabel: selectedMedia?.name ?? null,
    });
  };

  const groupLabel = (value: ReportGroup) => (value === "device" ? "TV" : "Arquivo");

  /** Exporta o período inteiro (não apenas a página em tela) para PDF. */
  const exportPdf = async () => {
    if (!search) return;
    setExporting(true);
    try {
      const first = await reportFn({
        data: {
          group: search.group,
          from: new Date(search.from).toISOString(),
          to: new Date(search.to).toISOString(),
          page: 1,
          pageSize: 200,
          mediaAssetId: search.mediaAssetId,
        },
      });

      const rows = [...first.rows];
      const pages = Math.ceil(first.totalRows / first.pageSize);
      for (let currentPage = 2; currentPage <= pages; currentPage += 1) {
        const next = await reportFn({
          data: {
            group: search.group,
            from: new Date(search.from).toISOString(),
            to: new Date(search.to).toISOString(),
            page: currentPage,
            pageSize: 200,
            mediaAssetId: search.mediaAssetId,
          },
        });
        rows.push(...next.rows);
      }

      const [{ jsPDF }, { autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const requestedDays =
        Math.floor(
          (new Date(search.to).getTime() - new Date(search.from).getTime()) /
            (24 * 60 * 60 * 1000),
        ) + 1;
      const [branding, daily] = await Promise.all([
        reportBrandingFn({}),
        requestedDays <= 31
          ? dailyReportFn({
              data: {
                group: search.group,
                from: new Date(search.from).toISOString(),
                to: new Date(search.to).toISOString(),
                mediaAssetId: search.mediaAssetId,
              },
            })
          : Promise.resolve(null),
      ]);
      const generatedAt = new Date();
      const code = reportCode();
      const accent = hexToRgb(branding?.brandColor);
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const period = `${new Date(search.from).toLocaleString("pt-BR")} a ${new Date(search.to).toLocaleString("pt-BR")}`;

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(1.2);
      doc.line(0, 4, pageWidth, 4);

      if (branding?.logoDataUrl) {
        try {
          const logo = await rasterizeLogo(branding.logoDataUrl);
          const scale = Math.min(112 / logo.width, 50 / logo.height);
          const width = logo.width * scale;
          const height = logo.height * scale;
          doc.addImage(logo.dataUrl, "PNG", 30 + (112 - width) / 2, 23 + (50 - height) / 2, width, height);
        } catch {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(15);
          doc.text(branding.organizationName, 30, 51, { maxWidth: 112 });
        }
      } else {
        doc.setFillColor(...accent);
        doc.roundedRect(30, 28, 30, 30, 6, 6, "F");
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text((branding?.organizationName ?? "MDI").slice(0, 2).toUpperCase(), 45, 48, {
          align: "center",
        });
        doc.setFontSize(12);
        doc.text(branding?.organizationName ?? "MDI 360", 68, 46, { maxWidth: 75 });
      }

      doc.setFillColor(244, 246, 248);
      doc.roundedRect(158, 18, pageWidth - 188, 64, 14, 14, "F");
      doc.setTextColor(45, 55, 72);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Relatório de Exibições", 178, 40);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(branding?.organizationName ?? "MDI 360", 178, 57);
      const subtitle = search.mediaLabel
        ? `Arquivo: ${search.mediaLabel}`
        : `Agrupado por ${groupLabel(search.group).toLowerCase()}`;
      doc.text(subtitle, 178, 72, { maxWidth: pageWidth - 220 });

      doc.setTextColor(45, 55, 72);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Informações totais de exibição", 30, 108);
      doc.text("Informações deste relatório", pageWidth / 2 + 25, 108);
      doc.setDrawColor(203, 213, 225);
      doc.setLineDashPattern([1, 2], 0);
      doc.line(30, 120, 30, 173);
      doc.line(pageWidth / 2 + 25, 120, pageWidth / 2 + 25, 173);
      doc.setLineDashPattern([], 0);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Total de exibições:", 44, 132);
      doc.text(`${daily?.rowLabel ?? (search.group === "device" ? "TV" : "Arquivo")}s no relatório:`, 44, 146);
      doc.text("Dias com exibição:", 44, 160);
      doc.text("Tempo total em tela:", 44, 174);
      doc.setFont("helvetica", "bold");
      doc.text(String(first.totalPlays), 150, 132);
      doc.text(String(daily?.rows.length ?? first.totalRows), 150, 146);
      doc.text(String(daily?.daysWithPlayback ?? "-"), 150, 160);
      doc.text(formatDuration(first.totalSeconds), 150, 174);

      const infoX = pageWidth / 2 + 39;
      doc.setFont("helvetica", "normal");
      doc.text("Código:", infoX, 132);
      doc.text("Gerado em:", infoX, 149);
      doc.text("Período:", infoX, 166);
      doc.setFont("helvetica", "bold");
      doc.text(code, infoX + 58, 132);
      doc.text(generatedAt.toLocaleString("pt-BR"), infoX + 58, 149);
      doc.text(period, infoX + 58, 166, { maxWidth: pageWidth / 2 - 125 });

      doc.setFontSize(12);
      doc.text(
        daily
          ? `Detalhes dos últimos ${Math.max(1, requestedDays - 1)} dias`
          : search.mediaLabel
            ? "Detalhes do arquivo"
            : "Detalhes do período",
        pageWidth / 2,
        201,
        { align: "center" },
      );

      if (daily) {
        const availableWidth = pageWidth - 60 - 120 - 54;
        const dayWidth = Math.max(17, Math.min(54, availableWidth / daily.days.length));
        const columnStyles: Record<
          number,
          { halign?: "left" | "center" | "right"; cellWidth?: number }
        > = { 0: { halign: "left", cellWidth: 120 } };
        daily.days.forEach((_, index) => {
          columnStyles[index + 1] = { halign: "center", cellWidth: dayWidth };
        });
        columnStyles[daily.days.length + 1] = { halign: "right", cellWidth: 54 };

        autoTable(doc, {
          startY: 218,
          margin: { left: 30, right: 30, bottom: 50 },
          head: [[daily.rowLabel, ...daily.days.map(formatPdfDay), "Total"]],
          body: daily.rows.map((row) => [
            row.label,
            ...daily.days.map((day) => String(row.values[day] ?? 0)),
            String(row.total),
          ]),
          foot: [[
            "Total",
            ...daily.days.map((day) => String(daily.totalsByDay[day] ?? 0)),
            String(daily.totalPlays),
          ]],
          showFoot: "lastPage",
          styles: {
            fontSize: daily.days.length > 15 ? 6.5 : 8.5,
            cellPadding: daily.days.length > 15 ? 2 : 5,
            textColor: [45, 55, 72],
            valign: "middle",
          },
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [45, 55, 72],
            fontStyle: "bold",
            halign: "center",
            lineColor: [148, 163, 184],
            lineWidth: 0.4,
          },
          alternateRowStyles: { fillColor: [247, 249, 251] },
          footStyles: { fillColor: accent, textColor: [15, 23, 42], fontStyle: "bold" },
          columnStyles,
        });
      } else {
        autoTable(doc, {
          startY: 218,
          margin: { left: 30, right: 30, bottom: 50 },
          head: [[groupLabel(search.group), "Exibições", "Tempo em tela"]],
          body: rows.map((row) => [row.label, String(row.plays), formatDuration(row.seconds)]),
          foot: [["Total", String(first.totalPlays), formatDuration(first.totalSeconds)]],
          showFoot: "lastPage",
          styles: { fontSize: 9, cellPadding: 6, textColor: [45, 55, 72] },
          headStyles: { fillColor: [45, 55, 72], textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: [247, 249, 251] },
          footStyles: { fillColor: accent, textColor: [15, 23, 42], fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: "auto" },
            1: { halign: "right", cellWidth: 100 },
            2: { halign: "right", cellWidth: 120 },
          },
        });
      }

      const documentPages = doc.getNumberOfPages();
      for (let pdfPage = 1; pdfPage <= documentPages; pdfPage += 1) {
        doc.setPage(pdfPage);
        doc.setDrawColor(203, 213, 225);
        doc.line(30, pageHeight - 31, pageWidth - 30, pageHeight - 31);
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`Relatório gerado em ${generatedAt.toLocaleString("pt-BR")} · ${code}`, 30, pageHeight - 17);
        doc.text(`${pdfPage} / ${documentPages}`, pageWidth - 30, pageHeight - 17, {
          align: "right",
        });
      }

      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = search.mediaLabel
        ? `relatorio-${search.mediaLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`
        : `relatorio-exibicao-${search.group}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
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
          <div
            className={
              group === "media"
                ? "grid gap-4 md:grid-cols-2 xl:grid-cols-[200px_280px_1fr_1fr_auto] xl:items-end"
                : "grid gap-4 md:grid-cols-[200px_1fr_1fr_auto] md:items-end"
            }
          >
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
            {group === "media" ? (
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <Select value={mediaAssetId} onValueChange={setMediaAssetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os arquivos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os arquivos</SelectItem>
                    {mediaOptions.data?.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
                  {report.data?.totalRows ?? 0} {search.group === "device" ? "telas" : "arquivos"}{" "}
                  no período
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
