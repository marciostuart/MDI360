import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Film,
  Image as ImageIcon,
  ListVideo,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { listMediaAssets } from "@/lib/media/media.functions";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  setPlaylistItems,
} from "@/lib/playlists/playlists.functions";

type DraftItem = {
  mediaAssetId: string;
  name: string;
  kind: "image" | "video" | "web";
  durationMs: number;
  isMuted: boolean;
};

function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

export function PlaylistManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPlaylists);
  const getFn = useServerFn(getPlaylist);
  const createFn = useServerFn(createPlaylist);
  const deleteFn = useServerFn(deletePlaylist);
  const saveItemsFn = useServerFn(setPlaylistItems);
  const mediaFn = useServerFn(listMediaAssets);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [pickerId, setPickerId] = useState<string>("");

  const playlists = useQuery({ queryKey: ["playlists"], queryFn: () => listFn({}) });
  const media = useQuery({ queryKey: ["media-assets"], queryFn: () => mediaFn({}) });

  const detail = useQuery({
    queryKey: ["playlist", selectedId],
    queryFn: () => getFn({ data: { playlistId: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!detail.data) return;
    setDraft(
      detail.data.items.map((item) => ({
        mediaAssetId: item.mediaAssetId,
        name: item.name,
        kind: item.kind,
        durationMs: item.durationMs,
        isMuted: item.isMuted,
      })),
    );
  }, [detail.data]);

  const createMutation = useMutation({
    mutationFn: (name: string) => createFn({ data: { name } }),
    onSuccess: async (result) => {
      setNewName("");
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setSelectedId(result.id);
      toast.success("Playlist criada.");
    },
    onError: () => toast.error("Não foi possível criar a playlist."),
  });

  const deleteMutation = useMutation({
    mutationFn: (playlistId: string) => deleteFn({ data: { playlistId } }),
    onSuccess: async () => {
      setSelectedId(null);
      setDraft([]);
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Playlist excluída.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveItemsFn({
        data: {
          playlistId: selectedId!,
          items: draft.map((item) => ({
            mediaAssetId: item.mediaAssetId,
            durationMs: item.durationMs,
            isMuted: item.isMuted,
          })),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      await queryClient.invalidateQueries({ queryKey: ["playlist", selectedId] });
      toast.success("Playlist publicada. As telas vão sincronizar em até 1 minuto.");
    },
    onError: () => toast.error("Não foi possível salvar a playlist."),
  });

  const readyMedia = (media.data?.items ?? []).filter((item) => item.status === "ready");

  function move(from: number, to: number) {
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setDraft(next);
  }

  function addItem() {
    const asset = readyMedia.find((item) => item.id === pickerId);
    if (!asset) return;
    setDraft((items) => [
      ...items,
      {
        mediaAssetId: asset.id,
        name: asset.name,
        kind: asset.kind,
        durationMs: asset.kind === "video" ? (asset.durationMs ?? 15000) : 10000,
        isMuted: true,
      },
    ]);
    setPickerId("");
  }

  if (playlists.data && !playlists.data.configured) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Conecte o banco de dados (DATABASE_URL) para usar as playlists.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Label htmlFor="playlist-name">Nova playlist</Label>
            <div className="flex gap-2">
              <Input
                id="playlist-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Ex.: Vitrine manhã"
              />
              <Button
                size="icon"
                onClick={() => createMutation.mutate(newName.trim())}
                disabled={newName.trim().length === 0 || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {playlists.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (playlists.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma playlist ainda. Crie a primeira acima.
            </p>
          ) : (
            playlists.data!.items.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => setSelectedId(playlist.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedId === playlist.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <p className="truncate text-sm font-medium">{playlist.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {playlist.itemCount} item(ns) · {formatDuration(playlist.totalDurationMs)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {!selectedId ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <ListVideo className="mx-auto mb-3 size-8 opacity-40" />
              Selecione uma playlist para montar a sequência.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Label>Adicionar conteúdo</Label>
                  <Select value={pickerId} onValueChange={setPickerId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Escolha um conteúdo da biblioteca" />
                    </SelectTrigger>
                    <SelectContent>
                      {readyMedia.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="secondary" onClick={addItem} disabled={!pickerId}>
                  <Plus className="size-4" />
                  Adicionar
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Publicar
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => deleteMutation.mutate(selectedId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {readyMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Envie conteúdos em “Conteúdos” para montar a playlist.
                </p>
              ) : null}

              <div className="space-y-2">
                {draft.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    A playlist está vazia. Adicione conteúdos e clique em Publicar.
                  </p>
                ) : (
                  draft.map((item, position) => (
                    <div
                      key={`${item.mediaAssetId}-${position}`}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                        {item.kind === "video" ? (
                          <Film className="size-4" />
                        ) : (
                          <ImageIcon className="size-4" />
                        )}
                      </span>
                      <div className="min-w-32 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          {item.kind === "video" ? "Vídeo" : "Imagem"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={600}
                          value={Math.round(item.durationMs / 1000)}
                          onChange={(event) =>
                            setDraft((items) =>
                              items.map((entry, i) =>
                                i === position
                                  ? {
                                      ...entry,
                                      durationMs:
                                        Math.max(1, Number(event.target.value) || 1) * 1000,
                                    }
                                  : entry,
                              ),
                            )
                          }
                          className="w-20"
                        />
                        <span className="text-xs text-muted-foreground">seg</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => move(position, position - 1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => move(position, position + 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() =>
                            setDraft((items) => items.filter((_, i) => i !== position))
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}