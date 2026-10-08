import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Film,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Newspaper,
  ListVideo,
  Save,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MediaListItem } from "@/lib/media/media.functions";
import { listMediaAssets } from "@/lib/media/media.functions";
import {
  getPlaylist,
  listPlaylists,
  setPlaylistItems,
  updatePlaylist,
} from "@/lib/playlists/playlists.functions";
import type { ScheduleRule } from "@/lib/schedules/rules";

type DraftItem = {
  /** Unique per row so the same asset can appear many times in one playlist. */
  rowId: string;
  mediaAssetId: string | null;
  nestedPlaylistId: string | null;
  scheduleRules: ScheduleRule[];
  name: string;
  kind: MediaListItem["kind"] | "playlist";
  widgetType: string | null;
  durationMs: number;
  isMuted: boolean;
};

const DRAG_ASSET = "application/x-mdi-asset";
const DRAG_ROW = "application/x-mdi-row";

/** Entretenimento = conteúdo editorial; Ferramentas = utilidades da tela. */
const ENTERTAINMENT_WIDGETS = new Set(["news", "lottery"]);

function bucketOf(item: MediaListItem): "files" | "fun" | "tools" {
  if (item.kind !== "widget") return "files";
  return ENTERTAINMENT_WIDGETS.has(item.widgetType ?? "") ? "fun" : "tools";
}

function kindIcon(kind: MediaListItem["kind"] | "playlist", widgetType: string | null) {
  if (kind === "playlist") return <ListVideo className="size-4 shrink-0 text-primary" />;
  if (kind === "video" || kind === "stream")
    return <Film className="size-4 shrink-0 text-muted-foreground" />;
  if (kind === "widget")
    return ENTERTAINMENT_WIDGETS.has(widgetType ?? "") ? (
      <Newspaper className="size-4 shrink-0 text-muted-foreground" />
    ) : (
      <Wrench className="size-4 shrink-0 text-muted-foreground" />
    );
  return <ImageIcon className="size-4 shrink-0 text-muted-foreground" />;
}

function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

let rowCounter = 0;
function nextRowId() {
  rowCounter += 1;
  return `row-${rowCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function PlaylistEditorDialog({
  playlistId,
  playlistName,
  open,
  onOpenChange,
}: {
  playlistId: string;
  playlistName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const getFn = useServerFn(getPlaylist);
  const mediaFn = useServerFn(listMediaAssets);
  const playlistsFn = useServerFn(listPlaylists);
  const saveItemsFn = useServerFn(setPlaylistItems);
  const renameFn = useServerFn(updatePlaylist);

  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [name, setName] = useState(playlistName);
  const [search, setSearch] = useState("");
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const detail = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => getFn({ data: { playlistId } }),
    enabled: open,
  });
  const media = useQuery({
    queryKey: ["media-assets"],
    queryFn: () => mediaFn({}),
    enabled: open,
  });
  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: () => playlistsFn(),
    enabled: open,
  });

  useEffect(() => setName(playlistName), [playlistName]);

  useEffect(() => {
    if (!detail.data) return;
    setDraft(
      detail.data.items.map((item) => ({
        rowId: nextRowId(),
        mediaAssetId: item.mediaAssetId,
        nestedPlaylistId: item.nestedPlaylistId,
        scheduleRules: item.scheduleRules,
        name: item.name,
        kind: item.kind,
        widgetType: item.widgetType,
        durationMs: item.durationMs,
        isMuted: item.isMuted,
      })),
    );
  }, [detail.data]);

  const readyMedia = useMemo(
    () => (media.data?.items ?? []).filter((item) => item.status === "ready"),
    [media.data],
  );

  const term = search.trim().toLowerCase();
  const filtered = readyMedia.filter(
    (item) =>
      !term ||
      item.name.toLowerCase().includes(term) ||
      item.tags.some((tag) => tag.includes(term)),
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (name.trim() && name.trim() !== playlistName) {
        await renameFn({ data: { playlistId, name: name.trim() } });
      }
      await saveItemsFn({
        data: {
          playlistId,
          items: draft.map((item) => ({
            mediaAssetId: item.mediaAssetId,
            nestedPlaylistId: item.nestedPlaylistId,
            scheduleRules: item.scheduleRules,
            durationMs: item.durationMs,
            isMuted: item.isMuted,
          })),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      await queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      toast.success("Lista publicada. As telas vão sincronizar em instantes.");
    },
    onError: () => toast.error("Não foi possível salvar a lista."),
  });

  function insertAsset(assetId: string, index: number) {
    const asset = readyMedia.find((item) => item.id === assetId);
    if (!asset) return;
    const entry: DraftItem = {
      rowId: nextRowId(),
      mediaAssetId: asset.id,
      nestedPlaylistId: null,
      scheduleRules: [],
      name: asset.name,
      kind: asset.kind,
      widgetType: asset.widgetType,
      durationMs:
        asset.kind === "video" || asset.kind === "stream" || asset.kind === "widget"
          ? (asset.durationMs ?? (asset.kind === "widget" ? 10000 : 15000))
          : 10000,
      isMuted: true,
    };
    setDraft((items) => {
      const next = [...items];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, entry);
      return next;
    });
  }

  function insertPlaylist(id: string) {
    const item = playlists.data?.items.find((entry) => entry.id === id);
    if (!item || item.id === playlistId) return;
    setDraft((items) => [
      ...items,
      {
        rowId: nextRowId(),
        mediaAssetId: null,
        nestedPlaylistId: item.id,
        scheduleRules: [],
        name: item.name,
        kind: "playlist",
        widgetType: null,
        durationMs: Math.max(item.totalDurationMs, 1000),
        isMuted: true,
      },
    ]);
  }

  function moveRow(rowId: string, index: number) {
    setDraft((items) => {
      const from = items.findIndex((item) => item.rowId === rowId);
      if (from < 0) return items;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      const target = from < index ? index - 1 : index;
      next.splice(Math.min(Math.max(target, 0), next.length), 0, moved!);
      return next;
    });
  }

  function handleDrop(event: React.DragEvent, index: number) {
    event.preventDefault();
    setDropIndex(null);
    const assetId = event.dataTransfer.getData(DRAG_ASSET);
    if (assetId) {
      insertAsset(assetId, index);
      return;
    }
    const rowId = event.dataTransfer.getData(DRAG_ROW);
    if (rowId) moveRow(rowId, index);
  }

  const totalMs = draft.reduce((sum, item) => sum + item.durationMs, 0);

  function renderLibrary(bucket: "files" | "fun" | "tools") {
    const items = filtered.filter((item) => bucketOf(item) === bucket);
    if (items.length === 0) {
      return (
        <p className="px-1 py-6 text-sm text-muted-foreground">
          {bucket === "files"
            ? "Nenhum arquivo disponível. Envie conteúdos em “Conteúdos”."
            : "Nada por aqui ainda. Crie widgets na página de Conteúdos."}
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_ASSET, item.id);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => insertAsset(item.id, draft.length)}
            className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-card p-2.5 active:cursor-grabbing hover:border-primary/50"
            title="Arraste para a lista (ou dê duplo clique)"
          >
            <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
            {kindIcon(item.kind, item.widgetType)}
            <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
            {item.kind === "video" && item.durationMs ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {formatDuration(item.durationMs)}
              </Badge>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl overflow-hidden p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="space-y-3 border-b border-border p-6 pb-4 text-left">
            <DialogTitle className="sr-only">Gerenciar lista {playlistName}</DialogTitle>
            <DialogDescription className="sr-only">
              Arraste conteúdos da esquerda para a lista à direita.
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-10 max-w-sm text-base font-semibold"
                aria-label="Nome da lista"
              />
              <Badge variant="secondary">
                {draft.length} item(ns) · {formatDuration(totalMs)}
              </Badge>
              <div className="ml-auto">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Publicar
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
            <div className="flex min-h-0 flex-col border-border p-5 md:border-r">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Pesquisar conteúdo"
                  className="pl-9"
                  aria-label="Pesquisar conteúdo disponível"
                />
              </div>
              <Tabs defaultValue="files" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="w-full">
                  <TabsTrigger value="files" className="flex-1">
                    Arquivos
                  </TabsTrigger>
                  <TabsTrigger value="fun" className="flex-1">
                    <Sparkles className="size-3.5" />
                    Entretenimento
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="flex-1">
                    Ferramentas
                  </TabsTrigger>
                </TabsList>
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                  <TabsContent value="files">{renderLibrary("files")}</TabsContent>
                  <TabsContent value="fun">{renderLibrary("fun")}</TabsContent>
                  <TabsContent value="tools">{renderLibrary("tools")}</TabsContent>
                  <TabsContent value="tools">
                    <div className="mt-3 border-t pt-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Lista de reprodução (sublista)
                      </p>
                      {(playlists.data?.items ?? [])
                        .filter((item) => item.id !== playlistId)
                        .map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => insertPlaylist(item.id)}
                            className="mb-2 flex w-full items-center gap-2 rounded-lg border p-2.5 text-left hover:border-primary/50"
                          >
                            <ListVideo className="size-4 text-primary" />
                            <span className="truncate text-sm">{item.name}</span>
                          </button>
                        ))}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <div className="flex min-h-0 flex-col p-5">
              <p className="mb-3 text-sm font-medium">Conteúdo da lista</p>
              <div
                className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-dashed border-border p-3"
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draft.length === 0) setDropIndex(0);
                }}
                onDrop={(event) => handleDrop(event, draft.length)}
              >
                {detail.isPending ? (
                  <div className="grid place-items-center py-10">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : draft.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Arraste os conteúdos da esquerda para cá. A ordem em que você soltar é a ordem
                    de exibição.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.map((item, position) => (
                      <div key={item.rowId}>
                        <div
                          className={`h-1 rounded-full transition-colors ${
                            dropIndex === position ? "bg-primary" : "bg-transparent"
                          }`}
                        />
                        <div
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(DRAG_ROW, item.rowId);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            const box = event.currentTarget.getBoundingClientRect();
                            const after = event.clientY > box.top + box.height / 2;
                            setDropIndex(after ? position + 1 : position);
                          }}
                          onDragLeave={() => setDropIndex(null)}
                          onDrop={(event) => {
                            event.stopPropagation();
                            const box = event.currentTarget.getBoundingClientRect();
                            const after = event.clientY > box.top + box.height / 2;
                            handleDrop(event, after ? position + 1 : position);
                          }}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5"
                        >
                          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/60" />
                          <span className="w-5 shrink-0 text-xs text-muted-foreground">
                            {position + 1}
                          </span>
                          {kindIcon(item.kind, item.widgetType)}
                          <span className="min-w-24 flex-1 truncate text-sm">{item.name}</span>
                          {item.kind === "playlist" ? (
                            <SublistRuleEditor
                              rules={item.scheduleRules}
                              name={item.name}
                              onChange={(scheduleRules) =>
                                setDraft((items) =>
                                  items.map((entry) =>
                                    entry.rowId === item.rowId
                                      ? { ...entry, scheduleRules }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          ) : null}
                          {item.kind === "video" ? (
                            <Badge variant="secondary" className="shrink-0">
                              {Math.max(1, Math.round(item.durationMs / 1000))}s
                            </Badge>
                          ) : item.widgetType === "lottery" ? (
                            <Badge variant="secondary" className="shrink-0">
                              ciclo completo · {formatDuration(item.durationMs)}
                            </Badge>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={1}
                                max={600}
                                value={Math.round(item.durationMs / 1000)}
                                onChange={(event) =>
                                  setDraft((items) =>
                                    items.map((entry) =>
                                      entry.rowId === item.rowId
                                        ? {
                                            ...entry,
                                            durationMs:
                                              Math.max(1, Number(event.target.value) || 1) * 1000,
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                className="h-8 w-16"
                                aria-label={`Duração de ${item.name}`}
                              />
                              <span className="text-xs text-muted-foreground">seg</span>
                            </div>
                          )}
                          {item.kind === "video" ? (
                            <Button
                              size="icon"
                              variant={item.isMuted ? "outline" : "secondary"}
                              className="size-8"
                              onClick={() =>
                                setDraft((items) =>
                                  items.map((entry) =>
                                    entry.rowId === item.rowId
                                      ? { ...entry, isMuted: !entry.isMuted }
                                      : entry,
                                  ),
                                )
                              }
                              title={item.isMuted ? "Sem som" : "Com som"}
                            >
                              {item.isMuted ? (
                                <VolumeX className="size-3.5" />
                              ) : (
                                <Volume2 className="size-3.5" />
                              )}
                            </Button>
                          ) : null}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive"
                            onClick={() =>
                              setDraft((items) =>
                                items.filter((entry) => entry.rowId !== item.rowId),
                              )
                            }
                            aria-label={`Remover ${item.name} da lista`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div
                      className={`h-2 rounded-full transition-colors ${
                        dropIndex === draft.length ? "bg-primary" : "bg-transparent"
                      }`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropIndex(draft.length);
                      }}
                      onDrop={(event) => handleDrop(event, draft.length)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SUBLIST_WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const toTime = (value = 0) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const fromTime = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};
function newSublistRule(type: ScheduleRule["type"] = "daily_time"): ScheduleRule {
  const today = new Date().toISOString().slice(0, 10);
  if (type === "weekdays")
    return { type, weekdays: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1080 };
  if (type === "month_day") return { type, day: 1 };
  if (type === "month") return { type, month: 1 };
  if (type === "specific_date_time")
    return { type, date: today, startMinute: 480, endMinute: 1080 };
  if (type === "date_time_range")
    return {
      type,
      startAt: new Date(`${today}T08:00`).toISOString(),
      endAt: new Date(`${today}T18:00`).toISOString(),
    };
  return { type: "daily_time", startMinute: 480, endMinute: 1080 };
}

function SublistRuleEditor({
  rules,
  name,
  onChange,
}: {
  rules: ScheduleRule[];
  name: string;
  onChange: (rules: ScheduleRule[]) => void;
}) {
  const patch = (index: number, value: Partial<ScheduleRule>) =>
    onChange(
      rules.map((rule, position) =>
        position === index ? ({ ...rule, ...value } as ScheduleRule) : rule,
      ),
    );
  return (
    <div className="w-full space-y-2 rounded-md bg-muted/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {rules.length ? "Ativa se qualquer regra for válida" : "Sempre ativa"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onChange([...rules, newSublistRule()])}
        >
          + Regra
        </Button>
      </div>
      {rules.map((rule, index) => (
        <div key={index} className="flex flex-wrap items-center gap-1 border-t pt-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={rule.type}
            onChange={(event) =>
              onChange(
                rules.map((item, position) =>
                  position === index
                    ? newSublistRule(event.target.value as ScheduleRule["type"])
                    : item,
                ),
              )
            }
            aria-label={`Regra ${index + 1} de ${name}`}
          >
            <option value="daily_time">Horário diário</option>
            <option value="weekdays">Dias da semana</option>
            <option value="month_day">Dia do mês</option>
            <option value="month">Mês</option>
            <option value="specific_date_time">Data específica</option>
            <option value="date_time_range">Período</option>
          </select>
          {["daily_time", "weekdays", "specific_date_time"].includes(rule.type) ? (
            <>
              <Input
                type="time"
                className="h-8 w-28 text-xs"
                value={toTime(rule.startMinute)}
                onChange={(event) => patch(index, { startMinute: fromTime(event.target.value) })}
              />
              <Input
                type="time"
                className="h-8 w-28 text-xs"
                value={toTime(rule.endMinute ?? 1440)}
                onChange={(event) => patch(index, { endMinute: fromTime(event.target.value) })}
              />
            </>
          ) : null}
          {rule.type === "weekdays" ? (
            <div className="flex gap-1">
              {SUBLIST_WEEKDAYS.map((label, day) => (
                <Button
                  key={day}
                  type="button"
                  size="icon"
                  variant={(rule.weekdays ?? []).includes(day) ? "default" : "outline"}
                  className="size-7 text-[10px]"
                  onClick={() =>
                    patch(index, {
                      weekdays: (rule.weekdays ?? []).includes(day)
                        ? (rule.weekdays ?? []).filter((value) => value !== day)
                        : [...(rule.weekdays ?? []), day],
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : null}
          {rule.type === "specific_date_time" ? (
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={rule.date ?? ""}
              onChange={(event) => patch(index, { date: event.target.value })}
            />
          ) : null}
          {rule.type === "month_day" ? (
            <Input
              type="number"
              min={1}
              max={31}
              className="h-8 w-20 text-xs"
              value={rule.day ?? 1}
              onChange={(event) => patch(index, { day: Number(event.target.value) })}
            />
          ) : null}
          {rule.type === "month" ? (
            <Input
              type="number"
              min={1}
              max={12}
              className="h-8 w-20 text-xs"
              value={rule.month ?? 1}
              onChange={(event) => patch(index, { month: Number(event.target.value) })}
            />
          ) : null}
          {rule.type === "date_time_range" ? (
            <>
              <Input
                type="datetime-local"
                className="h-8 w-48 text-xs"
                value={rule.startAt ? new Date(rule.startAt).toISOString().slice(0, 16) : ""}
                onChange={(event) =>
                  patch(index, {
                    startAt: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : undefined,
                  })
                }
              />
              <Input
                type="datetime-local"
                className="h-8 w-48 text-xs"
                value={rule.endAt ? new Date(rule.endAt).toISOString().slice(0, 16) : ""}
                onChange={(event) =>
                  patch(index, {
                    endAt: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : undefined,
                  })
                }
              />
            </>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-destructive"
            onClick={() => onChange(rules.filter((_, position) => position !== index))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
