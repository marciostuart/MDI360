import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  CalendarClock,
  Loader2,
  RefreshCcw,
  Settings2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WidgetView } from "@/components/widgets/widget-view";
import { getMediaAssetDetails, renameMediaAsset } from "@/lib/media/media.functions";
import type { MediaListItem } from "@/lib/media/media.functions";
import { prepareUpload } from "@/lib/media/optimize-client";
import { formatBytes, getCanvasPreset } from "@/lib/media/presets";
import { getWidgetDefinition } from "@/lib/widgets/catalog";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number) {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : null, m ? `${m}min` : null, !h && s ? `${s}s` : null]
    .filter(Boolean)
    .join(" ");
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/** Rename + technical info. Tags/janela continuam na linha da biblioteca. */
function SettingsTab({ item }: { item: MediaListItem }) {
  const queryClient = useQueryClient();
  const renameFn = useServerFn(renameMediaAsset);
  const [name, setName] = useState(item.name);

  const rename = useMutation({
    mutationFn: () => renameFn({ data: { assetId: item.id, name: name.trim() } }),
    onSuccess: async () => {
      toast.success("Nome atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: () => toast.error("Não foi possível renomear este arquivo."),
  });

  return (
    <div className="space-y-5">
      <div className="max-w-md space-y-2">
        <Label htmlFor={`name-${item.id}`}>Nome do arquivo</Label>
        <div className="flex gap-2">
          <Input
            id={`name-${item.id}`}
            value={name}
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            disabled={rename.isPending || !name.trim() || name.trim() === item.name}
            onClick={() => rename.mutate()}
          >
            {rename.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Informações do arquivo
        </p>
        <InfoRow
          label="Tipo"
          value={
            item.kind === "widget"
              ? `Widget · ${getWidgetDefinition(item.widgetType ?? "clock").label}`
              : item.kind === "video"
                ? "Vídeo"
                : item.kind === "image"
                  ? "Imagem"
                  : item.kind === "stream"
                    ? "Transmissão (streaming)"
                    : "Página web"
          }
        />
        <InfoRow label="Formato da tela" value={getCanvasPreset(item.canvasPreset).label} />
        <InfoRow
          label="Resolução"
          value={item.width && item.height ? `${item.width} x ${item.height}` : "—"}
        />
        <InfoRow
          label="Duração"
          value={item.durationMs ? formatDuration(Math.round(item.durationMs / 1000)) : "—"}
        />
        <InfoRow label="Tamanho final" value={formatBytes(item.byteSize)} />
        <InfoRow label="Tamanho original" value={formatBytes(item.originalByteSize)} />
        <InfoRow label="Formato interno" value={item.mimeType ?? "—"} />
        <InfoRow label="Enviado em" value={formatDateTime(item.createdAt)} />
        <InfoRow
          label="Status"
          value={
            item.status === "ready" ? (
              <Badge>Pronto</Badge>
            ) : (
              <Badge variant="destructive">
                {item.status === "uploading" ? "Envio incompleto" : "Falhou"}
              </Badge>
            )
          }
        />
      </div>
    </div>
  );
}

/** Preview grande + substituição in-place (vale para todas as playlists). */
function ReplaceTab({ item, onDone }: { item: MediaListItem; onDone: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading" | "processing">("idle");
  const [percent, setPercent] = useState(0);

  const replaceable = item.kind === "image" || item.kind === "video";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      setPhase("preparing");
      setPercent(0);
      const prepared = await prepareUpload(file, getCanvasPreset(item.canvasPreset));
      if (prepared.kind !== item.kind) {
        throw new Error(
          item.kind === "video"
            ? "Este item é um vídeo: envie outro vídeo."
            : "Este item é uma imagem: envie outra imagem.",
        );
      }

      const form = new FormData();
      form.append("assetId", item.id);
      form.append("kind", prepared.kind);
      form.append("width", String(prepared.width));
      form.append("height", String(prepared.height));
      form.append("durationMs", String(prepared.durationMs ?? 0));
      form.append("originalByteSize", String(prepared.originalBytes));
      form.append("file", prepared.blob, `${item.id}.${prepared.extension}`);

      setPhase("uploading");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/media/replace");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setPercent(Math.min(99, Math.round((event.loaded / event.total) * 100)));
          }
        };
        xhr.upload.onload = () => {
          setPercent(100);
          setPhase("processing");
        };
        xhr.onerror = () => reject(new Error("Falha de rede ao enviar o arquivo."));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          let message = `Falha na substituição (HTTP ${xhr.status}).`;
          try {
            const payload = JSON.parse(xhr.responseText) as { error?: string };
            if (payload?.error) message = payload.error;
          } catch {
            // resposta não-JSON
          }
          reject(new Error(message));
        };
        xhr.send(form);
      });

      toast.success("Arquivo substituído em todas as playlists.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      setPhase("idle");
      setPercent(0);
      onDone();
    } catch (error) {
      setPhase("idle");
      setPercent(0);
      toast.error(error instanceof Error ? error.message : "Falha na substituição.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-4">
      <div className="grid max-h-[52vh] min-h-[240px] place-items-center overflow-hidden rounded-xl bg-secondary">
        {item.kind === "image" && item.previewUrl ? (
          <img src={item.previewUrl} alt={item.name} className="max-h-[52vh] w-full object-contain" />
        ) : item.kind === "video" && item.previewUrl ? (
          <video src={item.previewUrl} controls className="max-h-[52vh] w-full" />
        ) : item.kind === "widget" && item.widgetConfig ? (
          <WidgetView config={item.widgetConfig} />
        ) : item.kind === "stream" && item.sourceUrl ? (
          <div className="space-y-2 p-10 text-center text-sm text-muted-foreground">
            <p>Conteúdo reproduzido por streaming, sem download na TV.</p>
            <p className="break-all font-mono text-xs">{item.sourceUrl}</p>
          </div>
        ) : (
          <p className="p-10 text-sm text-muted-foreground">
            Não foi possível pré-visualizar este arquivo.
          </p>
        )}
      </div>

      {replaceable ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
          <div>
            <p className="text-sm font-medium">Substituir arquivo</p>
            <p className="mt-1 text-xs text-muted-foreground">
              O novo arquivo assume o lugar deste em <strong>todas as playlists</strong>, sem
              precisar editar nenhuma delas. As TVs baixam a nova versão automaticamente e apagam a
              antiga do cache.
            </p>
          </div>
          {busy ? (
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    phase === "processing" ? "bg-amber-500" : "bg-primary"
                  }`}
                  style={{ width: `${phase === "preparing" ? 4 : percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {phase === "preparing"
                  ? "Preparando arquivo"
                  : phase === "uploading"
                    ? `Enviando · ${percent}%`
                    : "Otimizando arquivo"}
              </p>
            </div>
          ) : (
            <Button variant="outline" className="gap-2" onClick={() => inputRef.current?.click()}>
              <UploadCloud className="size-4" /> Escolher novo arquivo
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={
              item.kind === "video"
                ? "video/mp4,video/webm"
                : "image/jpeg,image/png,image/webp"
            }
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Widgets e páginas web não são substituídos por upload — use a opção de personalizar.
        </p>
      )}
    </div>
  );
}

function StatsTab({ item }: { item: MediaListItem }) {
  const detailsFn = useServerFn(getMediaAssetDetails);
  const details = useQuery({
    queryKey: ["media-details", item.id],
    queryFn: () => detailsFn({ data: { assetId: item.id } }),
  });

  if (details.isPending) {
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = details.data;
  if (!data) return <p className="text-sm text-muted-foreground">Sem dados disponíveis.</p>;

  const maxDaily = Math.max(1, ...data.daily.map((day) => day.plays));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Exibições", value: String(data.totalPlays) },
          { label: "Tempo no ar", value: formatDuration(data.totalSeconds) },
          { label: "Primeira exibição", value: formatDateTime(data.firstPlayedAt) },
          { label: "Última exibição", value: formatDateTime(data.lastPlayedAt) },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-sm font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos 14 dias
        </p>
        {data.daily.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma exibição registrada no período.</p>
        ) : (
          <div className="flex h-28 items-end gap-1.5">
            {data.daily.map((day) => (
              <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, (day.plays / maxDaily) * 100)}%` }}
                  title={`${day.plays} exibições em ${new Date(day.day).toLocaleDateString("pt-BR")}`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {new Date(day.day).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Por TV
          </p>
          {data.byDevice.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem exibições.</p>
          ) : (
            data.byDevice.map((row) => (
              <InfoRow
                key={row.id}
                label={row.label}
                value={`${row.plays} · ${formatDuration(row.seconds)}`}
              />
            ))
          )}
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Por playlist
          </p>
          {data.byPlaylist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem exibições.</p>
          ) : (
            data.byPlaylist.map((row) => (
              <InfoRow
                key={row.id}
                label={row.label}
                value={`${row.plays} · ${formatDuration(row.seconds)}`}
              />
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="size-3.5" /> Playlists que usam este arquivo
        </p>
        {data.usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este arquivo ainda não foi adicionado a nenhuma playlist.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.usage.map((row) => (
              <Badge key={`${row.id}-${row.position}`} variant="secondary">
                {row.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Modal aberto ao clicar no nome do arquivo, com as três abas de opções. */
export function MediaDetailsDialog({
  item,
  open,
  onOpenChange,
}: {
  item: MediaListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{item.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="settings">
          <TabsList className="flex-wrap">
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings2 className="size-4" /> Configurações e Informações
            </TabsTrigger>
            <TabsTrigger value="replace" className="gap-1.5">
              <RefreshCcw className="size-4" /> Visualizar / Substituir
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <BarChart3 className="size-4" /> Estatísticas do Arquivo
            </TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="pt-4">
            <SettingsTab item={item} />
          </TabsContent>
          <TabsContent value="replace" className="pt-4">
            <ReplaceTab item={item} onDone={() => onOpenChange(false)} />
          </TabsContent>
          <TabsContent value="stats" className="pt-4">
            <StatsTab item={item} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
