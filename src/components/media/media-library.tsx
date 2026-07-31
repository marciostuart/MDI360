import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  CalendarClock,
  Film,
  Gauge,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WidgetComposer } from "@/components/widgets/widget-composer";
import { WidgetView } from "@/components/widgets/widget-view";
import {
  createMediaUploadTicket,
  deleteMediaAsset,
  listMediaAssets,
  setMediaAirWindow,
} from "@/lib/media/media.functions";
import type { MediaListItem } from "@/lib/media/media.functions";
import { prepareUpload } from "@/lib/media/optimize-client";
import {
  CANVAS_PRESETS,
  DEFAULT_CANVAS_PRESET,
  formatBytes,
  getCanvasPreset,
} from "@/lib/media/presets";
import { getWidgetDefinition } from "@/lib/widgets/catalog";

type UploadPhase = "preparing" | "uploading" | "optimizing" | "done" | "error";

type UploadProgressItem = {
  id: string;
  name: string;
  phase: UploadPhase;
  percent: number;
  message?: string;
};

const PHASE_LABEL: Record<UploadPhase, string> = {
  preparing: "Preparando arquivo",
  uploading: "Enviando",
  optimizing: "Otimizando arquivo",
  done: "Concluído",
  error: "Falhou",
};

/** ISO instant -> value accepted by <input type="datetime-local"> (hora local). */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function formatWindowLabel(start: string | null, end: string | null) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `A partir de ${fmt(start)}`;
  if (end) return `Até ${fmt(end)}`;
  return null;
}

/**
 * Per-file airing window: a flash offer only plays inside the chosen date/time
 * range, in every playlist it was added to.
 */
function AirWindowEditor({ item }: { item: MediaListItem }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(setMediaAirWindow);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(toLocalInput(item.airStartAt));
  const [end, setEnd] = useState(toLocalInput(item.airEndAt));

  const save = useMutation({
    mutationFn: (payload: { airStartAt: string | null; airEndAt: string | null }) =>
      saveFn({ data: { assetId: item.id, ...payload } }),
    onSuccess: async () => {
      toast.success("Janela de veiculação atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: () => toast.error("Verifique as datas: o fim precisa ser depois do início."),
  });

  const label = formatWindowLabel(item.airStartAt, item.airEndAt);
  const now = Date.now();
  const isFuture = item.airStartAt ? new Date(item.airStartAt).getTime() > now : false;
  const isExpired = item.airEndAt ? new Date(item.airEndAt).getTime() < now : false;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" />
          {label ? (
            <span>{label}</span>
          ) : (
            <span>Sempre disponível</span>
          )}
          {label && isFuture ? <Badge variant="outline">Agendado</Badge> : null}
          {label && isExpired ? <Badge variant="destructive">Encerrado</Badge> : null}
          {label && !isFuture && !isExpired ? <Badge>No ar</Badge> : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? "Fechar" : label ? "Editar janela" : "Agendar"}
        </Button>
      </div>

      {open ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`start-${item.id}`} className="text-xs">
                Início
              </Label>
              <Input
                id={`start-${item.id}`}
                type="datetime-local"
                className="mt-1"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`end-${item.id}`} className="text-xs">
                Fim
              </Label>
              <Input
                id={`end-${item.id}`}
                type="datetime-local"
                className="mt-1"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Fora desta janela o arquivo é ignorado em todas as playlists. Deixe em branco para
            exibir sempre.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  airStartAt: start ? new Date(start).toISOString() : null,
                  airEndAt: end ? new Date(end).toISOString() : null,
                })
              }
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar janela
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending || (!item.airStartAt && !item.airEndAt)}
              onClick={() => {
                setStart("");
                setEnd("");
                save.mutate({ airStartAt: null, airEndAt: null });
              }}
            >
              Remover agendamento
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Uploads through XHR (instead of fetch) purely so the browser gives us real
 * byte-level progress events to drive the bar.
 */
function uploadWithProgress(
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.upload.onload = () => onProgress(100);
    xhr.onerror = () => reject(new Error("Falha de rede ao enviar o arquivo."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `Falha ao enviar o arquivo (HTTP ${xhr.status}).`;
      try {
        const payload = JSON.parse(xhr.responseText) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        // resposta não-JSON: mantém a mensagem genérica
      }
      reject(new Error(message));
    };
    xhr.send(form);
  });
}

export function MediaLibrary() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMediaAssets);
  const ticketFn = useServerFn(createMediaUploadTicket);
  const deleteFn = useServerFn(deleteMediaAsset);

  const [presetId, setPresetId] = useState(DEFAULT_CANVAS_PRESET.id);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<UploadProgressItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const library = useQuery({ queryKey: ["media-assets"], queryFn: () => listFn({}) });

  const removeMutation = useMutation({
    mutationFn: (assetId: string) => deleteFn({ data: { assetId } }),
    onSuccess: async () => {
      toast.success("Conteúdo removido.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: () => toast.error("Não foi possível remover este conteúdo."),
  });

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const preset = getCanvasPreset(presetId);
    setBusy(true);

    const queue = Array.from(files).map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
    }));

    setUploads(
      queue.map(({ file, id }) => ({ id, name: file.name, phase: "preparing", percent: 0 })),
    );

    const patch = (id: string, next: Partial<UploadProgressItem>) =>
      setUploads((current) =>
        current.map((item) => (item.id === id ? { ...item, ...next } : item)),
      );

    for (const { file, id } of queue) {
      try {
        patch(id, { phase: "preparing", percent: 0 });
        const prepared = await prepareUpload(file, preset);
        const ticket = await ticketFn({
          data: {
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "Sem nome",
            kind: prepared.kind,
            mimeType: prepared.mimeType,
            extension: prepared.extension as "webp" | "mp4" | "webm",
            byteSize: prepared.blob.size,
            originalByteSize: prepared.originalBytes,
            width: prepared.width,
            height: prepared.height,
            durationMs: prepared.durationMs,
            canvasPreset: preset.id,
          },
        });

        // O arquivo sobe pelo nosso servidor, que fala com o MinIO pela rede
        // interna. Assim não dependemos de CORS no navegador e conseguimos
        // mostrar o erro real quando o armazenamento recusa o arquivo.
        const form = new FormData();
        form.append("assetId", ticket.assetId);
        form.append("file", prepared.blob, `${ticket.assetId}.${prepared.extension}`);

        patch(id, { phase: "uploading", percent: 0 });
        await uploadWithProgress(form, (percent) => {
          patch(id, { phase: percent >= 100 ? "optimizing" : "uploading", percent });
        });
        // O servidor ainda converte/grava o arquivo depois do último byte:
        // a barra fica cheia em "Otimizando arquivo" até a resposta chegar.
        patch(id, { phase: "done", percent: 100 });

        const saved = prepared.originalBytes - prepared.blob.size;
        toast.success(
          saved > 0
            ? `${file.name} enviado (${formatBytes(saved)} economizados).`
            : `${file.name} enviado.`,
        );
        prepared.notes.forEach((note) => toast.info(note));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha no envio.";
        patch(id, { phase: "error", percent: 100, message });
        toast.error(message);
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  const items = library.data?.items ?? [];
  const storageMissing = library.data && !library.data.storageReady;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Conteúdos</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Envie imagens e vídeos. Cada arquivo é otimizado para o formato da tela antes de ir para o
          seu MinIO, e as telas baixam por links temporários.
        </p>
      </div>

      {storageMissing ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="pt-6 text-sm">
            O armazenamento ainda não está conectado. Configure as variáveis{" "}
            <code className="rounded bg-background/60 px-1">S3_*</code> do MinIO para liberar os
            uploads.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="max-w-sm space-y-2">
            <Label>Formato da tela</Label>
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANVAS_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {getCanvasPreset(presetId).description}
            </p>
          </div>

          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center transition-colors hover:border-primary/60">
            <span className="grid size-12 place-items-center rounded-xl bg-secondary text-muted-foreground">
              {busy ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <UploadCloud className="size-6" />
              )}
            </span>
            <span className="font-display text-base font-semibold">
              {busy ? "Otimizando e enviando..." : "Escolher arquivos"}
            </span>
            <span className="max-w-md text-xs text-muted-foreground">
              JPG, PNG e WebP até 40 MB (reduzidos automaticamente para o formato escolhido). MP4 ou
              WebM até 400 MB e 10 minutos.
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              className="hidden"
              disabled={busy || Boolean(storageMissing)}
              onChange={(event) => handleFiles(event.target.files)}
            />
          </label>

          {uploads.length > 0 ? (
            <div className="space-y-3">
              {uploads.map((item) => {
                const barColor =
                  item.phase === "error"
                    ? "bg-destructive"
                    : item.phase === "optimizing"
                      ? "bg-amber-500"
                      : item.phase === "done"
                        ? "bg-emerald-500"
                        : "bg-primary";
                return (
                  <div key={item.id} className="space-y-1.5 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                        {item.phase === "optimizing" ? (
                          <Sparkles className="size-3.5 animate-pulse text-amber-500" />
                        ) : item.phase === "done" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : item.phase === "error" ? (
                          <XCircle className="size-3.5 text-destructive" />
                        ) : (
                          <Loader2 className="size-3.5 animate-spin" />
                        )}
                        {PHASE_LABEL[item.phase]}
                        {item.phase === "uploading" ? ` · ${item.percent}%` : null}
                      </span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-secondary"
                      role="progressbar"
                      aria-valuenow={item.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${PHASE_LABEL[item.phase]} — ${item.name}`}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${item.phase === "preparing" ? 4 : item.percent}%` }}
                      />
                    </div>
                    {item.message ? (
                      <p className="text-xs text-destructive">{item.message}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <WidgetComposer />

      {library.isPending ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum conteúdo por aqui ainda. Envie o primeiro arquivo acima.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="grid aspect-video place-items-center bg-secondary">
                {item.kind === "widget" && item.widgetConfig ? (
                  <WidgetView config={item.widgetConfig} />
                ) : item.kind === "image" && item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="size-full object-contain"
                    loading="lazy"
                  />
                ) : item.kind === "video" && item.previewUrl ? (
                  <video src={item.previewUrl} muted controls className="size-full object-contain" />
                ) : item.kind === "video" ? (
                  <Film className="size-8 text-muted-foreground" />
                ) : item.kind === "widget" ? (
                  <Gauge className="size-8 text-muted-foreground" />
                ) : (
                  <ImageIcon className="size-8 text-muted-foreground" />
                )}
              </div>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    onClick={() => removeMutation.mutate(item.id)}
                    disabled={removeMutation.isPending}
                    aria-label={`Remover ${item.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.kind === "widget" ? (
                    <Badge variant="secondary">
                      Widget · {getWidgetDefinition(item.widgetType ?? "clock").label}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{getCanvasPreset(item.canvasPreset).label}</Badge>
                  )}
                  {item.width && item.height ? (
                    <Badge variant="outline">
                      {item.width}x{item.height}
                    </Badge>
                  ) : null}
                  {item.kind === "widget" ? null : (
                    <Badge variant="outline">{formatBytes(item.byteSize)}</Badge>
                  )}
                  {item.status !== "ready" ? (
                    <Badge variant="destructive">
                      {item.status === "uploading" ? "Envio incompleto" : "Falhou"}
                    </Badge>
                  ) : null}
                </div>
                {item.originalByteSize && item.byteSize && item.originalByteSize > item.byteSize ? (
                  <p className="text-xs text-muted-foreground">
                    Original {formatBytes(item.originalByteSize)} → otimizado{" "}
                    {formatBytes(item.byteSize)}
                  </p>
                ) : null}
                <AirWindowEditor item={item} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}