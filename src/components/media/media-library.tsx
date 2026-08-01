import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  CalendarClock,
  Eye,
  Film,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  UploadCloud,
  Youtube,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MediaDetailsDialog } from "@/components/media/media-details-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WidgetView } from "@/components/widgets/widget-view";
import {
  createMediaUploadTicket,
  deleteMediaAsset,
  listMediaAssets,
  setMediaAirWindow,
  setMediaTags,
} from "@/lib/media/media.functions";
import type { MediaListItem } from "@/lib/media/media.functions";
import { prepareUpload } from "@/lib/media/optimize-client";
import { importYoutubeVideo } from "@/lib/media/youtube.functions";
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
          {label ? <span>{label}</span> : <span>Sempre disponível</span>}
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

/** Editable tag chips for one file. Tags drive the library filter. */
function TagEditor({ item }: { item: MediaListItem }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(setMediaTags);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const save = useMutation({
    mutationFn: (tags: string[]) => saveFn({ data: { assetId: item.id, tags } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: () => toast.error("Não foi possível salvar as tags."),
  });

  const commit = () => {
    const value = draft.trim().toLowerCase();
    setDraft("");
    setAdding(false);
    if (!value || item.tags.includes(value)) return;
    save.mutate([...item.tags, value]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TagIcon className="size-3.5 text-muted-foreground" />
      {item.tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            aria-label={`Remover tag ${tag}`}
            className="text-muted-foreground transition-colors hover:text-destructive"
            onClick={() => save.mutate(item.tags.filter((entry) => entry !== tag))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {adding ? (
        <Input
          autoFocus
          value={draft}
          placeholder="nova tag"
          className="h-7 w-32 text-xs"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => setAdding(true)}
          disabled={save.isPending}
        >
          <Plus className="size-3" /> tag
        </Button>
      )}
    </div>
  );
}

/**
 * Thumbnail on the right side of each row. When a real thumb cannot be
 * rendered (video without poster, widget, storage offline) it degrades to a
 * "Preview" button. Both open the same fullscreen modal.
 */
function MediaPreview({ item }: { item: MediaListItem }) {
  const [open, setOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const canThumb =
    !thumbFailed &&
    ((item.kind === "image" && Boolean(item.previewUrl)) ||
      (item.kind === "video" && Boolean(item.previewUrl)) ||
      (item.kind === "widget" && Boolean(item.widgetConfig)));

  return (
    <>
      {canThumb ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Pré-visualizar ${item.name}`}
          className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-secondary transition-colors hover:border-primary/60"
        >
          {item.kind === "image" ? (
            <img
              src={item.previewUrl!}
              alt={item.name}
              loading="lazy"
              className="size-full object-cover"
              onError={() => setThumbFailed(true)}
            />
          ) : item.kind === "video" ? (
            <video
              src={item.previewUrl!}
              muted
              preload="metadata"
              playsInline
              className="size-full object-cover"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <div className="pointer-events-none size-full origin-top-left scale-[0.14] [height:457px] [width:800px]">
              <WidgetView config={item.widgetConfig!} />
            </div>
          )}
        </button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Eye className="size-4" /> Preview
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[96vw] border-none bg-background/95 p-2 sm:max-w-[92vw]">
          <DialogTitle className="px-2 text-sm font-medium">{item.name}</DialogTitle>
          <div className="grid max-h-[85vh] min-h-[50vh] place-items-center overflow-hidden rounded-lg bg-secondary">
            {item.kind === "image" && item.previewUrl ? (
              <img
                src={item.previewUrl}
                alt={item.name}
                className="max-h-[85vh] w-full object-contain"
              />
            ) : item.kind === "video" && item.previewUrl ? (
              <video src={item.previewUrl} controls autoPlay className="max-h-[85vh] w-full" />
            ) : item.kind === "widget" && item.widgetConfig ? (
              <WidgetView config={item.widgetConfig} />
            ) : (
              <p className="p-10 text-sm text-muted-foreground">
                Não foi possível pré-visualizar este arquivo.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Nome do arquivo como botão: abre o painel de opções em abas. */
function MediaNameButton({ item }: { item: MediaListItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="truncate text-left text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
        title={`Abrir opções de ${item.name}`}
      >
        {item.name}
      </button>
      {open ? <MediaDetailsDialog item={item} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

/**
 * Uploads through XHR (instead of fetch) purely so the browser gives us real
 * byte-level progress events to drive the bar.
 */
function uploadWithProgress(form: FormData, onProgress: (percent: number) => void): Promise<void> {
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
  /** Timers da animação de otimização + auto-dismiss das barras concluídas. */
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const importYoutube = useServerFn(importYoutubeVideo);

  const library = useQuery({
    queryKey: ["media-assets"],
    queryFn: () => listFn({}),
    // Enquanto houver importação do YouTube em andamento, a lista se atualiza
    // sozinha até o vídeo ficar pronto.
    refetchInterval: (query) =>
      (query.state.data?.items ?? []).some(
        (item) => item.kind === "video" && item.status === "uploading" && item.sourceUrl,
      )
        ? 5000
        : false,
  });

  const youtubeMutation = useMutation({
    mutationFn: (url: string) => importYoutube({ data: { url, canvasPreset: presetId } }),
    onSuccess: async () => {
      setYoutubeUrl("");
      toast.success("Importando do YouTube. O vídeo aparece pronto em alguns minutos.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o vídeo."),
  });

  // Nunca deixa timers de animação/auto-dismiss vivos após sair da página.
  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => clearInterval(timer));
      timersRef.current = [];
    },
    [],
  );

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

    /**
     * O ffmpeg roda dentro da mesma requisição HTTP, então não existe um canal
     * de progresso real vindo do servidor. Estimamos o tempo pelo tamanho do
     * arquivo e avançamos a barra âmbar de forma assintótica (nunca chega a
     * 100% sozinha) — quando a resposta chega, ela completa em verde.
     */
    const startOptimizingAnimation = (id: string, byteSize: number, isVideo: boolean) => {
      const estimateMs = isVideo
        ? Math.min(Math.max((byteSize / (1.6 * 1024 * 1024)) * 1000, 4000), 180000)
        : 1500;
      const startedAt = Date.now();
      patch(id, { phase: "optimizing", percent: 0 });
      const timer = setInterval(() => {
        const ratio = (Date.now() - startedAt) / estimateMs;
        // Curva que desacelera: 96% é o teto enquanto a resposta não volta.
        const percent = Math.min(96, Math.round(96 * (1 - Math.exp(-2.2 * ratio))));
        patch(id, { percent });
      }, 250);
      timersRef.current.push(timer);
      return () => {
        clearInterval(timer);
        timersRef.current = timersRef.current.filter((entry) => entry !== timer);
      };
    };

    /** Barra verde cheia por alguns segundos e depois a caixa volta ao normal. */
    const scheduleDismiss = (id: string) => {
      const timer = setTimeout(() => {
        setUploads((current) => current.filter((item) => item.id !== id));
      }, 4000) as unknown as ReturnType<typeof setInterval>;
      timersRef.current.push(timer);
    };

    for (const { file, id } of queue) {
      const stopper: { fn: (() => void) | null } = { fn: null };
      // Guardamos o id do "ticket" para poder descartar a reserva caso o envio
      // falhe: nada de linha fantasma no painel nem espaço preso no MinIO.
      let ticketAssetId: string | null = null;
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
        ticketAssetId = ticket.assetId;

        // O arquivo sobe pelo nosso servidor, que fala com o MinIO pela rede
        // interna. Assim não dependemos de CORS no navegador e conseguimos
        // mostrar o erro real quando o armazenamento recusa o arquivo.
        const form = new FormData();
        form.append("assetId", ticket.assetId);
        form.append("file", prepared.blob, `${ticket.assetId}.${prepared.extension}`);

        patch(id, { phase: "uploading", percent: 0 });
        await uploadWithProgress(form, (percent) => {
          if (percent >= 100) {
            if (!stopper.fn) {
              stopper.fn = startOptimizingAnimation(
                id,
                prepared.blob.size,
                prepared.kind === "video",
              );
            }
            return;
          }
          patch(id, { phase: "uploading", percent });
        });
        stopper.fn?.();
        patch(id, { phase: "done", percent: 100 });
        scheduleDismiss(id);

        const saved = prepared.originalBytes - prepared.blob.size;
        toast.success(
          saved > 0
            ? `${file.name} enviado (${formatBytes(saved)} economizados).`
            : `${file.name} enviado.`,
        );
        prepared.notes.forEach((note) => toast.info(note));
      } catch (error) {
        stopper.fn?.();
        if (ticketAssetId) {
          try {
            await deleteFn({ data: { assetId: ticketAssetId } });
          } catch {
            // melhor esforço: o servidor também limpa a reserva nos erros dele
          }
        }
        const message = error instanceof Error ? error.message : "Falha no envio.";
        patch(id, { phase: "error", percent: 100, message });
        toast.error(message);
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  // Widgets têm página exclusiva (/studio/widgets) e não aparecem nesta biblioteca.
  const items = (library.data?.items ?? []).filter((item) => item.kind !== "widget");
  const storageMissing = library.data && !library.data.storageReady;

  const allTags = Array.from(new Set(items.flatMap((item) => item.tags))).sort();
  const term = search.trim().toLowerCase();
  const visibleItems = items
    .filter((item) => {
      const matchesTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.tags.some((tag) => tag.includes(term));
      const matchesTag = tagFilter === "all" || item.tags.includes(tagFilter);
      return matchesTerm && matchesTag;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortBy === "oldest" ? diff : -diff;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Conteúdos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Envie imagens e vídeos. Cada arquivo é otimizado para o formato da tela antes de ir para
            o armazenamento, e as telas baixam por links temporários. Use tags para organizar e
            encontrar seus arquivos rapidamente.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowUpload((value) => !value)}>
          <UploadCloud className="size-4" />
          {showUpload ? "Fechar envio" : "Enviar novos arquivos"}
        </Button>
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

      {showUpload || uploads.length > 0 ? (
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
            <p className="text-xs text-muted-foreground">{getCanvasPreset(presetId).description}</p>
          </div>

          {/* Vídeo do YouTube: o servidor baixa e converte para MP4, então a TV
              reproduz um arquivo comum — sem controles, título, tela final ou
              vídeos sugeridos, e com o áudio seguindo a configuração do item. */}
          <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/30 p-4">
            <Label className="flex items-center gap-2">
              <Youtube className="size-4 text-destructive" />
              Vídeo do YouTube
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="max-w-md"
              />
              <Button
                variant="secondary"
                className="gap-2"
                disabled={!youtubeUrl.trim() || youtubeMutation.isPending}
                onClick={() => youtubeMutation.mutate(youtubeUrl.trim())}
              >
                {youtubeMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Importar vídeo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O vídeo é baixado e convertido no servidor (até 10 minutos de duração). Na TV ele toca
              como um arquivo seu: sem controles, sem título, sem tela final e sem sugestões — e fica
              em cache no aparelho até ser removido daqui.
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
                        {item.phase === "uploading" || item.phase === "optimizing"
                          ? ` · ${item.percent}%`
                          : null}
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
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por nome ou tag"
            className="pl-9"
            aria-label="Pesquisar conteúdos"
          />
        </div>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[190px]" aria-label="Filtrar por tag">
            <SelectValue placeholder="Todas as tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tags</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
          <SelectTrigger className="w-[210px]" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Envio mais recente</SelectItem>
            <SelectItem value="oldest">Envio mais antigo</SelectItem>
            <SelectItem value="name">Nome (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {library.isPending ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum conteúdo por aqui ainda. Envie o primeiro arquivo pelo botão acima.
        </p>
      ) : visibleItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum conteúdo encontrado com esses filtros.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visibleItems.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start gap-4 p-4">
              <div className="min-w-[220px] flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {item.kind === "video" ? (
                    <Film className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <MediaNameButton item={item} />
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
                  <Badge variant="outline">
                    {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                  </Badge>
                  {item.status !== "ready" ? (
                    <Badge
                      variant={
                        item.status === "uploading" && item.sourceUrl ? "secondary" : "destructive"
                      }
                    >
                      {item.status === "uploading"
                        ? item.sourceUrl
                          ? "Importando do YouTube..."
                          : "Envio incompleto"
                        : "Falhou"}
                    </Badge>
                  ) : null}
                </div>
                <TagEditor item={item} />
                <AirWindowEditor item={item} />
              </div>

              <div className="flex items-center gap-2">
                <MediaPreview item={item} />
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
